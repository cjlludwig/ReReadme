# AGENTS.md

<!-- TEMPLATE RULES
- Target: < 100 lines in final output. Every line must be universally applicable to any task in this repo.
- Omit Conventions entirely if patterns are obvious from the codebase — Agent will infer them.
- Omit any section where nothing concrete was discovered.
- Output ONLY the final AGENTS.md markdown. No preamble, no closing commentary, no wrapping code fences.
-->

## Project

> One sentence: what this repo does. Stack as inline code: language, runtime, framework, datastore.

## Commands

> Only commands an agent will actually need to run. One fenced shell block, each line commented. Emphasive quality and validation checks like linters, tests, etc.

```shell
npm install       # install dependencies
npm run start     # start the application
npm run test      # run test suite — must pass before committing
npm run lint      # lint — must pass before committing
```

## Structure

> Only files/dirs the agent will navigate or modify. Omit generated/compiled output.
> Format: `path` — one-line purpose

- `src/` — application source
- `src/index.ts` — entry point
- `tests/` — test suite root

## Architecture

> Single-service / layered → ASCII tree (```text), request/data flow top-down.
> Multi-service / event-driven → Mermaid (```mermaid), graph TD, edges labeled with protocol.
> Only include what exists in the codebase.

## Constraints

> Hard rules only — things Agent would get wrong without being told.
> Omit style rules (linter handles those). Omit anything inferable from the codebase.
> Format: `- **label**: rule`

- **Generated files**: do not edit `dist/`, `build/`, or lock files directly
- **Secrets**: never hardcode env vars; use `process.env` / config loader pattern found in `src/config`

## Testing

- **Run**: `npm run test`
- **Location**: `tests/` mirroring `src/` structure
- **Pattern**: `*.test.ts`

<!-- REMINDERS
- Remove any hints from final output. Ex: `>` or `<!--` blocks
-->