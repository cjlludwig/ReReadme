# Plan: Modernize CLI Look and Feel

## Context

`script.ts` previously used `chalk` + `echo`/`question` from `zx` for all output — scattered
emoji, per-line chalk calls, and raw `question()` prompts. The goal was quiet-by-default
output using `@clack/prompts` for structured framing and `picocolors` for inline color, with
a thin `lib/logger.ts` singleton centralizing all verbose-gating. `lib/runner.ts` step logs
were raw `console.log()` calls behind `if (verbose)` — they now use proper clack log markers.

No business logic, agent workflow, CLI flags, or file I/O behavior changes.

**Status: Implementation complete on branch `ui-cleanup`.**

---

## Changes Made

### 1. `package.json`
- Added `@clack/prompts: 1.0.1` and `picocolors: 1.1.1` to `"dependencies"`

### 2. `lib/logger.ts` (new file)
Singleton module wrapping `@clack/prompts` and `picocolors`:
- `setVerbose(v)` — called once at startup by `script.ts`
- Always-visible: `intro`, `outro`, `step`, `info`, `warn`, `error`
- Verbose-only full-brightness: `verboseStep()` — `p.log.step()` gated by `_verbose`
- Verbose-only dim: `detail()` — `p.log.step(pc.dim(...))` gated by `_verbose`
- `createSpinner()`, `confirm`, `isCancel` — clack passthrough
- `pc` — picocolors passthrough

### 3. `script.ts`
- Removed `chalk` and `echo`/`question` from zx imports
- Added `import * as log from './lib/logger.js'` and `import pc from 'picocolors'`
- `log.setVerbose()` called after `$.verbose` config
- `checkDependencies()` — errors accumulate, rendered with `log.error()`; success → `log.detail()`
- `updateReadme()` / `formatReadme()` — all output via `log.detail()` / `log.warn()`
- `runWorkflow()` — `log.intro` → `log.step` → spinner → `log.step` → `log.outro`
- `showHelp()` — `chalk.*` → `pc.*`, `echo` → `console.log`
- Bottom catch uses `log.error()`

### 4. `lib/runner.ts`
- Added `import * as log from './logger.js'`
- Removed `verbose` from destructure (kept in interface for backwards compat)
- All 6 `if (verbose) { console.log(...) }` blocks → `log.verboseStep(...)`

---

## Critical Files

| File | Change |
|---|---|
| `package.json` | Added `@clack/prompts`, `picocolors` |
| `lib/logger.ts` | **Created** — singleton clack/picocolors wrapper |
| `script.ts` | Refactored all output (imports, 5 functions, bottom catch) |
| `lib/runner.ts` | Add log import; replace 6 `if (verbose)` blocks |

---

## Verification

```bash
# Type + lint checks
make typecheck-ts
make lint-ts

# Tests (no behavior changes)
npm test

# Smoke tests
npm run dev -- --help           # picocolors colors, no emoji
npm run dev -- --check          # clack step markers, accumulated errors
npm run dev -- --verbose --check  # dim verbose success messages
npm run dev -- --interactive    # p.confirm() prompts, clean Ctrl+C exit
npm run dev -- --verbose        # full run: intro → steps → spinner → outro
```
