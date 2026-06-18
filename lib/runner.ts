import { Runner, retryPolicies, withTrace, type Agent, type RetryPolicy } from '@openai/agents';
import {
  createAgents,
  createDiffAgents,
  type ArchitectureDiagramOutput,
  type DiffAnalysis,
  type ReadmeSuggestion,
} from './agents.js';
import { composeReadmeWithArchitecture, removeMarkdownSection } from './markdown-sections.js';
import { stripFences } from './readme-utils.js';
import * as fs from 'node:fs';
import * as log from './logger.js';

export interface WorkflowStats {
  toolCallCount: number;
  toolCallsByAgent: Record<string, number>;
  toolCallsByTool: Record<string, number>;
}

/**
 * Builds the retry policy used for every model request.
 *
 * Composes the SDK's ready-made policies so transient failures — most importantly
 * org-level 429 rate limits, which are common in shared-org CI — are retried instead
 * of aborting the run. `providerSuggested` comes first so provider vetoes and
 * replay-safety signals are honored; `retryAfter` surfaces the provider's explicit
 * "try again in Ns" hint as the retry delay; `httpStatus` covers 429 plus transient
 * 5xx/408/409; `networkError` covers transport drops. The wrapper logs each retry
 * decision via {@link log.detail}, which is automatically gated behind `--verbose`.
 */
export function buildRetryPolicy(): RetryPolicy {
  const composed = retryPolicies.any(
    retryPolicies.providerSuggested(),
    retryPolicies.retryAfter(),
    retryPolicies.httpStatus([408, 409, 429, 500, 502, 503, 504]),
    retryPolicies.networkError(),
  );
  return async (context) => {
    const decision = await composed(context);
    const willRetry = typeof decision === 'boolean' ? decision : decision.retry;
    if (willRetry) {
      const status = context.normalized.statusCode ?? 'transport error';
      const explicitDelay = typeof decision === 'object' ? decision.delayMs : undefined;
      const waitMs = explicitDelay ?? context.normalized.retryAfterMs;
      const waitNote = waitMs ? `, waiting ~${Math.round(waitMs)}ms` : '';
      log.detail(
        `Retrying model request after ${status} (attempt ${context.attempt}/${context.maxRetries}${waitNote})`,
      );
    }
    return decision;
  };
}

/**
 * Shared runner instance reused across every workflow (per SDK guidance — create once,
 * reuse). Configures runner-level retry with exponential backoff + jitter; explicit
 * provider/`retry-after` delays are not capped by `backoff.maxDelayMs`, so short hints
 * like 1.6s are honored directly.
 */
const runner = new Runner({
  modelSettings: {
    retry: {
      maxRetries: 5,
      backoff: { initialDelayMs: 500, maxDelayMs: 8_000, multiplier: 2, jitter: true },
      policy: buildRetryPolicy(),
    },
  },
});

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
    const step1 = await runner.run(
      diffAnalyzer,
      `Analyze the git diff between '${baseRef}' and '${headRef}'. Determine whether the changes warrant a README update and classify what changed.`,
      { maxTurns: 50 },
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

    const step2 = await runner.run(readmePatcher, patcherPrompt, { maxTurns: 10 });
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

  const { agentsDocWriter, architectureDiagramAgent, readmeWriter } = createAgents(model, readmeTemplate, agentsTemplate);
  const stats: WorkflowStats = { toolCallCount: 0, toolCallsByAgent: {}, toolCallsByTool: {} };
  if (includeArchitecture) attachToolLogger(architectureDiagramAgent, 'ArchitectureDiagramAgent', stats);
  attachToolLogger(readmeWriter, 'ReadmeWriter', stats);
  if (agentsDocWriter) attachToolLogger(agentsDocWriter, 'AgentsDocWriter', stats);

  // README pipeline: optional ArchitectureDiagramAgent → ReadmeWriter → deterministic composition → (AgentsDocWriter?)
  const { readme, agents } = await withTrace('ReReadme Agent Workflow', async () => {
    log.verboseStep(`Generating README (model: ${model})`);
    let architecture: ArchitectureDiagramOutput | undefined;
    if (includeArchitecture) {
      log.detail('ArchitectureDiagramAgent started');
      const result = await runner.run(
        architectureDiagramAgent,
        'Analyze this repository and produce the README Architecture section decision.',
        { maxTurns: 25 },
      );
      if (!result.finalOutput) {
        throw new Error('ArchitectureDiagramAgent produced no output');
      }
      architecture = result.finalOutput;
      log.detail(
        `ArchitectureDiagramAgent complete (diagram=${architecture.includeDiagram ? 'yes' : 'no'}, facts=${architecture.sourceFacts.length})`,
      );
    } else {
      log.detail('ArchitectureDiagramAgent skipped (--no-architecture)');
    }

    log.detail('ReadmeWriter started');
    const readmeResult = await runner.run(
      readmeWriter,
      includeArchitecture
        ? `Generate a README.md for this repository.

The Architecture section is composed by the workflow after README generation. Omit ## Architecture from your output; if you include it, it will be replaced deterministically.`
        : `Generate a README.md for this repository. Omit ## Architecture from your output because architecture generation is disabled.`,
      { maxTurns: 40 },
    );
    if (!readmeResult.finalOutput || readmeResult.finalOutput.trim().length === 0) {
      throw new Error('ReadmeWriter produced no output');
    }
    log.detail(`ReadmeWriter complete (${readmeResult.finalOutput.length} chars)`);

    const generatedReadme = stripFences(readmeResult.finalOutput);
    const architectureSection = architecture?.sectionMarkdown.trim() ?? '';
    const readmeWithArchitecture = architectureSection
      ? composeReadmeWithArchitecture(generatedReadme, architectureSection)
      : removeMarkdownSection(generatedReadme, 'Architecture');

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
${readmeWithArchitecture}
\`\`\``;
      const step2 = await runner.run(agentsDocWriter, initialAgentMdPrompt, { maxTurns: 40 });
      if (!step2.finalOutput || step2.finalOutput.trim().length === 0) {
        throw new Error('AgentsDocWriter produced no output');
      }
      log.detail(`AgentsDocWriter complete (${step2.finalOutput.length} chars)`);
      return { readme: readmeWithArchitecture, agents: step2.finalOutput };
    }

    return { readme: readmeWithArchitecture, agents: undefined };
  });

  return {
    readme: stripFences(readme),
    agents: agents ? stripFences(agents) : undefined,
    stats,
  };
}
