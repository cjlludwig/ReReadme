# Development

How to set up the repo locally, run the tool in development, execute tests and evals, and keep quality checks passing.

## Prerequisites

- **Node.js >= 22** — enforced by `engines.node` in `package.json`
- **uv** — Python package manager for the eval framework ([install](https://docs.astral.sh/uv/)); requires Python >= 3.11
- **OPENAI_API_KEY** — set in your environment before running the tool or evals

## Setup

```shell
git clone https://github.com/connorludwig/rereadme.git
cd rereadme
npm install        # installs deps + configures the husky pre-commit hook automatically
```

To also set up the eval framework and dataset submodules:

```shell
npm run setup
# Equivalent to:
# git submodule update --init evals/datasets/express-server evals/datasets/rereadme
# cd evals && uv sync
```

The two eval dataset submodules are:

- `evals/datasets/express-server` — Node.js/Express/MongoDB sample project
- `evals/datasets/rereadme` — rereadme's own repo (used for self-referencing eval)

## Development Workflow

```shell
npm run dev                        # run the tool via tsx (no compile step)
npm run dev -- --verbose           # with agent trace output
npm run dev -- --interactive       # pause between steps for review
npm run dev -- --check             # dependency check only
npm run dev -- --model gpt-4o      # override the default model
npm run build                      # compile TypeScript to dist/
```

To install globally from source and use the `rereadme` CLI directly:

```shell
npm link
rereadme --help
```

## Tests

Unit tests cover tool calls, agent definitions, and the runner:

```shell
npm test                           # run Jest suite with coverage
```

Eval framework runs rereadme against real dataset repos and compares output against golden READMEs:

```shell
npm run eval                       # all experiments
npm run eval:rereadme              # rereadme self-referencing experiment only
npm run eval:agents                # agents doc experiments
npm run eval:ci                    # CI mode tests
npm run eval:all                   # full pytest suite
npm run eval:report                # evaluation report
```

See [evals/README.md](../evals/README.md) for metrics, golden README workflow, and CI plans.

## Quality Gate

`make check` runs all static analysis — ESLint, markdownlint, ruff, tsc, mypy, depcheck, deptry:

```shell
make check                         # full quality gate (fail-fast)
make fix                           # auto-fix: eslint --fix, markdownlint --fix, ruff --fix
make test                          # Jest only
make lint-ts                       # ESLint only
make lint-md                       # markdownlint only
make typecheck-ts                  # tsc --noEmit only
```

The **pre-commit hook** (installed automatically by `npm install` via husky) runs on every commit:

1. `lint-staged` — auto-fixes staged `.ts`/`.js` files with ESLint and `.md` files with markdownlint
2. `make pre-commit` — type-checks, Python lint, and dependency audits
3. `make test` — full Jest suite

A **PostToolUse hook** in `.claude/settings.json` runs `make check` after every file write or edit when working with Claude Code.

## Standards

- **TypeScript** — typescript-eslint recommended + type-checked rules; no implicit `any`
- **Markdown** — markdownlint enforced; auto-fixable issues resolved by `make fix`
- **Python** — ruff for linting, mypy for type-checking (eval framework only)
- **Tests must pass before commit** — the pre-commit hook enforces this; do not use `--no-verify`
