import { Agent } from '@openai/agents';
import { listDirectory, readFile, searchCode, getStructure } from './tools.js';

export function createAgents(model: string, readmeTemplate: string) {
  const fileExplorer = new Agent({
    name: 'FileExplorer',
    model,
    instructions: `You are a repository explorer. Your job is to navigate the repository and identify key files that describe the project:
- package.json, Cargo.toml, pyproject.toml, go.mod, or other manifest files
- Entry points and main source files
- Configuration files (tsconfig, webpack, docker, CI/CD)
- Container/dev environment configs (Dockerfile, docker-compose.yml, .devcontainer/)
- Test files and test configuration
- Documentation files

Start by listing the root directory, then explore important subdirectories including hidden directories like .devcontainer/. Build a complete map of the project structure. Report your findings as a structured summary of what you found and where.

The final README will follow this template — prioritize finding files relevant to each section:
${readmeTemplate}`,
    tools: [listDirectory, readFile, searchCode],
    handoffDescription:
      'Explore repository structure and find important files',
  });

  const contentAnalyzer = new Agent({
    name: 'ContentAnalyzer',
    model,
    instructions: `You are a code analyst. Given information about a repository's structure, your job is to read and analyze the key files to extract:
- Project name: the exact "name" field from package.json (or equivalent manifest) — this becomes the README title
- Project purpose and description
- Dependencies and their roles (name each core technology, e.g. Express.js, MongoDB)
- Recommended version manager for the runtime (e.g. nvm for Node.js, pyenv for Python)
- Architecture patterns: module layers, how requests flow from entry point to data layer
- Build, test, and run commands (exact npm scripts or equivalents)
- API endpoints: every route, HTTP method, and example payload. Identify health check / root endpoints (e.g. GET /).
- Ports and URLs the server listens on (e.g. http://localhost:9000)
- Configuration and environment requirements
- Container/dev environment setup if Dockerfiles or .devcontainer exist

Read the files identified in the conversation so far. Focus on extracting factual, specific information. Do not guess or fabricate details. Report your findings as a structured technical summary organized by the template sections below.

The final README will follow this template — ensure your analysis covers information needed for each section:
${readmeTemplate}`,
    tools: [readFile, searchCode, getStructure],
    handoffDescription:
      'Analyze file contents to extract technical details',
  });

  const readmeWriter = new Agent({
    name: 'READMEWriter',
    model,
    instructions: `You are a technical writer specializing in README documentation. Using the analysis provided in the conversation, generate a complete README.md file.

The template below is your single source of truth for structure, headers, and content guidance. Follow every instruction in it exactly.

README Template:
${readmeTemplate}

Additional rules:
- Use the exact project name from the manifest (package.json "name", etc.) as the # title
- Only include information that was discovered by the previous agents — do not fabricate content
- Use clear, concise language for a developer audience
- Your entire output must be ONLY the raw README markdown — no preamble, no closing commentary, no wrapping code fences`,
    tools: [readFile],
    handoffDescription:
      'Write the final README using accumulated context',
  });

  const orchestrator = Agent.create({
    name: 'Orchestrator',
    model,
    instructions: `You coordinate README generation for a code repository. Follow these steps in order:

1. Hand off to FileExplorer to map the repository structure and identify key files.
2. Hand off to ContentAnalyzer to read and extract technical details from the discovered files.
3. Hand off to READMEWriter to produce the final README.

Your final output must be ONLY the README markdown content produced by READMEWriter. Do not add any other text.`,
    handoffs: [fileExplorer, contentAnalyzer, readmeWriter],
  });

  return { orchestrator, fileExplorer, contentAnalyzer, readmeWriter };
}
