# AGENTS.md

## Project

rereadme is a CLI tool to refresh README files automatically with up-to-date information based on code contents, documents, and external sources like Confluence. Stack: `TypeScript`, `Node.js`, `Google ZX`, `filesystem`.

## Commands

```shell
# Develop
npm run dev            # Run the CLI in development mode
npm run refresh        # Run the full README refresh workflow
npm run refresh:interactive # Run with interactive prompts

# Validate
npm run check          # Lint, typecheck, and dependency checks
npm run test           # Run unit tests
npm run help           # Show CLI help

# Build
npm run build          # Compile TypeScript to JavaScript (dist)

# Other
npm run setup          # Initialize submodules and experiments environment
npm run eval           # Run the experiments evaluation workflow
npm run prepare        # Husky prepare (install git hooks)

# Make targets
make check             # Run all checks (lint, typecheck, deps, etc.)
make fix               # Apply automatic fixes
```

## Constraints

- **Generated files**: do not edit `dist/`, `build/`, or lock files directly

## Environment

- **Required**: `Node` (engine: `>=22.0.0`), `npm`, Git
- **Environment Variables**: `OPENAI_API_KEY` must be set for AI processing
- **Setup**: bootstrap by installing dependencies and validating toolchain
  - `npm install`
  - Optional: `npm run setup` to initialize submodules and experiments
  - Verify with `npm run check`

## Quality

- **Tests**: Jest tests located at `script.spec.ts`; run with `npm test`
- **Lint**: ESLint for TS/JS and markdownlint for Markdown; accessible via `make check` or individual targets
- **CI**: Ensure unit tests and all checks pass as part of the normal workflow (see Makefile targets for lint/typecheck/deps/tests)
- **Project structure references**: core code resides under `lib/` (agents, runner, tools) and `bin/`/`script.ts` for CLI entry points
