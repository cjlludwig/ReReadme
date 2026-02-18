import { run, withTrace } from '@openai/agents';
import { createAgents } from './agents.js';
import * as fs from 'node:fs';

export interface AgentWorkflowOptions {
  model: string;
  inputFile: string;
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
  const { model, inputFile, readmeTemplate, agentsTemplate, verbose } = options;

  const { researcher, templateEnforcer, agentsDocWriter } = createAgents(model, readmeTemplate, agentsTemplate);

  // Build initial prompt with current README if it exists
  let initialPrompt = 'Generate a README.md for this repository.';

  if (fs.existsSync(inputFile)) {
    const currentReadme = fs.readFileSync(inputFile, 'utf-8');
    initialPrompt += `\n\nThe current README content is:\n\`\`\`\n${currentReadme}\n\`\`\`\n\nUpdate and improve this README based on what you discover in the repository.`;
  } else {
    initialPrompt +=
      '\n\nThere is no existing README. Create one from scratch based on what you discover in the repository.';
  }

  const totalSteps = agentsDocWriter ? 3 : 2;

  // Deterministic sequential pipeline: Researcher → TemplateEnforcer → (AgentsDocWriter?)
  const { readme, agents } = await withTrace('ReReadme Agent Workflow', async () => {
    // Step 1: Researcher explores repo structure and analyzes file contents
    if (verbose) {
      console.log(`[agent] Step 1/${totalSteps}: Researcher (model: ${model})`);
    }
    const step1 = await run(researcher, initialPrompt, { maxTurns: 70 });
    if (!step1.finalOutput || step1.finalOutput.trim().length === 0) {
      throw new Error('Researcher produced no output');
    }
    if (verbose) {
      console.log(`[agent] Researcher done (${step1.finalOutput.length} chars)`);
    }

    // Step 2: TemplateEnforcer generates the final README (may hand off to DetailFetcher)
    if (verbose) {
      console.log(`[agent] Step 2/${totalSteps}: TemplateEnforcer`);
    }
    const step2 = await run(templateEnforcer, step1.finalOutput, { maxTurns: 20 });
    if (!step2.finalOutput || step2.finalOutput.trim().length === 0) {
      throw new Error('TemplateEnforcer produced no output');
    }
    if (verbose) {
      console.log(`[agent] TemplateEnforcer done (${step2.finalOutput.length} chars)`);
    }

    // Step 3 (optional): AgentsDocWriter generates AGENTS.md from the same Researcher output
    if (agentsDocWriter) {
      if (verbose) {
        console.log(`[agent] Step 3/${totalSteps}: AgentsDocWriter`);
      }
      const step3 = await run(agentsDocWriter, step1.finalOutput, { maxTurns: 20 });
      if (!step3.finalOutput || step3.finalOutput.trim().length === 0) {
        throw new Error('AgentsDocWriter produced no output');
      }
      if (verbose) {
        console.log(`[agent] AgentsDocWriter done (${step3.finalOutput.length} chars)`);
      }
      return { readme: step2.finalOutput, agents: step3.finalOutput };
    }

    return { readme: step2.finalOutput, agents: undefined };
  });

  return {
    readme: stripFences(readme),
    agents: agents ? stripFences(agents) : undefined,
  };
}
