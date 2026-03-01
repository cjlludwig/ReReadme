#!/usr/bin/env node

// CLI wrapper for rereadme TypeScript script
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the main TypeScript script
const scriptPath = join(__dirname, '..', 'script.ts');

// Use tsx to execute the TypeScript script with all command line arguments
const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const child = spawn(tsxBin, [scriptPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd()
});

// Forward exit code
child.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle errors
child.on('error', (err) => {
  console.error('Failed to start rereadme:', err.message);
  process.exit(1);
});
