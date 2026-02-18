# ReReadme

![Node version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

The rereadme CLI tool automatically refreshes README.md files by analyzing the repository, processing findings with AI prompts, and (optionally) integrating external sources. It is built around a two-agent workflow powered by the OpenAI Agents SDK to explore a codebase, distill the discovered context into a polished README, and apply a consistent structure.

## Description

The rereadme tool automates the process of keeping README files current by:

1. **Analyzing your codebase** - Uses FileAgent to extract project structure and code context
2. **Processing with AI** - Leverages OpenAI's API to understand and improve documentation
3. **Integrating external sources** - Can pull in context from Confluence and other documentation sources
4. **Maintaining consistency** - Applies standardized formatting and structure

## Getting Started

### Dependencies

- Node.js >= 22.0.0 (as specified by engines.node in package.json)
- OpenAI API key via the OPENAI_API_KEY environment variable
- Optional: markdownlint-cli for formatting and linting of the generated README

**Environment Variables:**

- `OPENAI_API_KEY` - Your OpenAI API key for processing README content

**Optional Setup:**

- Confluence MCP integration for external documentation sources

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

# Include Confluence MCP server step for external sources
rereadme --confluence

# Continue processing even if some steps fail
rereadme --continue

# Keep gitingest context files after completion
rereadme --keep-context

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
npm run dev -- --confluence       # Include Confluence MCP server step
npm run dev -- --check            # Check dependencies only
npm run help                       # Show help
```

### Workflow Steps

The tool executes an automated workflow comprised of:

1) Dependency Check
   - Verifies required tools are installed (markdownlint-cli, OpenAI API key)
2) Context Generation
   - Uses the repository tools to analyze the codebase and gather context
3) AI Processing
   - The AI prompts standardize the existing README, integrate external sources (if enabled), and update content based on current code analysis
4) Formatting
   - Applies consistent Markdown formatting to the resulting README
5) Cleanup
   - Removes temporary/context files unless explicitly requested to keep them

Additional implementation details:

- The workflow is implemented in script.ts and orchestrates the agent workflow via runAgentWorkflow in lib/runner.js
- The AI-driven generation uses the OpenAI Agents SDK with a two-agent pipeline: Researcher and TemplateEnforcer, plus a DetailFetcher handoff for missing facts

## Architecture

The tool is built using:

- **Google ZX** - Node.js CLI script framework for shell operations
- **OpenAI Agents SDK** - AI processing of documentation content
- **TypeScript** - Type-safe development with modern JavaScript features

### Project Structure

```text
rereadme/
├── bin/
│   └── rereadme.js          # CLI wrapper for running the TypeScript script
├── lib/
│   ├── agents.ts              # Agent definitions (Researcher, TemplateEnforcer, DetailFetcher)
│   ├── runner.ts              # runAgentWorkflow() entry point
│   └── tools.ts               # Filesystem tools for agents
├── templates/                 # Output templates
│   ├── AGENTS_TEMPLATE.md
│   └── README_TEMPLATE.md
├── docs/                      # Documentation (e.g., project-spec.md)
├── script.ts                    # Main CLI application
├── package.json               # Dependencies and scripts
├── tsconfig.json
```

## Help

**Common Issues:**

- **Missing dependencies**: Run `rereadme --check` to identify missing tools
- **OpenAI API errors**: Ensure `OPENAI_API_KEY` is set and has sufficient credits
- **Permission errors**: Ensure you have write access to the README.md file
- **Large repositories**: Gitingest has size limits; adjust include/exclude patterns if needed

**Tips:**

- Use `--interactive` mode to review changes at each step
- Use `--verbose` to see detailed command output for debugging
- Backup important README files before running (tool creates automatic backups)
- The tool works best with structured codebases that follow standard conventions

## References

- [Google ZX Documentation](https://google.github.io/zx/)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Gitingest Documentation](https://github.com/cyclotruc/gitingest)
- [Markdownlint CLI](https://github.com/igorshubovych/markdownlint-cli)

## License

This project is licensed under the MIT License.
