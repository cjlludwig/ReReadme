import { Agent, type Tool } from '@openai/agents';
import { RECOMMENDED_PROMPT_PREFIX } from '@openai/agents-core/extensions';
import { z } from 'zod';
import { listDirectory, readFile, searchCode, getStructure, getFileTree, readFiles, gitDiff, gitLog, gitDiffStat } from './tools.js';

export const DiffAnalysisSchema = z.object({
  significant: z.boolean().describe('Whether this diff warrants a README update'),
  significanceReason: z.string().describe('One-sentence rationale for the significance decision'),
  affectedReadmeSections: z
    .array(z.string())
    .describe('Exact heading text of README sections that need updating (e.g. "## Usage")'),
  highSignalChanges: z
    .array(z.string())
    .describe('Concrete specifics of what changed (e.g. "new --timeout flag added to script.ts line 42")'),
  changeSummary: z
    .string()
    .describe('2–4 sentence plain-English summary of what changed'),
  signalLevel: z.enum(['high', 'medium', 'low']).describe('Overall signal level of the changes'),
});

export type DiffAnalysis = z.infer<typeof DiffAnalysisSchema>;

export const ReadmeSuggestionSchema = z.object({
  signalLevel: z.enum(['high', 'medium', 'low']),
  significanceReason: z.string().describe('One-sentence rationale'),
  changes: z.array(z.object({
    sectionHeading: z.string().describe('Exact heading text (e.g. "## Usage")'),
    currentExcerpt: z.string().describe('1–5 verbatim lines from the README section'),
    suggestedReplacement: z.string().describe('Replacement text for that excerpt'),
    reason: z.string().describe('Specific code change reference with file:line'),
  })).describe('One entry per affected README section'),
  summary: z.string().describe('1–2 sentence summary of all required changes'),
});

export type ReadmeSuggestion = z.infer<typeof ReadmeSuggestionSchema>;

export const ArchitectureDiagramOutputSchema = z.object({
  includeDiagram: z.boolean().describe('Whether the README should include an architecture diagram'),
  sectionMarkdown: z
    .string()
    .describe('Complete README Architecture section markdown when includeDiagram=true; otherwise empty or minimal non-diagram section'),
  rationale: z.string().describe('Concise rationale for including or omitting the architecture diagram'),
  sourceFacts: z.array(z.string()).describe('Concrete repository facts used to produce the diagram decision and content'),
});

export type ArchitectureDiagramOutput = z.infer<typeof ArchitectureDiagramOutputSchema>;

const TEMPLATE_RULES = `Template Rules:
- The template below is your single source of truth for structure, headers, and content guidance. Follow every instruction in it exactly.
- Every heading (lines starting with #) is REQUIRED and must appear verbatim, including the # level.
- Replace blockquote guidance (lines starting with >) with real project content. Remove all blockquotes in final output.
- Replace comment hints (<!--) with real content. Remove all comments in final output.
- Always use backticks to describe code, commands, ENV VARs, libs, etc in-line. Ex: \`npm i\`
- Always use code blocks for multi-line or standalone code. Always include code type following ticks. Ex: \`\`\`js
- Assume git clone of repo does not need to be noted.
- Sections marked (Optional) may be omitted only if no relevant information was discovered.
- The project title must be the exact "name" of the repo or underlying application — do not humanize or rephrase it
- Do NOT invent your own sections or headings.
`;

