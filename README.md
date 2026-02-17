# ReReadme

CLI tool to refresh README automatically with up to date information based on code contents, documents, and external sources like Confluence. Can be used as part of CI processes to ensure up to date docs in large organizations.

## Description

The rereadme tool automates the process of keeping README files current by:

1. **Analyzing your codebase** - Uses gitingest to extract project structure and code context
2. **Processing with AI** - Leverages OpenAI's API to understand and improve documentation
3. **Integrating external sources** - Can pull in context from Confluence and other documentation sources
4. **Maintaining consistency** - Applies standardized formatting and structure

## Getting Started

### Dependencies

**Required System Tools:**
```shell
# Context gathering tool
pip install gitingest

# Markdown formatting (choose one method)
npm install -g markdownlint-cli    # Recommended: npm global install
# OR
brew install markdownlint-cli      # Alternative: Homebrew (macOS/Linux)
```

**For pyenv users:**
```shell
# Install in current pyenv environment
python -m pip install gitingest
pyenv rehash

# Ensure pyenv shims take precedence (add to ~/.zshrc)
export PATH="$HOME/.pyenv/shims:$PATH"
```

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

The tool executes the following automated workflow:

1. **Dependency Check** - Verifies all required tools are installed
2. **Context Generation** - Runs gitingest to analyze your codebase
3. **AI Processing** - Processes README through AI prompts:
   - Step 1: Standardizes and cleans existing README structure
   - Step 2: Integrates external documentation sources (with `--confluence` flag)
   - Step 3: Updates content based on current codebase analysis
4. **Formatting** - Applies consistent markdown formatting
5. **Cleanup** - Removes temporary files (unless `--keep-context` is used)

## Architecture

The tool is built using:

- **Google ZX** - Node.js CLI script framework for shell operations
- **OpenAI SDK** - AI processing of documentation content
- **Gitingest** - Code context extraction and analysis
- **TypeScript** - Type-safe development with modern JavaScript features

### Project Structure

```
rereadme/
├── script.ts              # Main CLI application
├── lib/
│   ├── agents.ts          # Agent definitions (FileExplorer, ContentAnalyzer, READMEWriter, Orchestrator)
│   ├── runner.ts          # runAgentWorkflow() entry point
│   └── tools.ts           # Filesystem tools for agents
├── templates/             # Output templates
└── package.json           # Dependencies and scripts
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

## Credits

- This project integrates gitingest (for code context), OpenAI (for content generation), and Confluence (for external documentation) to deliver up-to-date, well-structured README documentation.
