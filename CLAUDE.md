# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**rereadme** is a CLI tool that refreshes README files using AI. It extracts code context via gitingest, processes it through OpenAI's Responses API with prompt templates, and outputs updated documentation. Designed for CI integration in large organizations.

## Commands

```bash
# Development
npm run dev                        # Run via tsx (no compile step)
npm run dev -- --verbose           # With shell output details
npm run dev -- --interactive       # Pause between steps for approval
npm run dev -- --check             # Dependency check only
npm run dev -- --model gpt-4o     # Override default model (gpt-5-nano)

# Build & Run
npm run build                      # Compile TypeScript to dist/
npm start                          # Run compiled output

# Test
npm test                           # Run Jest suite

# Install globally
npm link                           # Makes 'rereadme' available as CLI command
```

## Architecture

### Workflow Pipeline

The core is a 5-step pipeline in `script.ts` orchestrated by `runWorkflow()`:

1. **Dependency Check** — Verifies gitingest (Python), markdownlint-cli, and OPENAI_API_KEY
2. **Context Generation** — Runs gitingest with 3 preset configurations (code-focused, LLM-focused, infrastructure) to produce context files
3. **AI Processing** — Three sequential OpenAI calls using response chaining (`previous_response_id`):
   - Step 1: `prompts/1_prep_readme.txt` — Standardize existing README
   - Step 2 (optional, `--confluence`): `prompts/2_external_sources.txt` — Integrate Confluence docs
   - Step 3: `prompts/3_gitingest_readme.txt` — Incorporate codebase context
4. **Formatting** — `markdownlint --fix` auto-correction
5. **Cleanup** — Remove gitingest context files (unless `--keep-context`)

### Key Patterns

- **OpenAI Responses API** (not Completions): Lazy-initialized client, response chaining via `previous_response_id`, session ID tracking per run
- **Shell via zx**: All shell commands use Google's `zx` library with `nothrow` for graceful failures
- **Safe file ops**: Timestamped backups (`README.md.backup-<ISO>`) before any overwrite
- **CLI args**: Parsed via `zx.argv` — flags include `--help`, `--verbose`, `--interactive`, `--confluence`, `--continue`, `--keep-context`, `--check`, `--input`, `--output`, `--model`, `--debug-gitingest`

### File Layout

- `bin/rereadme.js` — CLI entry point (spawns tsx to run script.ts)
- `script.ts` — All application logic (~700 lines)
- `script.spec.ts` — Jest test suite
- `prompts/` — Numbered prompt templates for each AI step
- `templates/` — README output templates (markdown and LLM formats)

### System Dependencies

- Node.js >= 20, Python 3.x with pip
- `gitingest` (Python package) — code context extraction
- `markdownlint-cli` (npm global or Homebrew) — markdown formatting
- `OPENAI_API_KEY` environment variable required

## Reminders

- Update CLAUDE.md as key details are found.
- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.