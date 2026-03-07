# Plan: Clean Up Single-Agent Refactor for Commit

## Context
The codebase was refactored from a multi-agent pipeline (Researcher → TemplateEnforcer, with DetailFetcher handoff) to a single-agent approach using `ReadmeWriter`. The changes are hacked in — log messages still reference old agent names, dead code is present, and there are no deprecation markers on the legacy agents.

## Changes

### `lib/runner.ts`

1. **Fix destructuring** — remove unused `researcher` and `detailFetcher` from the `createAgents()` destructure
2. **Fix `attachToolLogger`** — call it for `readmeWriter` (and `agentsDocWriter` if present), not the unused legacy agents
3. **Fix step count** — `totalSteps` should be `agentsDocWriter ? 2 : 1` (not `3 : 2`)
4. **Fix log messages** — rename "Researcher" → "ReadmeWriter" in `verboseStep` calls; when `totalSteps === 1` omit the `Step X/Y:` prefix entirely (just log the agent name)
5. **Remove `const step2 = step1` hack** — use `step1` directly throughout
6. **Remove commented-out TemplateEnforcer block** (lines 144–151) — it's dead code and adds noise

### `lib/agents.ts`

1. **Add `@deprecated` JSDoc** to `researcher`, `templateEnforcer`, and `detailFetcher` agents inside `createAgents()` — mark them as preserved for historical reference but no longer in the active pipeline
2. **Leave all agents in the return value** — no functional change, just documentation

### `.markdownlintignore`

1. Add `latest_run.backup-*.md` — backup files are ignored for `latest_run.md` but not the timestamped backups it generates

## Critical Files
- `lib/runner.ts`
- `lib/agents.ts`
- `.markdownlintignore`

## Verification
- `npm run dev -- --verbose` on a local repo to confirm log output reads cleanly
- `npm test` to confirm nothing broke
- `make check` for full lint/type/test pass