export function createDiffAgents(model: string) {
  const diffAnalyzer = new Agent({
    name: 'DiffAnalyzer',
    model,
    outputType: DiffAnalysisSchema,
    tools: [gitDiffStat, gitLog, gitDiff, readFiles, searchCode, getStructure, getFileTree],
    instructions: `You are a precise diff analysis agent. Your job is to determine whether a git diff warrants a README update and what specifically changed.

Workflow:
1. Call git_diff_stat to see which files changed and line counts
2. Call git_log to understand commit intent
3. Call git_diff (optionally with pathFilter for large diffs) to read the actual changes
4. If diff is truncated, call read_files or search_code on changed files for more context
5. Return structured analysis

Classify changes by signal level in strict priority order:

HIGH signal (significant=true):
- Breaking changes to existing functionality
- New or changed CLI flags / options
- New or changed required environment variables
- New or changed installation or setup steps
- New or changed required dependencies
- New or changed user-facing entry points (e.g. binary/executable definitions, top-level commands)
- New or breaking API version change (e.g. api/v2)
- Major architectural changes that affect how users integrate with the system
- Removal or disabling of any feature, option, command, env var, or behavior currently documented in the README

MEDIUM signal (significant=true ONLY if it changes what a first-time reader must know to use the project):
- New capabilities that require new setup, configuration, or usage patterns not covered anywhere in the README
- Behavior changes that invalidate existing README instructions or examples

LOW signal (significant=false):
- Net-new features, endpoints, or logic that work within the existing setup — users discover these via docs, changelogs, or code, not the README
- New exported APIs or modules that don't change CLI, env vars, or setup
- Test changes, CI/CD, internal refactors, type fixes, style changes
- Dependency bumps with no user-visible API change
- New developer-only scripts not exposed as CLI entry points
- Internal agent instructions, specs, or planning documents
- Documentation-only changes already reflected in README

README relevance test (apply before marking significant=true at any level):
  - Removals/disabling: Is this feature, flag, command, or behavior currently documented in the README? If yes → significant=true.
  - Additions/changes: Would a first-time reader cloning this repo need this information to successfully install, configure, or run the project? If no → significant=false.

Cross-check for false positives:
 - if you see new options / configs / interfaces referenced, validate that they are not just new references of pre-existing logic.

Conservative default: 
- when in doubt, lean toward significant=false.`,
  });

  const readmePatcher = new Agent({
    name: 'ReadmePatcher',
    model,
    outputType: ReadmeSuggestionSchema,
    tools: [readFile],
    instructions: `You are a surgical README editor. You receive a diff analysis and the current README content. Produce targeted, minimal suggestions for updating the README.

Rules:
- Before writing any suggestion, call read_file on README.md to obtain the current content and collect every heading that exists (lines beginning with #). sectionHeading must be the exact text of an existing heading — do not invent headings that are not in the file. If an affectedReadmeSections entry does not match any real heading, map it to the nearest parent section that does exist.
- Only produce changes for sections listed in affectedReadmeSections
- Only document facts listed in highSignalChanges
- currentExcerpt must be verbatim text from the README, 1–5 lines
- suggestedReplacement must be complete, ready-to-paste replacement for that excerpt
- reason must reference specific file and line from the diff`,
  });

  return { diffAnalyzer, readmePatcher };
}

/**
 * Active README pipeline: ArchitectureDiagramAgent for Architecture → single ReadmeWriter with section workspace → (AgentsDocWriter?)
 */
