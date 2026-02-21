import { run, withTrace } from '@openai/agents';
import { createAgents } from './agents.js';
import * as log from './logger.js';

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
