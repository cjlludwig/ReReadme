import { Agent } from '@openai/agents';
import { RECOMMENDED_PROMPT_PREFIX } from '@openai/agents-core/extensions';
import { listDirectory, readFile, searchCode, getStructure } from './tools.js';

export function createAgents(model: string, readmeTemplate: string, agentsTemplate?: string) {
  // 2-agent pipeline: Researcher → TemplateEnforcer (with DetailFetcher handoff)
  // Optional Step 3: AgentsDocWriter when agentsTemplate is provided

  const detailFetcher = new Agent({
    name: 'DetailFetcher',
    model,
    instructions: `${RECOMMENDED_PROMPT_PREFIX} You are a lightweight retrieval agent. You receive a specific question about a repository and fetch only the information needed to answer it.

Rules:
- Use the tools to find the answer — do not guess or fabricate
- Return a concise, factual answer — no preamble or commentary
- Once you have the answer, hand off back to whichever agent called you with your findings`,
    tools: [listDirectory, readFile, searchCode, getStructure],
    handoffDescription:
      'Fetch a specific missing fact from the repository (e.g. a port number, an env var name, a dependency version)',
  });

  const templateEnforcer = new Agent({
    name: 'TemplateEnforcer',
    model,
    instructions: `${RECOMMENDED_PROMPT_PREFIX} You are a technical writer specializing in README documentation. Using the research summary provided in the conversation, generate a complete README.md file.

The template below is your single source of truth for structure, headers, and content guidance. Follow every instruction in it exactly.

README Template:
${readmeTemplate}

Additional rules:
- Use the exact, verbatim project name from the manifest "name" field (e.g. package.json "name") as the # title — do not humanize or rephrase it
- You MUST emit every heading from the template using exact markdown syntax. Do not skip or merge headings. The required headings are: ## Description, ## Getting Started, ### Dependencies, ### Installation, ## Usage, ## Architecture, ## References, ## Help
- Only include information that was discovered by the Researcher — do not fabricate content
- If a required section is missing specific facts (e.g. a port number, an env var, a dependency version), hand off to DetailFetcher to retrieve it. Limit yourself to 3 handoffs.
- Use clear, concise language for a developer audience
- DISTILL the research into polished README content. Strip all researcher artifacts: "File references:", "What I found:", source-file citations, notes-to-self, and any raw analysis scaffolding. The reader should see only clean documentation, never the research process.
- Do NOT repeat information across sections. Each fact belongs in exactly one section — place it where the template guidance says it goes.
- Your entire output must be ONLY the raw README markdown — no preamble, no closing commentary, no wrapping code fences`,
    tools: [readFile],
    handoffs: [detailFetcher],
    handoffDescription:
      'Write the final README using accumulated context',
  });

  // Optional Step 3: AgentsDocWriter (only when agentsTemplate is provided)
  const agentsDocWriter = agentsTemplate
    ? new Agent({
        name: 'AgentsDocWriter',
        model,
        instructions: `${RECOMMENDED_PROMPT_PREFIX} You are a technical writer specializing in AGENTS.md documentation. Using the research summary provided in the conversation, generate a complete AGENTS.md file.

The template below is your single source of truth for structure, headers, and content guidance. Follow every instruction in it exactly.

AGENTS.md Template:
${agentsTemplate}

Additional rules:
- Target < 100 lines in final output — every line must earn its place
- Only include information that was discovered by the Researcher — do not fabricate content
- Omit any section where nothing concrete was found
- If a required section is missing specific facts, hand off to DetailFetcher to retrieve it. Limit yourself to 3 handoffs.
- Your entire output must be ONLY the raw AGENTS.md markdown — no preamble, no closing commentary, no wrapping code fences`,
        tools: [readFile],
        handoffs: [detailFetcher],
        handoffDescription: 'Write the AGENTS.md using accumulated context',
      })
    : undefined;

  // Wire the return handoff: DetailFetcher → TemplateEnforcer (and AgentsDocWriter if present)
  detailFetcher.handoffs = agentsDocWriter
    ? [templateEnforcer, agentsDocWriter]
    : [templateEnforcer];

  const researcher = new Agent({
    name: 'Researcher',
    model,
    instructions: `${RECOMMENDED_PROMPT_PREFIX} You are a repository researcher. Your job is to explore the repository structure AND analyze file contents in a single pass. Work in two phases:

**Phase 1 — Explore structure**
Navigate the repository and identify key files:
- package.json, Cargo.toml, pyproject.toml, go.mod, or other manifest files
- Entry points and main source files
- Configuration files (tsconfig, webpack, docker, CI/CD)
- Container/dev environment configs (Dockerfile, docker-compose.yml, .devcontainer/)
- Test files and test configuration
- Documentation files

Start by listing the root directory, then explore important subdirectories including hidden directories like .devcontainer/.

**Phase 2 — Extract content**
Read the files you discovered and extract facts for the README. The template below is the single source of truth for what sections exist, what each section needs, and how the output will be organized. Each template section contains blockquote guidance describing the required content — use that as your checklist.

Do NOT invent your own sections or headings. Organize your findings under the exact headings from the template.

One additional extraction rule not in the template: the project title must be the exact "name" field from the manifest file (package.json, Cargo.toml, etc.) — do not humanize or rephrase it.

README Template:
${readmeTemplate}

When done, output your findings as a structured technical summary using the exact headings from the template above. Under each heading, list the specific facts you found and where you found them (file paths). Do not fabricate details — only report what you actually read.`,
    tools: [listDirectory, readFile, searchCode, getStructure],
    handoffDescription:
      'Explore repository structure and analyze file contents',
  });

  return { researcher, templateEnforcer, detailFetcher, agentsDocWriter };
}
