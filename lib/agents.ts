import { Agent } from '@openai/agents';
import { RECOMMENDED_PROMPT_PREFIX } from '@openai/agents-core/extensions';
import { z } from 'zod';
import { listDirectory, readFile, searchCode, getStructure, getFileTree, readFiles, diffTools } from './tools.js';

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

export function createDiffAgents(model: string) {
  const diffAnalyzer = new Agent({
    name: 'DiffAnalyzer',
    model,
    outputType: DiffAnalysisSchema,
    tools: diffTools,
    instructions: `${RECOMMENDED_PROMPT_PREFIX} You are a precise diff analysis agent. Your job is to determine whether a git diff warrants a README update and what specifically changed.

Workflow:
1. Call git_diff_stat to see which files changed and line counts
2. Call git_log to understand commit intent
3. Call git_diff (optionally with pathFilter for large diffs) to read the actual changes
4. If diff is truncated, call read_file on individual changed files for more context
5. Return structured analysis

Classify changes by signal level in strict priority order:

HIGH signal (always significant=true):
- New or changed CLI flags / options
- New or changed environment variables
- New or changed API endpoints
- New or changed installation steps
- New or changed required dependencies
- New or changed user-facing entry points (e.g. binary/executable definitions, new top-level commands)
- New or changed architecture components

MEDIUM signal (evaluate carefully — only significant=true if user-visible behavior changed):
- New exported public API
- Significant behavior changes visible to end users
- Net-new user-facing capabilities that do not map to any existing README section — the change
  is significant but the user must decide if and where to document it, so it is not urgent

LOW signal (significant=false):
- Test-only changes (new tests, test reorganization, test coverage improvements, test infrastructure)
- CI/CD configuration changes
- Dependency version bumps with no API change
- Internal refactors with no public API change, including:
  - Extracting internal modules/utilities not exposed as CLI flags or user-facing APIs
  - Moving code between files with no change to CLI flags, env vars, or public behavior
- Type annotation or type system fixes with no runtime behavior change (e.g. TypeScript types, Python type hints)
- Documentation-only changes (already in README)
- Code style / formatting changes
- New or changed developer-only package scripts (e.g. eval:*, test:*, lint:*) that are not
  in the binary/executable entry point field and have no user-facing CLI impact
- Changes to internal AI agent instructions or system prompts where no CLI flags,
  output schemas, or user-visible behavior change
- New or changed internal spec, design, or planning documents (e.g. docs/specs/, docs/plans/,
  implementation notes) — these describe developer intent and may reference existing CLI flags,
  but are not user-impacting changes

Cross-check for false positives: if you see new options / configs / interfaces referenced, validate that
they are not just new references of pre-existing logic.

Conservative default: when in doubt, lean toward significant=false.
Only mark significant=true when there is clear evidence of user-impacting changes.`,
  });

  const readmePatcher = new Agent({
    name: 'ReadmePatcher',
    model,
    outputType: ReadmeSuggestionSchema,
    tools: [readFile],
    instructions: `${RECOMMENDED_PROMPT_PREFIX} You are a surgical README editor. You receive a diff analysis and the current README content. Produce targeted, minimal suggestions for updating the README.

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
    instructions: `You are a technical writer specializing in README documentation. Using the research summary provided in the conversation, generate a complete README.md file.
    
The template below is your single source of truth for structure, headers, and content guidance. Follow every instruction in it exactly.

README Template:
\`\`\`\`\`\`markdown
${readmeTemplate}
\`\`\`\`\`\`

Additional rules:
- Use the exact, verbatim project name from the manifest "name" field (e.g. package.json "name") as the # title — do not humanize or rephrase it
- You MUST emit every heading from the template using exact markdown syntax.
- Only include information that was discovered by the Researcher — do not fabricate content
- If a required section is missing relevant facts (e.g. a CLI command, a required env var), attempt to retrieve using the provided tools.
- Use clear, concise language for a developer audience.
- DISTILL the research into polished README content. Strip all researcher artifacts: "File references:", "What I found:", source-file citations, notes-to-self, and any raw analysis scaffolding. The reader should see only clean documentation, never the research process.
- Do NOT repeat information across sections. Each fact belongs in exactly one section — place it where the template guidance says it goes.
- READMEs are written in third-person neutral for descriptions and second-person imperative for instructions, addressed to a developer evaluating or adopting the project. Ensure output is aligned.
- Your entire output must be ONLY the raw README markdown — no preamble, no closing commentary, no wrapping code fences`,
    tools: [getFileTree, readFiles, searchCode, getStructure],

    // tools: [],
    // handoffs: [detailFetcher],
    // handoffDescription:
      // 'Write the final README using accumulated context',
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
        tools: [],
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
    instructions: `You are a repository researcher. Your job is to explore the repository structure and analyze file contents to be used to generate documentation. 
Use the README Template as your source of truth to determine what information to research. Iterate through each section and ensure you've collected enough information to reasonably complete.

Work in two phases:

Phase 1 — Map the repo structure
Call get_file_tree once with ["**/*"] to get the full file list, use this as repo map.

From the file list, identify key files to read:
- Manifest files (package.json, Cargo.toml, pyproject.toml, go.mod, etc.)
- Entry points and main source files
- Configuration files (tsconfig, Dockerfile, docker-compose, CI/CD, .devcontainer/)
- Documentation files (README, docs/)

Skip test files, lock files, and generated output — they don't contribute README content.

Phase 2 — Read key files in batches
- Use read_files to read 4–6 related files per call (e.g., manifest + entry points together, then config files together).
- Use get_structure instead of read_files for large source files when you only need exported signatures.
- Stop reading once you have enough to populate every template section — do not read files for completeness alone.

The template below is the single source of truth for what sections exist, what each section needs, and how the output will be organized. Each template section contains blockquote guidance describing the required content — use that as your checklist.

Do NOT invent your own sections or headings. Organize your findings under the exact headings from the template.

One additional extraction rule not in the template: the project title must be the exact "name" of the repo or underlying application.

README Template:
\`\`\`\`\`\`markdown
${readmeTemplate}
\`\`\`\`\`\`

When done, output your findings as a structured technical summary using the exact headings from the template above. Under each heading, list the specific facts you found and where you found them (file paths). Do not fabricate details — only report what you actually read.`,
    tools: [getFileTree, readFiles, searchCode, getStructure],
  });

  return { researcher, templateEnforcer, detailFetcher, agentsDocWriter };
}
