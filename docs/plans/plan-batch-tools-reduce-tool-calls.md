# Plan: Batch Tools to Reduce Researcher Tool Call Count

## Context

The Researcher agent currently makes ~19 tool calls per run against the express-server dataset (measured 2026-03-03):

```json
{
  "toolCallCount": 19,
  "toolCallsByAgent": { "Researcher": 19 },
  "toolCallsByTool": { "list_directory": 6, "read_file": 13 }
}
```

All 19 calls originate from the Researcher — 6 `list_directory` traversals + 13 individual `read_file` calls. Each tool call re-sends the full growing conversation history, so call count compounds cost nonlinearly and hits the OpenAI 200k TPM/min limit on more complex repos.

This plan adds two new batch tools and tightens researcher instructions to cut calls from ~19 to ≤ 15 (the budget set in `plan-tool-call-stats-eval-metric.md`).

---

## Approach

Three levers:

1. **`get_file_tree` tool** — replaces all `list_directory` traversals with one globby call returning the full repo file list
2. **`read_files` tool** — replaces individual `read_file` calls with batched multi-file reads
3. **Researcher instruction updates** — guide the agent to prefer the new tools and skip low-signal files (tests, docs)

---

## File 1: `lib/tools.ts`

### 1a. Add `get_file_tree` tool (after `getStructure`, before `allTools`)

Returns all repo files matching glob patterns in one call. Replaces the `list_directory` → explore subdir → `list_directory` recursion pattern.

```typescript
export const getFileTree = tool({
  name: 'get_file_tree',
  description:
    'Get a flat list of all repo files matching glob patterns. Faster than repeated list_directory calls. ' +
    'Use exclude patterns (prefix with !) to filter noise, e.g. ["**/*", "!**/*.spec.ts", "!tests/**"]. ' +
    'Returns one relative path per line.',
  parameters: z.object({
    patterns: z
      .array(z.string())
      .default(['**/*'])
      .describe('Globby include/exclude patterns. Prefix with ! to exclude.'),
  }),
  execute: async (input) => {
    const files = await globby(input.patterns, {
      cwd: ROOT,
      gitignore: true,
      dot: true,
      ignore: ['.git/**', 'node_modules/**'],
    });
    return files.length > 0 ? files.join('\n') : 'No files matched.';
  },
});
```

### 1b. Add `read_files` tool (after `getFileTree`, before `allTools`)

Reads up to 8 files in one tool call. Each call re-sends conversation history, so batching 5 reads into 1 call saves ~4× the per-call token overhead.

```typescript
export const readFiles = tool({
  name: 'read_files',
  description:
    'Read multiple files at once. Prefer this over repeated read_file calls when you know which files you need. ' +
    'Returns each file\'s content labeled with its path. Max 8 files per call.',
  parameters: z.object({
    paths: z
      .array(z.string())
      .max(8)
      .describe('Relative paths from repo root'),
    maxLinesEach: z
      .number()
      .default(300)
      .max(500)
      .describe('Max lines to return per file'),
  }),
  execute: async (input) => {
    const isIgnored = await isGitIgnored({ cwd: ROOT });
    const results: string[] = [];
    for (const p of input.paths) {
      const filePath = safePath(p);
      if (isIgnored(path.relative(ROOT, filePath))) {
        results.push(`### ${p}\n[Access denied: gitignored]`);
        continue;
      }
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').slice(0, input.maxLinesEach);
        const truncated = lines.length < content.split('\n').length;
        const header = `### ${p}`;
        const body = lines.join('\n');
        const footer = truncated
          ? `\n[... truncated at ${input.maxLinesEach} lines]`
          : '';
        results.push(`${header}\n${body}${footer}`);
      } catch {
        results.push(`### ${p}\n[Error: file not found or unreadable]`);
      }
    }
    return results.join('\n\n---\n\n');
  },
});
```

### 1c. Update `allTools` export to include both new tools

```typescript
export const allTools = [listDirectory, readFile, searchCode, getStructure, getFileTree, readFiles];
```

Keep `listDirectory` and `readFile` in `allTools` — they remain available for targeted single-file reads and backward compatibility with `DetailFetcher`.

---

## File 2: `lib/agents.ts`

### 2a. Import new tools

```typescript
import { listDirectory, readFile, searchCode, getStructure, getFileTree, readFiles, diffTools } from './tools.js';
```

### 2b. Update `Researcher` tools list

```typescript
tools: [getFileTree, readFiles, listDirectory, readFile, searchCode, getStructure],
```

`getFileTree` and `readFiles` listed first so the model sees them as preferred. `listDirectory` and `readFile` kept for single-file follow-ups when needed.

### 2c. Update Researcher instructions — add Phase 1 guidance to use `get_file_tree`, Phase 2 to batch reads, and skip test files

Replace the current Phase 1/2 description with:

```
**Phase 1 — Map the repo structure**
Call get_file_tree once with ["**/*"] to get the full file list. You now have the complete repo map — do NOT make further list_directory calls.

From the file list, identify key files to read:
- Manifest files (package.json, Cargo.toml, pyproject.toml, go.mod, etc.)
- Entry points and main source files
- Configuration files (tsconfig, Dockerfile, docker-compose, CI/CD, .devcontainer/)
- Documentation files (README, docs/)

Skip test files (*.spec.ts, *.test.ts, tests/, __tests__/), lock files, and generated output — they don't contribute README content.

**Phase 2 — Read key files in batches**
Use read_files to read 4–6 related files per call (e.g., manifest + entry points together, then config files together). Use read_file only for single follow-up lookups. Use get_structure instead of read_files for large source files when you only need exported signatures.

Target ≤ 4 read_files calls total. Stop reading once you have enough to populate every template section — do not read files for completeness alone.
```

---

## File 3: `lib/tools.ts` test coverage

### 3a. Add tests for `getFileTree` and `readFiles` in `tests/tools.spec.ts`

- `getFileTree` with default pattern returns known files, excludes gitignored
- `getFileTree` with exclude pattern (`!**/*.spec.ts`) omits test files
- `readFiles` with 2 paths returns both labeled sections
- `readFiles` with a gitignored path returns access denied for that entry, succeeds for others
- `readFiles` with a nonexistent path returns error label, continues

---

## Implementation Order

1. `lib/tools.ts` — add `getFileTree` and `readFiles`, update `allTools`
2. `lib/agents.ts` — import new tools, update Researcher tool list + instructions
3. `tests/tools.spec.ts` — tests for new tools
4. Run `make check` — lint, typecheck, unit tests
5. Smoke test: `npm run dev -- --verbose --output /tmp/test-readme.md --stats-output /tmp/stats.json` in a mid-sized repo, confirm call count
6. Run eval: `cd evals && uv run pytest test_express_server.py::test_tool_call_efficiency -v` — should pass at ≤ 15

## Expected Impact

Baseline measured against express-server dataset (2026-03-03):

| Tool pattern | Baseline (measured) | After |
|---|---|---|
| Repo traversal | 6 `list_directory` | 1 `get_file_tree` |
| File reads | 13 `read_file` | 3–4 `read_files` (batches of 4–5) |
| **Total** | **19** | **~6–8** |

Budget threshold: ≤ 15 (eval test passes when total ≤ 15).

## Backward Compatibility

- `listDirectory` and `readFile` remain in `allTools` and unchanged — `DetailFetcher` continues using them unmodified
- No changes to `diffTools` or the diff workflow agents
- New tools are additive; no existing tool signatures change
