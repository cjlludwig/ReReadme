# AGENTS

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

rereadme is a CLI tool that refreshes README files using AI. It uses a multi-agent architecture (OpenAI Agents SDK) where specialist agents explore the repo via filesystem tools, extract technical details, and generate accurate documentation. No Python dependencies required. Designed for CI integration in large organizations.

## Commands

```bash
# Development
npm run dev                        # Run via tsx (no compile step)
npm run dev -- --help              # View other params
npm run dev -- --interactive       # Pause between steps for approval

# Build & Run
npm run build                      # Compile TypeScript to dist/
npm start                          # Run compiled output

# Eval (requires Python >= 3.11, uv, OPENAI_API_KEY)
npm run setup                      # Clone dataset submodule + install Python deps
npm run eval                       # Run DeepEval quality checks against express-server dataset

# A `Makefile` at the repo root drives all quality checks:
# Quality commands
make check                         # quiet cached static gate (fail-fast)
make check-full                    # uncached ESLint pass for debugging
make fix                           # auto-fix: eslint --fix, markdownlint --fix, ruff --fix
make test                          # quiet cached Jest with coverage
make test-full                     # uncached Jest with normal output
make lint-ts                       # quiet cached ESLint only
make lint-ts-full                  # uncached ESLint only
make lint-md                       # markdownlint only
make typecheck-ts                  # tsc --noEmit only
make clean-check-cache             # remove local lint/test/typecheck caches
```

## Architecture

### Multi-Agent Workflow

The core workflow in `script.ts` is orchestrated by `runWorkflow()`. For the current agent definitions and pipeline structure, read `lib/agents.ts` and `lib/runner.ts` directly — they are the source of truth.

### Key Patterns

- OpenAI Agents SDK: (`@openai/agents`): Multi-agent orchestration with handoffs, tools defined via `tool()` helper with zod schemas
- Filesystem tools: (`lib/tools.ts`): `list_directory`, `read_file`, `search_code`, `get_structure` — all validate paths within `process.cwd()` to prevent traversal
- Shell via zx: Shell commands (markdownlint) use Google's `zx` library with `nothrow` for graceful failures
- Safe file ops: Timestamped backups (`README.md.backup-<ISO>`) before any overwrite
- CLI args: Parsed via `zx.argv` — flags include `--help`, `--verbose`, `--interactive`, `--check`, `--output`, `--model`, `--no-backup`, `--agents`, `--agents-output`, `--template FILE`, `--agents-template FILE`

### File Layout

- `bin/rereadme.js` — CLI entry point (spawns tsx to run script.ts)
- `script.ts` — CLI orchestration, dependency checks, file I/O
- `script.spec.ts` — Jest test suite (tools, agents, runner)
- `lib/tools.ts` — Filesystem tools for agents (list_directory, read_file, search_code, get_structure)
- `lib/agents.ts` — Agent definitions (ReadmeWriter, AgentsDocWriter, DiffAnalyzer, ReadmePatcher)
- `lib/runner.ts` — `runAgentWorkflow()` entry point
- `templates/` — README output template

### Eval Framework (`experiments/`)

DeepEval-based quality evaluation that runs rereadme against a dataset repo and checks the output. See `experiments/README.md` for full setup, metrics, and golden README workflow.

- Config: `experiments/conftest.py` — runs `npx tsx script.ts --output README-generated.md` against `experiments/datasets/express-server`, then cleans up
- Tests: `experiments/test_express_server.py` — deterministic checks (required headers, section content, npm commands) + LLM-as-judge similarity to golden README
- Golden files: `experiments/golden/*` — auto-generated on first run if missing, committed after review
- Key detail: eval writes to `README-generated.md` (not `README.md`) to avoid replacing the dataset's original README

## Quality Gate

- Claude Code hook: `PostToolUse` in `.claude/settings.json` runs `make check` after every Write/Edit/MultiEdit
- Pre-commit hook: `.git/hooks/pre-commit` runs `make check` (one-time setup: `chmod +x .git/hooks/pre-commit`)
- Python dev deps: ruff and mypy added to `experiments/pyproject.toml` dev group — install with `cd experiments && uv sync`

## Reminders

- Update CLAUDE.md as key details are found.
- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
- Prefer `npm` script commands over `npx` for standardized scripts. Update if needed.
- Prefer JSDocs for function level comments or descriptions. In-line should only be used if the logic isn't self explanatory or readable.
- When tuning agent prompts or model behavior, fix broad failure modes rather than literal eval misses. Prefer reusable guidance about discovery, evidence, structure, and tradeoffs; avoid embedding dataset-specific keywords, commands, or golden-output phrasing unless they represent a general product requirement.
- Any change to `action.yml`, `script.ts`, `lib/`, `bin/`, or `templates/` only takes effect for GHA consumers after a new release is published. When fixing a bug in these files, always proactively note: "This fix requires a version bump and release to take effect — bump `package.json` version to trigger the publish workflow."
