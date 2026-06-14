import { run, withTrace, type Agent, type NonStreamRunOptions, type RunResult } from '@openai/agents';
import {
  createAgents,
  createDiffAgents,
  type ArchitectureDiagramOutput,
  type DiffAnalysis,
  type ReadmeSuggestion,
} from './agents.js';
import { composeReadmeWithArchitecture, removeMarkdownSection } from './markdown-sections.js';
import { ReadmeWorkspace, createReadmeWorkspaceTools } from './readme-workspace.js';
import { stripFences } from './readme-utils.js';
import * as fs from 'node:fs';
import * as log from './logger.js';

export interface WorkflowStats {
  toolCallCount: number;
  toolCallsByAgent: Record<string, number>;
  toolCallsByTool: Record<string, number>;
}

const AGENT_RUN_MAX_RETRIES = 5;
const AGENT_RUN_BASE_DELAY_MS = 2_000;
const AGENT_RUN_MAX_DELAY_MS = 60_000;

function isRetryableAgentRunError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate limit|connection error|connection failed|timed out|timeout|\b5\d\d\b/i.test(msg);
}

function retryDelayMs(error: unknown, attempt: number): number {
  const msg = error instanceof Error ? error.message : String(error);
  const retryAfterMatch = msg.match(/try again in ([\d.]+)\s*(ms|milliseconds?|s|seconds?)/i);
  if (retryAfterMatch) {
    const value = Number(retryAfterMatch[1]);
    const unit = retryAfterMatch[2]?.toLowerCase() ?? 'ms';
    if (Number.isFinite(value)) {
      return Math.min(
        unit.startsWith('s') ? value * 1000 : value,
        AGENT_RUN_MAX_DELAY_MS,
      );
    }
  }

  const exponential = Math.min(
    AGENT_RUN_BASE_DELAY_MS * 2 ** (attempt - 1),
    AGENT_RUN_MAX_DELAY_MS,
  );
  const jitter = Math.floor(Math.random() * 500);
  return exponential + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAgentWithRetry<TAgent extends Agent<any, any>>(
  agent: TAgent,
  input: string,
  options: NonStreamRunOptions<undefined, TAgent>,
  label: string,
): Promise<RunResult<undefined, TAgent>> {
  for (let attempt = 1; attempt <= AGENT_RUN_MAX_RETRIES + 1; attempt++) {
    try {
      return await run(agent, input, options);
    } catch (error) {
      if (attempt > AGENT_RUN_MAX_RETRIES || !isRetryableAgentRunError(error)) {
        throw error;
      }
      const delay = retryDelayMs(error, attempt);
      log.warn(`${label} hit a retryable OpenAI error; retrying in ${(delay / 1000).toFixed(1)}s (${attempt}/${AGENT_RUN_MAX_RETRIES})`);
      await sleep(delay);
    }
  }

  throw new Error(`${label} failed after retries`);
}

function summarizeToolCall(name: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    switch (name) {
      case 'list_directory': return (args.path as string) ?? '.';
      case 'read_file':      return args.path as string;
      case 'search_code':    return `"${args.pattern as string}"${args.glob ? ` in ${args.glob as string}` : ''}`;
      case 'get_structure':  return args.path as string;
      case 'gitDiffStat':    return `${args.fromRef as string}…${(args.toRef as string | undefined) ?? 'HEAD'}`;
      case 'gitLog':         return `${args.fromRef as string}…${(args.toRef as string | undefined) ?? 'HEAD'}`;
      case 'gitDiff':        return `${(args.fromRef as string | undefined) ?? 'origin/main'}…${(args.toRef as string | undefined) ?? 'HEAD'}`;
      case 'getReadmeTodo':  return 'README workspace';
      case 'getNextTodoSection': return 'next README section';
      case 'getCurrentTodoSection': return 'current README section';
      case 'saveReadmeSection': return args.status as string;
      case 'validateReadmeWorkspace': return 'assembled README';
      default:               return '';
    }
  } catch {
    return '';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attachToolLogger(agent: Agent<unknown, any>, agentName: string, stats: WorkflowStats): void {
  agent.on('agent_tool_start', (_ctx, _tool, details) => {
    const tc = details.toolCall;
    if (tc.type !== 'function_call') return;
    const summary = summarizeToolCall(tc.name, tc.arguments);
    log.toolCall(`→ ${tc.name}${summary ? `  ${summary}` : ''}`);
    stats.toolCallCount += 1;
    stats.toolCallsByAgent[agentName] = (stats.toolCallsByAgent[agentName] ?? 0) + 1;
    stats.toolCallsByTool[tc.name] = (stats.toolCallsByTool[tc.name] ?? 0) + 1;
  });
}

export interface DiffWorkflowOptions {
  model: string;
  inputFile: string;
  baseRef: string;
  headRef: string;
  verbose?: boolean;
}

export interface DiffWorkflowResult {
  significant: boolean;
  analysis: DiffAnalysis;
  suggestions?: ReadmeSuggestion;
  noExcerptsFound?: boolean;
}

export async function runDiffWorkflow(
  options: DiffWorkflowOptions,
): Promise<DiffWorkflowResult> {
  const { model, inputFile, baseRef, headRef } = options;

  const { diffAnalyzer, readmePatcher } = createDiffAgents(model);
  const _diffStats: WorkflowStats = { toolCallCount: 0, toolCallsByAgent: {}, toolCallsByTool: {} };
  attachToolLogger(diffAnalyzer, 'DiffAnalyzer', _diffStats);
  attachToolLogger(readmePatcher, 'ReadmePatcher', _diffStats);

  return withTrace('ReReadme Diff Workflow', async () => {
    // Step 1: DiffAnalyzer classifies the changes
    log.verboseStep(`Step 1/2: DiffAnalyzer (${baseRef}...${headRef})`);
    const step1 = await runAgentWithRetry(
      diffAnalyzer,
      `Analyze the git diff between '${baseRef}' and '${headRef}'. Determine whether the changes warrant a README update and classify what changed.`,
      { maxTurns: 50 },
      'DiffAnalyzer',
    );
    if (!step1.finalOutput) {
      throw new Error('DiffAnalyzer produced no output');
    }
    const analysis = step1.finalOutput;
    log.verboseStep(`DiffAnalyzer done (significant=${analysis.significant}, level=${analysis.signalLevel})`);

    if (!analysis.significant) {
      return { significant: false, analysis };
    }

    // Step 2: ReadmePatcher generates surgical suggestions
    log.verboseStep('Step 2/2: ReadmePatcher');
    const currentReadme = fs.existsSync(inputFile)
      ? fs.readFileSync(inputFile, 'utf-8')
      : '(no README found)';

    const patcherPrompt = `Here is the diff analysis:\n\`\`\`json\n${JSON.stringify(analysis, null, 2)}\n\`\`\`\n\nHere is the current README content:\n\`\`\`\n${currentReadme}\n\`\`\`\n\nGenerate README-suggestions.md with targeted suggestions for updating the README based on the analysis.`;

    const step2 = await runAgentWithRetry(readmePatcher, patcherPrompt, { maxTurns: 10 }, 'ReadmePatcher');
    if (!step2.finalOutput) {
      throw new Error('ReadmePatcher produced no output');
    }
    if (step2.finalOutput.changes.length === 0) {
      // Patcher found nothing to patch despite a significant diff
      log.verboseStep('ReadmePatcher done (0 changes — no matching README excerpts found)');
      return { significant: false, analysis, noExcerptsFound: true };
    }
    log.verboseStep(`ReadmePatcher done (${step2.finalOutput.changes.length} changes)`);

    return {
      significant: true,
      analysis,
      suggestions: step2.finalOutput,
    };
  });
}

export interface AgentWorkflowOptions {
  model: string;
  readmeTemplate: string;
  agentsTemplate?: string;
  includeArchitecture?: boolean;
  verbose?: boolean;
}

export async function runAgentWorkflow(
  options: AgentWorkflowOptions,
): Promise<{ readme: string; agents?: string; stats: WorkflowStats }> {
  const { model, readmeTemplate, agentsTemplate, includeArchitecture = true } = options;

  const readmeWorkspace = new ReadmeWorkspace(readmeTemplate, { optionalHeadings: ['## Architecture'] });
  const templateHasArchitecture = readmeWorkspace.hasSection('## Architecture');
  const readmeWorkspaceTools = Object.values(createReadmeWorkspaceTools(readmeWorkspace));
  const { agentsDocWriter, architectureDiagramAgent, readmeWriter } = createAgents(
    model,
    readmeTemplate,
    agentsTemplate,
    readmeWorkspaceTools,
  );
  const stats: WorkflowStats = { toolCallCount: 0, toolCallsByAgent: {}, toolCallsByTool: {} };
  if (includeArchitecture) attachToolLogger(architectureDiagramAgent, 'ArchitectureDiagramAgent', stats);
  attachToolLogger(readmeWriter, 'ReadmeWriter', stats);
  if (agentsDocWriter) attachToolLogger(agentsDocWriter, 'AgentsDocWriter', stats);

  // README pipeline: optional ArchitectureDiagramAgent for ## Architecture → ReadmeWriter workspace tools → deterministic assembly → (AgentsDocWriter?)
  const { readme, agents } = await withTrace('ReReadme Agent Workflow', async () => {
    log.verboseStep(`Generating README (model: ${model})`);
    let architecture: ArchitectureDiagramOutput | undefined;
    if (includeArchitecture) {
      log.detail('ArchitectureDiagramAgent started');
      const result = await runAgentWithRetry(
        architectureDiagramAgent,
        'Analyze this repository and produce the README Architecture section decision.',
        { maxTurns: 25 },
        'ArchitectureDiagramAgent',
      );
      if (!result.finalOutput) {
        throw new Error('ArchitectureDiagramAgent produced no output');
      }
      architecture = result.finalOutput;
      log.detail(
        `ArchitectureDiagramAgent complete (diagram=${architecture.includeDiagram ? 'yes' : 'no'}, facts=${architecture.sourceFacts.length})`,
      );
      if (templateHasArchitecture && architecture.sectionMarkdown.trim().length > 0) {
        readmeWorkspace.completeSectionByHeading(
          '## Architecture',
          stripFences(architecture.sectionMarkdown),
          architecture.rationale,
        );
      } else if (templateHasArchitecture) {
        readmeWorkspace.omitSectionByHeading('## Architecture', architecture.rationale);
      }
    } else {
      log.detail('ArchitectureDiagramAgent skipped (--no-architecture)');
      if (templateHasArchitecture) {
        readmeWorkspace.omitSectionByHeading('## Architecture', 'Architecture generation disabled by --no-architecture.');
      }
    }

    log.detail('ReadmeWriter started');
    const readmeResult = await runAgentWithRetry(
      readmeWriter,
      `Generate a README.md for this repository by completing the README todo workspace section by section.

Do one bounded discovery pass first:
- Call get_file_tree at most once.
- Call read_files for the manifest, entrypoints, config, templates, README/AGENTS docs, and quality/eval files you need.
- Keep notes from that discovery in your own context.

Then iterate through the README todo sections in order. For each section, use the facts already discovered whenever possible. Gather new context only when the active section asks for a concrete fact that is still missing, and prefer one targeted read_files/search_code call over broad rediscovery. Do not call get_file_tree again unless a prior call failed.

Do not produce the README from memory in your final response. Save each section with saveReadmeSection, then call validateReadmeWorkspace. The workflow will assemble the final README from the saved workspace sections.`,
      { maxTurns: 80 },
      'ReadmeWriter',
    );
    if (!readmeResult.finalOutput) {
      throw new Error('ReadmeWriter produced no output');
    }
    const validation = readmeWorkspace.validate();
    if (!validation.valid) {
      throw new Error(`README workspace validation failed:\n${validation.errors.join('\n')}`);
    }
    const architectureSection = includeArchitecture ? architecture?.sectionMarkdown.trim() ?? '' : '';
    const finalizedReadme = templateHasArchitecture
      ? validation.readme
      : architectureSection
        ? composeReadmeWithArchitecture(validation.readme, architectureSection)
        : removeMarkdownSection(validation.readme, 'Architecture');

    log.detail(`ReadmeWriter complete (${finalizedReadme.length} chars)`);

    log.detail(
      architectureSection
        ? 'Architecture section inserted'
        : 'Architecture section omitted',
    );

    // Optional: AgentsDocWriter generates AGENTS.md from the finalized README.
    if (agentsDocWriter) {
      log.verboseStep('Generating AGENTS.md');
      const initialAgentMdPrompt = `Generate an AGENTS.md for this repository using this finalized README as context:

\`\`\`markdown
${finalizedReadme}
\`\`\``;
      const step2 = await runAgentWithRetry(agentsDocWriter, initialAgentMdPrompt, { maxTurns: 40 }, 'AgentsDocWriter');
      if (!step2.finalOutput || step2.finalOutput.trim().length === 0) {
        throw new Error('AgentsDocWriter produced no output');
      }
      log.detail(`AgentsDocWriter complete (${step2.finalOutput.length} chars)`);
      return { readme: finalizedReadme, agents: step2.finalOutput };
    }

    return { readme: finalizedReadme, agents: undefined };
  });

  return {
    readme: stripFences(readme),
    agents: agents ? stripFences(agents) : undefined,
    stats,
  };
}
