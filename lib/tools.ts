import { tool } from '@openai/agents';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { globby, isGitIgnored } from 'globby';

const ROOT = process.cwd();

function safePath(relativePath: string): string {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT)) {
    throw new Error(`Path traversal not allowed: ${relativePath}`);
  }
  return resolved;
}

/**
 * @deprecated Superseded by `getFileTree`, which returns the full repo file list in one call.
 * Retained for `DetailFetcher` and backward compatibility.
 */
export const listDirectory = tool({
  name: 'list_directory',
  description:
    'List files and folders in a directory. Returns names with / suffix for directories. Hidden dirs like .devcontainer/ are included; .git and node_modules are excluded.',
  parameters: z.object({
    path: z
      .string()
      .default('.')
      .describe('Relative path from repo root'),
  }),
  execute: async (input) => {
    const dirPath = safePath(input.path);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const EXCLUDED = new Set(['.git', 'node_modules']);
    const filtered = entries.filter((e) => !EXCLUDED.has(e.name));
    const isIgnored = await isGitIgnored({ cwd: ROOT });
    return filtered
      .filter((e) => {
        const rel = path.relative(ROOT, path.join(dirPath, e.name));
        return !isIgnored(rel);
      })
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join('\n');
  },
});

/**
 * @deprecated Superseded by `readFiles`, which batches multiple reads into one tool call.
 * Retained for `DetailFetcher` and backward compatibility.
 */
export const readFile = tool({
  name: 'read_file',
  description:
    'Read the contents of a file. Returns up to maxLines lines starting from offset (both 0-based). Use offset to paginate through large files.',
  parameters: z.object({
    path: z.string().describe('Relative path from repo root'),
    offset: z
      .number()
      .default(0)
      .describe('Line number to start reading from (0-based)'),
    maxLines: z
      .number()
      .max(2000)
      .default(500)
      .describe('Maximum number of lines to return'),
  }),
  execute: async (input) => {
    const filePath = safePath(input.path);
    const isIgnored = await isGitIgnored({ cwd: ROOT });
    if (isIgnored(path.relative(ROOT, filePath))) {
      throw new Error(`Access denied: ${input.path} is gitignored`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.min(input.offset, lines.length);
    const end = Math.min(start + input.maxLines, lines.length);
    const slice = lines.slice(start, end);
    const result = slice.join('\n');
    const hasMore = end < lines.length;
    const header = `[Lines ${start + 1}–${end} of ${lines.length}]`;
    return hasMore
      ? `${header}\n${result}\n\n[... ${lines.length - end} more lines. Use offset=${end} to continue.]`
      : `${header}\n${result}`;
  },
});

export const searchCode = tool({
  name: 'search_code',
  description:
    'Search for a pattern across files in the repository. Returns matching lines with file:line format. Uses grep.',
  parameters: z.object({
    pattern: z.string().describe('Search pattern (basic regex)'),
    glob: z
      .string()
      .default('')
      .describe('File glob pattern to filter, e.g. "*.ts". Empty string for no filter.'),
  }),
  execute: async (input) => {
    // Normalize short globs (e.g. "*.ts" → "**/*.ts") for recursive matching
    const rawGlob = input.glob;
    const pattern = rawGlob && !rawGlob.includes('/') && !rawGlob.startsWith('**')
      ? `**/${rawGlob}`
      : rawGlob || '**/*';

    const files = await globby(pattern, {
      cwd: ROOT,
      gitignore: true,
      dot: true,
      ignore: ['.git/**', 'node_modules/**'],
    });

    let re: RegExp;
    try {
      re = new RegExp(input.pattern);
    } catch {
      return 'Invalid regex pattern.';
    }

    const results: string[] = [];
    outer: for (const file of files) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          results.push(`${file}:${i + 1}:${lines[i]}`);
          if (results.length >= 50) break outer;
        }
      }
    }
    return results.length > 0 ? results.join('\n') : 'No matches found.';
  },
});

