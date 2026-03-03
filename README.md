# ReReadme

![Node version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Build](https://github.com/cjlludwig/ReReadme/actions/workflows/ci.yml/badge.svg)

## Description

> [!WARNING]
> If you're not comfortable or allowed to leverage Dev AI tools on your codebase this may not be the right tool for you.
> This tool allows OpenAI Agents to inspect Git tracked files within a repo to determine repo details.
>
> See [Security](docs/security.md) for access protections and [Observability](docs/observability.md) for agent trace visibility.

The rereadme CLI tool automatically refreshes README.md files by analyzing the repository and processing findings with AI. It uses a multi-agent architecture (Researcher → DetailFetcher → TemplateEnforcer) powered by the OpenAI Agents SDK to explore a codebase, distill the discovered context into a polished README, and apply a consistent structure.

## Getting Started

### Dependencies

- Node.js >= 22.0.0 (as specified by engines.node in package.json)
- OpenAI API key via the OPENAI_API_KEY environment variable
- Optional: markdownlint-cli for formatting and linting of the generated README

**Environment Variables:**

- `OPENAI_API_KEY` - Your OpenAI API key for processing README content

**Troubleshooting Dependencies:**

- Run `rereadme --check` to verify all tools are installed correctly (or `npm run check` if using locally)
- For markdownlint issues, try the npm version: `npm install -g markdownlint-cli`

### Installation

#### Global Installation (Recommended)

```shell
# Install from source (for development/testing)
git clone https://github.com/connorludwig/rereadme.git
cd rereadme
npm install
npm link

# Verify installation
rereadme --help
```

#### Local Installation

```shell
# Clone and install locally
git clone https://github.com/connorludwig/rereadme.git
cd rereadme
npm install

# Check dependencies
npm run check
```

## Usage

> For real-world usage scenarios, see [Workflows](docs/workflows.md).

### CLI Tool Usage (Global Installation)

```shell
# Run the complete README refresh workflow in current directory
rereadme

# Show detailed command output
rereadme --verbose

# Run with interactive mode (pause between steps)
rereadme --interactive

# Specify output file
rereadme --output README-new.md

# Override the AI model
rereadme --model gpt-4o

# Skip backup creation
rereadme --no-backup

# Generate agents documentation
rereadme --agents
rereadme --agents --agents-output AGENTS.md

# Use custom templates
rereadme --template MY_TEMPLATE.md
rereadme --agents --agents-template MY_AGENTS_TEMPLATE.md

# CI mode: analyze diff and write README-suggestions.md
rereadme --ci
rereadme --ci --base-ref origin/main

# CI mode: analyze diff and apply patches directly to README.md
rereadme --ci --apply

# Apply an existing suggestions file to README.md
rereadme --apply
rereadme --apply --ci-output custom-suggestions.md

# Check dependencies only
rereadme --check

# Show help
rereadme --help
```

### Local Development Usage

```shell
# Run using npm scripts (if not globally installed)
npm run dev                        # Run basic workflow
npm run dev -- --verbose          # Show detailed output
npm run dev -- --interactive      # Run with manual step approval
npm run dev -- --check            # Check dependencies only
npm run help                       # Show help
```

### Custom Templates

> For template design guidance and conventions, see [Templates](docs/templates.md).

You can supply your own markdown template with `--template FILE` (for README) or `--agents-template FILE` (for AGENTS.md, requires `--agents`).

Template requirements:

- Must be a valid markdown file with at least one heading (`#`)
- Use `>` blockquote lines as content placeholders (matches agent behavior)
- Maximum size: 50KB

### CI Mode

`--ci` runs a lightweight diff-focused workflow safe for every PR. A DiffAnalyzer agent reads the git diff and determines whether changes are significant enough to document. If so, a ReadmePatcher agent generates surgical suggestions written to `README-suggestions.md`.

Adding `--apply` writes the patched README directly to `README.md` (with a timestamped backup):

```shell
# Analyze diff and write suggestions only (safe, no README changes)
rereadme --ci

# Analyze diff and apply patches in one step
rereadme --ci --apply

# Apply a previously written suggestions file
rereadme --apply
```

### Workflow Steps

The tool executes an automated workflow comprised of:

1) Dependency Check
   - Verifies required tools are installed (markdownlint-cli, OpenAI API key)
2) Agent Workflow
   - Researcher explores the repo structure and gathers context via filesystem tools
   - DetailFetcher handles follow-up queries for missing facts (handoff from Researcher)
   - TemplateEnforcer generates the final README from the template using gathered context
3) README Update
   - Writes the generated README with a timestamped backup of the original
4) Formatting
   - Applies consistent Markdown formatting via markdownlint --fix

Additional implementation details:

- The workflow is implemented in script.ts and orchestrates the agent workflow via runAgentWorkflow in lib/runner.js
- The AI-driven generation uses a multi-agent architecture: Researcher → DetailFetcher → TemplateEnforcer, plus an optional AgentsDocWriter (when `--agents` is used)

## Architecture

> For local setup, development workflow, and contribution standards, see [Development](docs/development.md).

The tool is built using:

- **Google ZX** - Node.js CLI script framework for shell operations
- **OpenAI Agents SDK** - AI processing of documentation content
- **TypeScript** - Type-safe development with modern JavaScript features

## Quality

LLMs are inherently non-deterministic, so rereadme takes a two-layer approach to agent quality. Tool calls are tested explicitly in the Jest unit suite to assert allowed filesystem actions and path boundaries — the deterministic, security-critical behavior that must hold on every run. General output quality — structure, accuracy, completeness — is validated through a DeepEval eval framework that runs rereadme against real dataset repos and compares output against golden READMEs using both deterministic checks and an LLM-as-judge metric.

See [evals/README.md](evals/README.md) for setup, metrics, and the golden README workflow.

## Help

**Common Issues:**

- **Missing dependencies**: Run `rereadme --check` to identify missing tools
- **OpenAI API errors**: Ensure `OPENAI_API_KEY` is set and has sufficient credits
- **Permission errors**: Ensure you have write access to the README.md file
**Tips:**

- Use `--interactive` mode to review changes at each step
- Use `--verbose` to see detailed command output for debugging
- Backup important README files before running (tool creates automatic backups)
- The tool works best with structured codebases that follow standard conventions

## References

- [Google ZX Documentation](https://google.github.io/zx/)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Markdownlint CLI](https://github.com/igorshubovych/markdownlint-cli)

## License

This project is licensed under the MIT License.
