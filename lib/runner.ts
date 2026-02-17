import { run, withTrace } from '@openai/agents';
import { createAgents } from './agents.js';
import * as fs from 'node:fs';

export interface AgentWorkflowOptions {
  model: string;
  inputFile: string;
  readmeTemplate: string;
  verbose?: boolean;
}

export async function runAgentWorkflow(
  options: AgentWorkflowOptions,
): Promise<string> {
  const { model, inputFile, readmeTemplate, verbose } = options;

  const { researcher, templateEnforcer } = createAgents(model, readmeTemplate);

  // Build initial prompt with current README if it exists
  let initialPrompt = 'Generate a README.md for this repository.';

  if (fs.existsSync(inputFile)) {
    const currentReadme = fs.readFileSync(inputFile, 'utf-8');
    initialPrompt += `\n\nThe current README content is:\n\`\`\`\n${currentReadme}\n\`\`\`\n\nUpdate and improve this README based on what you discover in the repository.`;
  } else {
    initialPrompt +=
      '\n\nThere is no existing README. Create one from scratch based on what you discover in the repository.';
  }

  // Deterministic sequential pipeline: Researcher → TemplateEnforcer
  const output = await withTrace('ReReadme Agent Workflow', async () => {
    // Step 1: Researcher explores repo structure and analyzes file contents
    if (verbose) {
      console.log(`[agent] Step 1/2: Researcher (model: ${model})`);
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
      console.log(`[agent] Step 2/2: TemplateEnforcer`);
    }
    const step2 = await run(templateEnforcer, step1.finalOutput, { maxTurns: 20 });
    if (!step2.finalOutput || step2.finalOutput.trim().length === 0) {
      throw new Error('TemplateEnforcer produced no output');
    }
    if (verbose) {
      console.log(`[agent] TemplateEnforcer done (${step2.finalOutput.length} chars)`);
    }

    return step2.finalOutput;
  });

  // Strip markdown code fences if the model wrapped the output
  let cleaned = output.trim();
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
