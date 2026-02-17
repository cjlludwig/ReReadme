import { run } from '@openai/agents';
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

  const { orchestrator } = createAgents(model, readmeTemplate);

  // Build initial prompt with current README if it exists
  let initialPrompt = 'Generate a README.md for this repository.';

  if (fs.existsSync(inputFile)) {
    const currentReadme = fs.readFileSync(inputFile, 'utf-8');
    initialPrompt += `\n\nThe current README content is:\n\`\`\`\n${currentReadme}\n\`\`\`\n\nUpdate and improve this README based on what you discover in the repository.`;
  } else {
    initialPrompt +=
      '\n\nThere is no existing README. Create one from scratch based on what you discover in the repository.';
  }

  if (verbose) {
    console.log(`[agent] Starting orchestrator with model: ${model}`);
    console.log(`[agent] Input file: ${inputFile}`);
  }

  const result = await run(orchestrator, initialPrompt, { maxTurns: 30 });

  if (verbose) {
    console.log(`[agent] Final agent: ${result.lastAgent?.name}`);
  }

  const output = result.finalOutput;

  if (!output || typeof output !== 'string' || output.trim().length === 0) {
    throw new Error('Agent workflow produced no output');
  }

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
