import { run, withTrace } from '@openai/agents';
import { createAgents, createDiffAgents, type DiffAnalysis, type ReadmeSuggestion } from './agents.js';
import * as fs from 'node:fs';
import * as log from './logger.js';

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
}

export async function runDiffWorkflow(
  options: DiffWorkflowOptions,
): Promise<DiffWorkflowResult> {
  const { model, inputFile, baseRef, headRef } = options;

  const { diffAnalyzer, readmePatcher } = createDiffAgents(model);

  return withTrace('ReReadme Diff Workflow', async () => {
    // Step 1: DiffAnalyzer classifies the changes
    log.verboseStep(`Step 1/2: DiffAnalyzer (${baseRef}...${headRef})`);
    const step1 = await run(
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

    const step2 = await run(readmePatcher, patcherPrompt, { maxTurns: 10 });
    if (!step2.finalOutput) {
      throw new Error('ReadmePatcher produced no output');
    }
    if (step2.finalOutput.changes.length === 0) {
      // Patcher found nothing to change despite a significant diff — exit cleanly
      return { significant: false, analysis };
    }
    log.verboseStep(`ReadmePatcher done (${step2.finalOutput.changes.length} changes)`);

    return {
      significant: true,
      analysis,
      suggestions: step2.finalOutput,
    };
  });
}

export function applyPatches(original: string, suggestions: ReadmeSuggestion): string {
  let result = original
  for (const change of suggestions.changes) {
    if (result.includes(change.currentExcerpt)) {
      result = result.replace(change.currentExcerpt, change.suggestedReplacement)
    }
  }
  return result
}

export function renderSuggestions(s: ReadmeSuggestion, fullReadme?: string): string {
  const notifLevel = s.signalLevel === "high" ? '> [!CAUTION]' : s.signalLevel === "medium" ? '> [!WARNING]' : '> [!TIP]'
  const lines: string[] = []
  lines.push(notifLevel)
  lines.push(`> ${s.significanceReason}`)
  lines.push('')
  lines.push('## README Update Suggestions')
  lines.push('')
  for (const change of s.changes) {
    lines.push('')
    lines.push(`**Section:** ${change.sectionHeading.replaceAll('#', '').trim()}`)
    lines.push('')
    lines.push(`**Why:** ${change.reason}`)
    lines.push('')
    lines.push('```diff')
    for (const line of change.currentExcerpt.split('\n')) lines.push(`- ${line}`)
    for (const line of change.suggestedReplacement.split('\n')) lines.push(`+ ${line}`)
    lines.push('```')
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`*${s.summary}*`)
  if (fullReadme) {
    lines.push('')
    lines.push('<details>')
    lines.push('<summary>Full README (copy-paste ready)</summary>')
    lines.push('')
    lines.push('```markdown')
    lines.push(fullReadme.trim())
    lines.push('```')
    lines.push('')
    lines.push('</details>')
  }
  return lines.join('\n')
}

export interface AgentWorkflowOptions {
  model: string;
  readmeTemplate: string;
  agentsTemplate?: string;
  verbose?: boolean;
}

function stripFences(s: string): string {
  let cleaned = s.trim();
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.slice('```markdown'.length);
  } else if (cleaned.startsWith('```md')) {
    cleaned = cleaned.slice('```md'.length);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

export async function runAgentWorkflow(
  options: AgentWorkflowOptions,
): Promise<{ readme: string; agents?: string }> {
  const { model, readmeTemplate, agentsTemplate } = options;

  const { researcher, templateEnforcer, agentsDocWriter } = createAgents(model, readmeTemplate, agentsTemplate);

  const initialPrompt = 'Generate a README.md for this repository.';

  const totalSteps = agentsDocWriter ? 3 : 2;

  // Deterministic sequential pipeline: Researcher → TemplateEnforcer → (AgentsDocWriter?)
  const { readme, agents } = await withTrace('ReReadme Agent Workflow', async () => {
    // Step 1: Researcher explores repo structure and analyzes file contents
    log.verboseStep(`Step 1/${totalSteps}: Researcher (model: ${model})`);
    const step1 = await run(researcher, initialPrompt, { maxTurns: 70 });
    if (!step1.finalOutput || step1.finalOutput.trim().length === 0) {
      throw new Error('Researcher produced no output');
    }
    log.verboseStep(`Researcher done (${step1.finalOutput.length} chars)`);

    // Step 2: TemplateEnforcer generates the final README (may hand off to DetailFetcher)
    log.verboseStep(`Step 2/${totalSteps}: TemplateEnforcer`);
    const step2 = await run(templateEnforcer, step1.finalOutput, { maxTurns: 20 });
    if (!step2.finalOutput || step2.finalOutput.trim().length === 0) {
      throw new Error('TemplateEnforcer produced no output');
    }
    log.verboseStep(`TemplateEnforcer done (${step2.finalOutput.length} chars)`);

    // Step 3 (optional): AgentsDocWriter generates AGENTS.md from the same Researcher output
    if (agentsDocWriter) {
      log.verboseStep(`Step 3/${totalSteps}: AgentsDocWriter`);
      const step3 = await run(agentsDocWriter, step1.finalOutput, { maxTurns: 20 });
      if (!step3.finalOutput || step3.finalOutput.trim().length === 0) {
        throw new Error('AgentsDocWriter produced no output');
      }
      log.verboseStep(`AgentsDocWriter done (${step3.finalOutput.length} chars)`);
      return { readme: step2.finalOutput, agents: step3.finalOutput };
    }

    return { readme: step2.finalOutput, agents: undefined };
  });

  return {
    readme: stripFences(readme),
    agents: agents ? stripFences(agents) : undefined,
  };
}
