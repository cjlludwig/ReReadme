# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**rereadme** is a CLI tool that refreshes README files using AI. It uses a multi-agent architecture (OpenAI Agents SDK) where specialist agents explore the repo via filesystem tools, extract technical details, and generate accurate documentation. No Python dependencies required. Designed for CI integration in large organizations.

## Commands

```bash
# Development
npm run dev                        # Run via tsx (no compile step)
npm run dev -- --verbose           # With agent trace output
npm run dev -- --interactive       # Pause between steps for approval
npm run dev -- --check             # Dependency check only
npm run dev -- --model gpt-4o     # Override default model (gpt-5-nano)

# Build & Run
npm run build                      # Compile TypeScript to dist/
npm start                          # Run compiled output

# Test
npm test                           # Run Jest suite

# Eval (requires Python >= 3.11, uv, OPENAI_API_KEY)
npm run setup                      # Clone dataset submodule + install Python deps
npm run eval                       # Run DeepEval quality checks against express-server dataset

# Install globally
npm link                           # Makes 'rereadme' available as CLI command
```

## Architecture

### Multi-Agent Workflow

The core workflow in `script.ts` orchestrated by `runWorkflow()`:

1. **Dependency Check** — Verifies markdownlint-cli and OPENAI_API_KEY
2. **Agent Workflow** — `runAgentWorkflow()` launches an orchestrator that routes between specialist agents:
   - **FileExplorer** — Navigates the repo structure, identifies key files (package.json, entry points, configs, tests)
   - **ContentAnalyzer** — Reads discovered files, extracts purpose, dependencies, architecture, commands
   - **READMEWriter** — Generates README following the template, using only discovered information
   - **Orchestrator** — Routes between the above agents via handoffs
3. **README Update** — Writes output with timestamped backup
4. **Formatting** — `markdownlint --fix` auto-correction

### Key Patterns

- **OpenAI Agents SDK** (`@openai/agents`): Multi-agent orchestration with handoffs, tools defined via `tool()` helper with zod schemas
- **Filesystem tools** (`lib/tools.ts`): `list_directory`, `read_file`, `search_code`, `get_structure` — all validate paths within `process.cwd()` to prevent traversal
- **Shell via zx**: Shell commands (markdownlint) use Google's `zx` library with `nothrow` for graceful failures
- **Safe file ops**: Timestamped backups (`README.md.backup-<ISO>`) before any overwrite
- **CLI args**: Parsed via `zx.argv` — flags include `--help`, `--verbose`, `--interactive`, `--check`, `--input`, `--output`, `--model`

### File Layout

- `bin/rereadme.js` — CLI entry point (spawns tsx to run script.ts)
- `script.ts` — CLI orchestration, dependency checks, file I/O
- `script.spec.ts` — Jest test suite (tools, agents, runner)
- `lib/tools.ts` — Filesystem tools for agents (list_directory, read_file, search_code, get_structure)
- `lib/agents.ts` — Agent definitions (FileExplorer, ContentAnalyzer, READMEWriter, Orchestrator)
- `lib/runner.ts` — `runAgentWorkflow()` entry point
- `templates/` — README output template

### Eval Framework (`experiments/`)

DeepEval-based quality evaluation that runs rereadme against a dataset repo and checks the output. See `experiments/README.md` for full setup, metrics, and golden README workflow.

- **Config**: `experiments/conftest.py` — runs `npx tsx script.ts --output README-generated.md` against `experiments/datasets/express-server`, then cleans up
- **Tests**: `experiments/test_express_server.py` — deterministic checks (required headers, section content, npm commands) + LLM-as-judge similarity to golden README
- **Golden files**: `experiments/golden/*` — auto-generated on first run if missing, committed after review
- **Key detail**: eval writes to `README-generated.md` (not `README.md`) to avoid replacing the dataset's original README

### System Dependencies

- Node.js >= 22
- `markdownlint-cli` (npm global or Homebrew) — markdown formatting
- `OPENAI_API_KEY` environment variable required

## Reminders

- Update CLAUDE.md as key details are found.
- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
- Prefer `npm` script commands over `npx` for standardized scripts. Update if needed.
