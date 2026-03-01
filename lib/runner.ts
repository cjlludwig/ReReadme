import { run, withTrace } from '@openai/agents';
import { createAgents, createDiffAgents, type DiffAnalysis, type ReadmeSuggestion } from './agents.js';
import { stripFences } from './readme-utils.js';
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
  noExcerptsFound?: boolean;
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
  verbose?: boolean;
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