export const getStructure = tool({
  name: 'get_structure',
  description:
    'Parse a TypeScript/JavaScript file and extract its exports, imports, and function/class signatures.',
  parameters: z.object({
    path: z.string().describe('Relative path to a .ts or .js file'),
  }),
  execute: async (input) => {
    const filePath = safePath(input.path);
    const isIgnored = await isGitIgnored({ cwd: ROOT });
    if (isIgnored(path.relative(ROOT, filePath))) {
      throw new Error(`Access denied: ${input.path} is gitignored`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const results: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.match(
          /^(export\s+)?(default\s+)?(async\s+)?function\s+/,
        ) ||
        line.match(/^(export\s+)?(default\s+)?class\s+/) ||
        line.match(/^(export\s+)(const|let|var|type|interface)\s+/) ||
        line.match(/^import\s+/)
      ) {
        results.push(`${i + 1}: ${line.trim()}`);
      }
    }

    return results.length > 0
      ? results.join('\n')
      : 'No exports, imports, or signatures found.';
  },
});

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

export const readFiles = tool({
  name: 'read_files',
  description:
    'Read multiple files at once. Prefer this over repeated read_file calls when you know which files you need. ' +
    "Returns each file's content labeled with its path. Max 8 files per call.",
  parameters: z.object({
    paths: z
      .array(z.string())
      .max(8)
      .describe('Relative paths from repo root'),
    maxLinesEach: z
      .number()
      .max(500)
      .default(300)
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

export const gitDiffStat = tool({
  name: 'git_diff_stat',
  description:
    'Get a summary of which files changed and line counts between two git refs. Call this first to understand the scope of changes.',
  parameters: z.object({
    fromRef: z.string().describe('Base ref (e.g. "main" or "origin/main")'),
    toRef: z.string().default('HEAD').describe('Head ref (e.g. "HEAD")'),
  }),
  execute: async (input) => {
    try {
      const output = execFileSync(
        'git',
        ['-C', ROOT, 'diff', '--stat', `${input.fromRef}...${input.toRef}`],
        { encoding: 'utf-8', maxBuffer: 1024 * 1024 },
      );
      return output.trim() || 'No changes.';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  },
});

export const gitLog = tool({
  name: 'git_log',
  description:
    'Get commit messages between two git refs for intent context. Provides oneline summaries of what changed and why.',
  parameters: z.object({
    fromRef: z.string().describe('Base ref (e.g. "main" or "origin/main")'),
    toRef: z.string().default('HEAD').describe('Head ref (e.g. "HEAD")'),
    maxCount: z.number().default(20).describe('Maximum number of commits to return'),
  }),
  execute: async (input) => {
    try {
      const output = execFileSync(
        'git',
        ['-C', ROOT, 'log', '--oneline', '--no-decorate',
         `-${input.maxCount}`, `${input.fromRef}...${input.toRef}`],
        { encoding: 'utf-8', maxBuffer: 1024 * 1024 },
      );
      return output.trim() || 'No commits found.';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  },
});

export const gitDiff = tool({
  name: 'git_diff',
  description:
    'Get the full unified diff between two git refs, capped at 5000 lines. Use pathFilter to narrow to specific files when the diff is large.',
  parameters: z.object({
    fromRef: z.string().default('origin/main').describe('Base ref (e.g. "main" or "origin/main")'),
    toRef: z.string().default('HEAD').describe('Head ref (e.g. "HEAD")'),
    pathFilter: z
      .string()
      .default('')
      .describe('Optional path filter (e.g. "src/" or "*.ts"). Empty string for no filter.'),
  }),
  execute: async (input) => {
    try {
      const args = ['-C', ROOT, 'diff', `${input.fromRef}...${input.toRef}`];
      if (input.pathFilter) args.push('--', input.pathFilter);
      const output = execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
      const truncated = output.split('\n').slice(0, 5000).join('\n');
      return truncated.trim() || 'No diff found.';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  },
});