export function createAgents(
  model: string,
  _readmeTemplate: string,
  agentsTemplate?: string,
  readmeWorkspaceTools: Tool[] = [],
) {
  const architectureDiagramAgent = new Agent({
    name: 'ArchitectureDiagramAgent',
    model,
    outputType: ArchitectureDiagramOutputSchema,
    instructions: `You are a repository architecture diagram agent. Produce a concise README architecture section that helps a developer understand the system conceptually at a macro level.

## Research strategy
Use tools in this order: get_file_tree → read_files → search_code → get_structure. Stop when you have enough to characterize topology. Do not invent nodes—except a single illustrative upstream caller (e.g., "Client") when the repo is clearly a service but contains no explicit caller code.

## Decision rule
Include a diagram when the repo has non-obvious topology: external dependencies, multiple services, configured downstream URLs/databases/queues/caches, or a request/data flow a reader can't infer from filenames alone. Skip it for single-concern libraries with no runtime integrations.

Always include a diagram for: gateways, proxies, BFFs, API servers with external storage, microservices, or anything with configured downstream service URLs, DB connection strings, queue/cache references, or metrics endpoints.

## Output format
Return exactly these fields:
- includeDiagram (bool)
- sectionMarkdown (string)
- rationale (one sentence)
- sourceFacts (list of concrete repo-evidenced facts with paths)

## When includeDiagram = true
sectionMarkdown must contain:
1. A \`## Architecture\` heading
2. At most one orientation sentence (plain English, conceptual)
3. Exactly one Mermaid fenced code block

No bullet lists, no component inventories, no file paths, no class/function names.

## Diagram rules
- \`flowchart LR\`
- 3–8 nodes, ≤10 edges
- Every edge labeled with pipe syntax: \`A -->|HTTP| B\`
- Show: upstream callers, repo boundary (subgraph if helpful), downstream services/stores/observability
- Nodes represent runtime actors only—no controllers, DAOs, modules, or internal layers
- Base diagram facts on config, entrypoints, env vars, API clients, or deployment files—not imports alone

## Node shapes
| Type | Syntax |
|---|---|
| Caller / client | \`ID([Label])\` |
| App server / service | \`ID[Label]\` |
| Database / storage | \`ID[(Label)]\` |
| Queue / worker | \`ID[[Label]]\` |
| Observability | \`ID((Label))\` |

## Diagram structure — order matters
Emit blocks in this exact order or GitHub will drop styles:
1. Node declarations (one per line, no edges)
2. Edge definitions
3. classDef blocks
4. class assignments

✓
\`\`\`
Gateway[Gateway]
DB[(Database)]
Gateway -->|HTTP| DB
classDef storage fill:#86efac,color:#052e16
class DB storage
\`\`\`

✗ \`Gateway[Gateway] -->|HTTP| DB[(Database)]\`

## Edge style conventions
- \`-->\`   synchronous / HTTP
- \`-.->\`  async, event-driven, or fire-and-forget
- \`==>\`   dominant request path (use at most once)
- Extra dashes push peripheral nodes right: \`App ---->|metrics| Obs\`

## Styling
\`\`\`
classDef caller       fill:#93c5fd,color:#1e3a5f
classDef app          fill:#a5b4fc,color:#1e1b4b
classDef external     fill:#fcd34d,color:#422006
classDef storage      fill:#86efac,color:#052e16
classDef observability fill:#d8b4fe,color:#3b0764
\`\`\`

Define all five classes even if unused. Apply to every node via \`class ID classname\`.

## When includeDiagram = false
sectionMarkdown = "" unless a minimal prose Architecture section adds clear value.`,
    tools: [getFileTree, readFiles, searchCode, getStructure],
    handoffDescription: 'Research and write an optional README Architecture section with a concise Mermaid diagram.',
  });

  const agentsDocWriter = agentsTemplate
    ? new Agent({
        name: 'AgentsDocWriter',
        model,
        instructions: `You are a technical writer specializing in AGENTS.md documentation. Using the README content provided in the conversation and provided tools, generate a complete AGENTS.md file.

${TEMPLATE_RULES}

AGENTS.md Template:
\`\`\`\`\`\`markdown
${agentsTemplate}
\`\`\`\`\`\`

Additional rules:
- Target < 100 lines in final output — every line must earn its place
- Only include information supported by the provided README content — do not fabricate content
- Omit any section where nothing concrete was found
- Your entire output must be ONLY the raw AGENTS.md markdown — no preamble, no closing commentary, no wrapping code fences`,
    tools: [getFileTree, readFiles, searchCode, getStructure],
    handoffDescription: 'Write the AGENTS.md using accumulated context and available tools.',
      })
    : undefined;

  const readmeWriter = new Agent({
    name: 'ReadmeWriter',
    model,
    instructions: `You are a technical doc writer, specializing in README documentation. Use the README todo workspace tools to build a complete README.md one section at a time.

The template is structure and guidance only. It is not the repository being documented. Do not document the template, template examples, placeholder text, or documentation instructions.

Before saving README sections, inspect the actual repository with tools:
1. Call get_file_tree once to map the repository, then do not call it again.
2. Read the manifest, entrypoints, configuration, templates, existing documentation, and quality/eval files needed to fill the template in one bounded discovery pass.
3. Call getReadmeTodo to understand the full template-derived task list.
4. Repeatedly call getNextTodoSection, complete only that active section, and save it with saveReadmeSection before moving on.
5. Call validateReadmeWorkspace after all sections are saved. If validation reports errors, fix the active/specific section by using the todo tools, then validate again.

${TEMPLATE_RULES}

The README template is available through the todo workspace tools. Do not ask the user for it and do not reconstruct it from memory.

Additional rules:
- Use clear, concise language for a developer audience.
- Prefer facts from the initial discovery pass. Gather new context only when the active section requires a concrete missing fact.
- When extra context is needed, make one targeted read_files or search_code call for that fact. Do not rediscover the repository or re-read broad file sets.
- Do not re-read files whose relevant facts are already present in the conversation.
- Preserve the template's heading set. Do not add a heading that is absent from the template, even when repository facts would normally fit that topic; place those facts under the nearest relevant template section instead.
- Save each non-preamble section as complete markdown that starts with the exact active heading.
- Required sections cannot be omitted. Optional sections may be omitted only when repository research found no relevant content, and the save reason must say why.
- Block a section only when necessary information is genuinely missing, and the save reason must name that missing information.
- The Architecture section may already be completed by the workflow's architecture specialist. If it is already complete in getReadmeTodo, do not rewrite it.
- Do NOT repeat information across sections. Each fact belongs in exactly one section — place it where the template guidance says it goes.
- READMEs are written in third-person neutral for descriptions and second-person imperative for instructions, addressed to a developer evaluating or adopting the project. Ensure output is aligned.
- Your final response can be brief. The workflow assembles the README deterministically from saved sections, not from your final message.`,
    tools: [...readmeWorkspaceTools, getFileTree, readFiles, searchCode, getStructure],
  });

  return { architectureDiagramAgent, readmeWriter, agentsDocWriter };
}

