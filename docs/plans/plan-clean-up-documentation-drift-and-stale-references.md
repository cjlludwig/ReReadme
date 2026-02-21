# Plan: Clean up documentation drift and stale references

## Context

The project has accumulated documentation drift over time as features were removed (gitingest, confluence) and the agent architecture was refactored. The README and latest_run.md still document CLI flags (`--confluence`, `--continue`, `--keep-context`) that don't exist in code, reference gitingest as if it's still used, describe a "two-agent pipeline" when the actual pipeline has 3+1 agents, and have stale workflow steps (cleanup step that doesn't exist). Additionally, CLAUDE.md has the wrong agent names.

## Files to Change

- `README.md` — Primary doc with most drift
- `latest_run.md` — Mirrors README.md, has same issues
- `CLAUDE.md` — Wrong agent names and missing CLI flags
- `package.json` — "gitingest" in keywords
- `.gitignore` — stale `gitingest*.txt` pattern

## Specific Changes

### README.md

1. **Line 7 — description**: Remove "two-agent workflow", accurately describe multi-agent architecture
2. **Line 19 — "Integrating external sources"**: Remove (confluence no longer supported)
3. **Line 36 — Optional Setup**: Remove "Confluence MCP integration" line
4. **Lines 84–91 — CLI examples**: Remove `--confluence`, `--continue`, `--keep-context` blocks; add missing real flags: `--input FILE`, `--output FILE`, `--model MODEL`, `--no-backup`, `--agents`, `--agents-output FILE`
5. **Line 107 — local dev examples**: Remove `--confluence` example
6. **Lines 112–125 — Workflow Steps**: Rewrite to reflect real flow (no gitingest "Context Generation" step, no "Cleanup" step); align with what CLAUDE.md already correctly describes
7. **Line 130 — "two-agent pipeline"**: Fix to "multi-agent architecture (Researcher → DetailFetcher → TemplateEnforcer, plus optional AgentsDocWriter)"
8. **Line 166 — Help section**: Remove "Gitingest has size limits" tip
9. **Line 179 — References**: Remove "[Gitingest Documentation]" link

### latest_run.md

Same set of changes as README.md (it's a near-duplicate with the same stale content).

### CLAUDE.md

1. **Lines 42–45 — agent names**: Fix "FileExplorer, ContentAnalyzer, READMEWriter, Orchestrator" → actual names: "Researcher, DetailFetcher, TemplateEnforcer, AgentsDocWriter (optional)"
2. **Line 55 — CLI args**: Add `--agents`, `--agents-output`, `--no-backup` to the listed flags

### package.json

- Remove `"gitingest"` from the `keywords` array (line 15)

### .gitignore

- Remove `gitingest*.txt` line (line 139)

## Ground Truth (from script.ts `showHelp()`)

Actual implemented flags:
- `--help` / `-h`
- `--verbose`
- `--interactive`
- `--check`
- `--input FILE`
- `--output FILE`
- `--model MODEL`
- `--no-backup`
- `--agents`
- `--agents-output FILE`

Actual agent names (from lib/agents.ts):
- `Researcher` (main entry point)
- `DetailFetcher` (handoff for missing facts)
- `TemplateEnforcer` (final README generation)
- `AgentsDocWriter` (optional, only when `--agents` flag used)

## Verification

After changes:
1. `npm run help` — confirm output matches updated README flag list
2. `make lint-md` — confirm all `.md` files pass markdownlint
3. `make lint-ts` — confirm package.json change didn't break anything
4. Grep for "gitingest", "confluence", "keep-context", "keep_context" across all files to confirm no remaining references
