# AGENTS.md

<!-- TEMPLATE RULES
- Target: < 100 lines in final output. Every line must be universally applicable to any task in this repo.
- Omit Conventions entirely if patterns are obvious from the codebase — Agent will infer them.
- Omit any section where nothing concrete was discovered.
-->

## Project

> One sentence: what this repo does. Stack as inline code: language, runtime, framework, datastore.

## Commands

> All commands an agent may need. Infer from all task runners, build tools, and CI workflow steps present in the codebase.
> Format as a single fenced shell block with inline comments grouped by lifecycle phase.
> Omit commands not present in the codebase.

<!-- EXAMPLE
```shell
# Develop
npm run start          # start the application (localhost:PORT)
npm run dev            # start with hot reload (if present)

# Validate — run before every commit
npm run lint           # lint
npm run typecheck      # type check (if present)
npm run test:e2e       # end-to-end tests (if present)

# Build
npm run build          # compile / bundle

# Database / migrations (if present)
npm run db:migrate     # run pending migrations

# Make targets (if Makefile present)
make deploy            # describe
```
-->

## Architecture

> Only include if topology is non-obvious from the file structure. Omit for single-concern repos.
> Multi-service or external-dependency-heavy → Mermaid `graph TD`, edges labeled with protocol. Only diagram components with explicit instantiation or config. Do not infer from imports.

## Constraints

> Hard rules only — things Agent would get wrong without being told.
> Omit style rules (linter handles those). Omit anything inferable from the codebase.
> Format: `- **label**: rule`

- **Generated files**: do not edit `dist/`, `build/`, or lock files directly

## Environment

> Omit if the repo has no external prerequisites. Include only what an agent cannot infer or self-configure.

- **Required**: list any env files, secret stores, or external services that must be provisioned before commands will run
- **Setup**: minimal steps to bootstrap a working local environment if not covered by Installation

## Quality

> Infer from test config, lint config, and CI workflow. Omit if fully covered by Commands.

- **Tests**: location, file pattern, and any required setup (e.g. env, seed data)
- **Lint**: tool and any non-obvious rules not enforced by config
- **CI**: what must pass before merge

<!-- REMINDERS
- Remove any hints from final output. Ex: `>` or `<!--` blocks
-->