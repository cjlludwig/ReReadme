# Lint-Driven Development

This repo uses lint-driven development to turn repeatable agent guidance into fast executable checks. Human-facing docs explain intent; `make check`, ESLint, markdownlint, ruff, mypy, publint, depcheck, deptry, and Jest enforce the parts that should not depend on reviewer memory.

## Baseline Implemented

- `make check` is the default static gate for local agent loops. It is quiet on success and cache-backed where the tools support it.
- `make test` is the default Jest gate. It uses Jest's cache and suppresses success output.
- `make check-full`, `make test-full`, and `make lint-ts-full` are available for debugging cache-sensitive failures or reviewing full output.
- Root `AGENTS.md` maps durable guidance to `RRD###` rule IDs so future checks can cite stable names.
- ESLint covers source and tests with low-noise rules for unused disable comments, unused imports, explicit named exports, no export-all, no `for..in`, and Jest best practices.

## Factory Plugin Decision

Factory's eslint plugin is useful as a reference for lint-driven agent work, but this repo does not import it directly. Its configs assume a different application shape and legacy config style, while this project uses ESLint flat config and has a small CLI/library layout. Rules should be added here only when they fit this repo's actual failure modes.

## More Aggressive Follow-Ups

- Add `check-agent-tools` to verify every OpenAI tool has a zod schema, path-safe file access, gitignore enforcement, and focused tests.
- Add `check-template-hints` to fail if generated README or AGENTS output leaks blockquote guidance, comments, or template-only placeholders.
- Add a release-impact check for changes to `action.yml`, `script.ts`, `lib/`, `bin/`, or `templates/` that require PR notes about versioning and release timing.
- Add an ESLint-disable waiver policy that requires a rule ID, reason, and expiry date on every disable comment.
- Move from global `markdownlint-cli` to a local package dependency once the CLI/package split is resolved.
- Add architecture checks for import cycles and source/test placement if the codebase grows beyond the current flat CLI layout.
- Promote stable script checks into custom ESLint rules only after their behavior has proven useful and low-noise.
