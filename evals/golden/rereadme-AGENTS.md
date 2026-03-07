# AGENTS.md

## Project

`rereadme` is a CLI tool that refreshes `README.md` files from code context, existing docs, and optional external sources using `TypeScript`, `Node.js`, `Google ZX`, and the `OpenAI` API.

## Commands

```shell
# Develop
npm run dev                      # run the CLI from source
npm run refresh                  # run the README refresh workflow
npm run refresh:interactive      # run the workflow with manual step approval
npm run help                     # show CLI help
npm run check                    # verify required dependencies

# Validate
npm test                         # run Jest tests
make test                        # run npm test via Make
make lint-ts                     # lint TypeScript with ESLint
make lint-md                     # lint Markdown with markdownlint
make lint-py                     # lint experiments/ Python with Ruff
make typecheck-ts                # type-check TypeScript with tsc --noEmit
make typecheck-py                # type-check experiments/ Python with mypy
make deps-ts                     # check Node dependency usage with depcheck
make deps-py                     # check Python dependency usage with deptry
make check                       # run all lint, typecheck, and dependency checks
make fix                         # apply available ESLint, markdownlint, and Ruff fixes

# Build
npm run build                    # compile TypeScript
npm run start                    # run compiled output

# Experiments / eval
npm run setup                    # init submodules and sync experiments/ Python deps
npm run eval                     # run deepeval tests in experiments/
```

## Architecture

```mermaid
graph TD
  CLI["`script.ts` CLI"] -->|"filesystem / shell"| Runner["`lib/runner.ts`"]
  Runner -->|"agent orchestration"| Agents["`lib/agents.ts`"]
  Agents -->|"filesystem tools"| Tools["`lib/tools.ts`"]
  CLI -->|"reads/writes"| Templates["`templates/`"]
  CLI -->|"exec"| Gitingest["`gitingest` CLI"]
  CLI -->|"API"| OpenAI["`OpenAI API`"]
  CLI -->|"optional MCP"| Confluence["`Confluence`"]
```

## Constraints

- **Generated files**: do not edit `dist/`, `build/`, or lock files directly
- **Runtime**: use `Node.js >=22.0.0`
- **System tools**: `gitingest` and `markdownlint-cli` must be installed for the workflow and checks described in the repo
- **Experiments**: `experiments/` uses `uv` and Python tooling; `npm run setup` initializes submodules and syncs those dependencies

## Environment

- **Required**: set `OPENAI_API_KEY` before running AI-backed README processing or eval workflows
- **Setup**: install `gitingest` with `pip install gitingest`; install `markdownlint-cli` with `npm install -g markdownlint-cli` or `brew install markdownlint-cli`
- **Optional**: Confluence MCP integration is supported for external documentation sources

## Quality

- **Tests**: Jest runs `script.spec.ts` via `npm test`; eval coverage lives under `experiments/` and runs with `npm run eval`
- **Lint**: TypeScript uses `eslint`; Markdown uses `markdownlint`; Python in `experiments/` uses `ruff`
- **CI**: the planned evaluation workflow installs Node, Python, and `uv`, then runs `npm run eval`; it requires `OPENAI_API_KEY` in repository secrets
