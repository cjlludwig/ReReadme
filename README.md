# ReReadme

![Node version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Build](https://github.com/cjlludwig/ReReadme/actions/workflows/ci.yml/badge.svg)

## Description

> [!WARNING]
> If you're not comfortable or allowed to leverage Dev AI tools on your codebase this may not be the right tool for you.
> This tool allows OpenAI Agents to inspect relevant files within a repo to determine repo details.
> Check compliance policies before usage.

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

### CLI Tool Usage (Global Installation)

```shell
# Run the complete README refresh workflow in current directory
rereadme

# Show detailed command output
rereadme --verbose

# Run with interactive mode (pause between steps)
rereadme --interactive

# Specify input/output files
rereadme --input README.md --output README-new.md

# Override the AI model
rereadme --model gpt-4o

# Skip backup creation
rereadme --no-backup

# Generate agents documentation
rereadme --agents
rereadme --agents --agents-output AGENTS.md

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

The tool is built using:

- **Google ZX** - Node.js CLI script framework for shell operations
- **OpenAI Agents SDK** - AI processing of documentation content
- **TypeScript** - Type-safe development with modern JavaScript features

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
