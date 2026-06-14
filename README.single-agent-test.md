# @cjlludwig/rereadme

![Node version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Build](https://github.com/cjlludwig/rereadme/actions/workflows/ci.yml/badge.svg)
![Last Commit](https://img.shields.io/github/last-commit/cjlludwig/rereadme)
[![npm](https://img.shields.io/npm/v/%40cjlludwig%2Frereadme)](https://www.npmjs.com/package/@cjlludwig/rereadme)

## Description

rereadme is a CLI tool that refreshes README.md files by analyzing a repository and generating an updated README from a template using an AI agent workflow built on the OpenAI Agents SDK. It pulls context from code, documentation, and related assets to produce accurate, up-to-date documentation. The tool supports both a full regeneration flow and a diff-based CI workflow that can generate patch suggestions for targeted improvements.

## Getting Started

### Dependencies

- Node.js >= 22
- uv (Python package manager) for the eval framework (Python >= 3.11)
- OPENAI_API_KEY environment variable for authenticating to OpenAI
- Optional: `markdownlint-cli` for formatting and linting of the generated README

### Environment Variables

```shell
export OPENAI_API_KEY="your_api_key_here"        # Required — authenticates requests to OpenAI
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Optional — enterprise deployments / regional endpoints
```

### Installation

1. Clone the repository
```shell
git clone https://github.com/cjlludwig/rereadme.git && cd rereadme
```

2. Install dependencies
```shell
npm install
```

3. Validate tool dependencies
```shell
npm run check
```

4. (Optional) Install globally to use the CLI as `rereadme`
```shell
npm link
rereadme --help
```

### Development Commands

```shell
npm run dev                        # Run via tsx (no compile step)
npm run dev -- --verbose          # Show agent trace output
npm run dev -- --interactive      # Pause between steps for review
npm run build                      # Compile TypeScript to dist/
```

## Usage

### CLI / script

```shell
rereadme
rereadme --verbose
rereadme --interactive
rereadme --output README-new.md
rereadme --template MY_TEMPLATE.md
rereadme --agents --agents-template MY_AGENTS_TEMPLATE.md
```

### CI mode

```shell
rereadme --ci
rereadme --ci --apply
```

Notes:
- The tool reads repository content and generates a patch- or full-readme depending on flags.
- When used with `--ci --apply`, patches are applied to `README.md` with a timestamped backup by default.

## References

- [OpenAI Agents SDK](https://github.com/openai/agents)
- [Google ZX](https://github.com/google/zx)
- [TypeScript](https://www.typescriptlang.org/)
- [Node.js](https://nodejs.org/)
- [Markdownlint CLI](https://github.com/igorshubovych/markdownlint-cli)
- [OpenAI API](https://platform.openai.com/docs)

## Help

- **Missing OPENAI_API_KEY**: The OpenAI API key must be provided in the environment. Fix: set `OPENAI_API_KEY` (e.g. `export OPENAI_API_KEY="your_api_key"`).
- **Node.js version not supported**: Ensure Node.js >= 22 is installed. Fix: use a Node version manager to install the required version.
- **CLI not found after install**: If `rereadme` is not available, run from the repo with `npm run dev` or install globally with `npm link` and ensure PATH includes the global bin.
- **CI mode requires API access**: When using `--ci`, the evaluation step uses the OpenAI API; ensure the API key is available in the environment.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