/**
 * Legacy 3-agent pipeline: Researcher → TemplateEnforcer ↔ DetailFetcher. No longer used.
 * @deprecated
 * */
export function createLegacyAgents(model: string, readmeTemplate: string) {
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
    tools: [],
    handoffs: [detailFetcher],
    handoffDescription:
      'Write the final README using accumulated context',
  });

    const researcher = new Agent({
    name: 'Researcher',
    model,
    instructions: `${RECOMMENDED_PROMPT_PREFIX} You are a repository researcher. Your job is to explore the repository structure AND analyze file contents in a single pass. Work in two phases:

**Phase 1 — Map the repo structure**
Call get_file_tree once with ["**/*"] to get the full file list. You now have the complete repo map — do NOT make further list_directory calls.

From the file list, identify key files to read:
- Manifest files (package.json, Cargo.toml, pyproject.toml, go.mod, etc.)
- Entry points and main source files
- Configuration files (tsconfig, Dockerfile, docker-compose, CI/CD, .devcontainer/)
- Documentation files (README, docs/)

Skip test files, lock files, and generated output — they don't contribute README content.

**Phase 2 — Read key files in batches**
Use read_files to read 4–6 related files per call (e.g., manifest + entry points together, then config files together). Use read_file only for single follow-up lookups. Use get_structure instead of read_files for large source files when you only need exported signatures.

Target ≤ 4 read_files calls total. Stop reading once you have enough to populate every template section — do not read files for completeness alone.

The template below is the single source of truth for what sections exist, what each section needs, and how the output will be organized. Each template section contains blockquote guidance describing the required content — use that as your checklist.

Do NOT invent your own sections or headings. Organize your findings under the exact headings from the template.

One additional extraction rule not in the template: the project title must be the exact "name" field from the manifest file (package.json, Cargo.toml, etc.) — do not humanize or rephrase it.

README Template:
${readmeTemplate}

When done, output your findings as a structured technical summary using the exact headings from the template above. Under each heading, list the specific facts you found and where you found them (file paths). Do not fabricate details — only report what you actually read.`,
    tools: [getFileTree, readFiles, searchCode, getStructure],
    handoffDescription:
      'Explore repository structure and analyze file contents',
  });

  detailFetcher.handoffs = [templateEnforcer];

  return { researcher, templateEnforcer, detailFetcher };
}
