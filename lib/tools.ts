import { tool } from '@openai/agents';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

function safePath(relativePath: string): string {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT)) {
    throw new Error(`Path traversal not allowed: ${relativePath}`);
  }
  return resolved;
}

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
    return entries
      .filter((e) => !EXCLUDED.has(e.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join('\n');
  },
});

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
      .default(500)
      .describe('Maximum number of lines to return'),
  }),
  execute: async (input) => {
    const filePath = safePath(input.path);
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
    const includeFlag = input.glob ? `--include="${input.glob}"` : '';
    const cmd = `grep -rn ${includeFlag} -- ${JSON.stringify(input.pattern)} ${JSON.stringify(ROOT)} 2>/dev/null | head -50`;
    try {
      const output = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      });
      if (!output.trim()) {
        return 'No matches found.';
      }
      // Make paths relative
      return output.replaceAll(ROOT + '/', '');
    } catch {
      return 'No matches found.';
    }
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

export const allTools = [listDirectory, readFile, searchCode, getStructure];
