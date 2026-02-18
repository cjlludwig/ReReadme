// .claude/hooks/save-plan.js
import fs from 'fs';
import path from 'path';
import os from 'os';

const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const { session_id, permission_mode } = input;

if (permission_mode !== 'acceptEdits') process.exit(0);

const lockFile = path.join(os.tmpdir(), `claude-plan-saved-${session_id}`);
if (fs.existsSync(lockFile)) process.exit(0);
fs.writeFileSync(lockFile, '1');

const plansDir = path.join(os.homedir(), '.claude', 'plans');
if (!fs.existsSync(plansDir)) process.exit(0);

const latest = fs.readdirSync(plansDir)
  .filter(f => f.endsWith('.md'))
  .map(f => ({ f, mtime: fs.statSync(path.join(plansDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0];

if (!latest) process.exit(0);

const content = fs.readFileSync(path.join(plansDir, latest.f), 'utf8');
const title = content.match(/^#\s+(.+)$/m)?.[1]
  ?.trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const outName = title ? `${title}.md` : latest.f;

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const outDir = path.join(projectDir, 'docs', 'plans');
fs.mkdirSync(outDir, { recursive: true });

fs.copyFileSync(
  path.join(plansDir, latest.f),
  path.join(outDir, outName)
);

process.exit(0);