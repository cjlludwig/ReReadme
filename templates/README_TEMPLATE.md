# {Project Title}

<!-- TEMPLATE RULES
- Every heading (lines starting with #) is REQUIRED and must appear verbatim, including the # level.
- Replace blockquote guidance (lines starting with >) with real project content. Remove all blockquotes in final output.
- Sections marked (Optional) may be omitted only if no relevant information was discovered.
- Output ONLY the final README markdown. No preamble, no closing commentary, no wrapping code fences.
-->

<!-- BADGES (Optional)
Infer and render relevant badges immediately after the project title, before ## Description.
Only include badges for tooling, services, or configuration actually present in the codebase.

Common sources to check:
- package.json / pyproject.toml / go.mod → language and runtime version badges
- CI config (.github/workflows, .circleci, .travis.yml) → build status badge using the actual workflow file path
- License file or license field in package.json → license badge
- Docker / devcontainer config → docker badge
- Test framework present (jest, pytest, mocha, etc.) → link to test config or coverage if wired up

Format: shields.io static badges or official badge URLs where they exist.
Use the repo's own metadata for labels and colors — do not invent version numbers or status.

Example (render only what applies):
-->

![Node version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Build](https://github.com/{org}/{repo}/actions/workflows/{workflow}.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue)
![Docker](https://img.shields.io/badge/docker-supported-blue)

## Description

> One to two concise sentences: what does this project do and why does it exist?
> Name the core technologies explicitly (e.g. Express.js, MongoDB, React).

## Getting Started

### Dependencies

> Bulleted list of prerequisites NOT installed by the package manager:
>
> - Runtime and version (e.g. `Node.js >= 18`, `Python 3.11 via pyenv`)
> - External services with default connection string (e.g. MongoDB on `localhost:27017`)
> - Optional tooling on its own line, marked `(optional)` (e.g. Docker + VS Code Dev Containers extension)

### Installation

> Numbered steps. Each step that requires a shell command must render it in a fenced code block indented under the step, like:
>
> 1. Step description
>
>    ```shell
>    command here
>    ```
>
> 2. For service-start steps with no single command, use a sub-bullet instead of a code block.
>
> If an alternative setup exists (Dev Container, Docker Compose), append it as a bold inline callout after the numbered list:
> **Alternative (optional)**: One-line description of how to use it.

## Usage

> Show how to interact with the project after it is running. Use a single fenced code block per interaction mode present in the codebase. Include only modes that apply:
>
> **CLI / script** — shell commands with inline comments describing each
> **API** — curl examples ordered: start → health check → write → read
> **Library** — minimal import + initialization + one representative call, in the language of the project
>
> Do not include modes that are not present. If multiple modes exist, use one fenced block per mode with a bold label above each block.

**Start**
```shell
# Start — describe what this does and where it listens
<start command>
```

**API**
```shell
# Health check
curl http://localhost:PORT/

# Example write
curl -X POST -H "Content-Type: application/json" \
  -d '<minimal valid payload>' \
  http://localhost:PORT/<route>

# Example read
curl http://localhost:PORT/<route>/<id>
```

**Library**
```js
import foo from "<package-name>";

const client = foo({ option: "value" });
client.method(args); // describe what this does
```

## Architecture

> Choose ONE format based on project structure:
>
> **Single-service or layered app** → ASCII tree in a fenced ```text block showing request/data flow top to bottom.
>   Follow the tree with a **Layer exports:** bold heading and a bulleted list of key exports per layer.
>
> **Multi-service, event-driven, or external-dependency-heavy** → Mermaid diagram in a fenced ```mermaid block.
>   Use `graph TD` for top-down flow. Label edges with the protocol or action (e.g. HTTP, MongoDB query).
>
> Only include components found in the codebase. Do not invent layers.
>
> Mermaid example shape:
> ```mermaid
> graph TD
>   Client -->|HTTP| Gateway
>   Gateway -->|gRPC| ServiceA
>   ServiceA -->|query| DB[(Database)]
> ```

## References

> (Optional) Markdown link list to official docs for each named technology in the README.
> Format: `- [Technology Name](url)`

## Help

> (Optional) Known issues, required environment quirks, and common errors.
> Format each entry as: `- **Short label**: Explanation and fix.`
> Cover at minimum: any external service connection requirements, any non-obvious env setup.

## License

> (Optional) Include if a LICENSE file or license identifier was found in the codebase.
> Format: one line naming the license, followed by a link to the LICENSE file if present.

This project is licensed under the [MIT License](LICENSE).