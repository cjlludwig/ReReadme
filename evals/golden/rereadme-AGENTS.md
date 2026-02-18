# AGENTS.md

## Project

rereadme is a TypeScript CLI tool that refreshes README files using a two-agent workflow driven by OpenAI Agents and ZX, with filesystem tools and a templated output format. Stack: `TypeScript`, `Node.js`, `ZX`, `OpenAI Agents SDK`, local filesystem.

## Commands

```shell
npm install       # install dependencies
npm run start     # start the application
npm run test      # run test suite — must pass before committing
npm run lint      # lint — must pass before committing
make lint-ts # ESLint (typescript-eslint recommended + type-checked)
make lint-md # markdownlint on all `*.md` files |
make lint-py # ruff check` on `experiments/
make typecheck-ts # tsc --noEmit
make typecheck-py # mypy` on `experiments/
make test # npm test` (Jest)
make check # All of the above, sequentially, fail-fast
make fix # Auto-fix: `eslint --fix` + `markdownlint --fix` + `ruff --fix`
```

## Structure

- `bin/` — CLI wrapper entry points (bin/rereadme.js)
- `script.ts` — Root CLI orchestrator
- `lib/` — Agent workflow components
- `lib/agents.ts` — Researcher and TemplateEnforcer agent definitions
- `lib/tools.ts` — Filesystem tools (listDirectory, readFile, searchCode, getStructure)
- `templates/` — Output templates
- `templates/README_TEMPLATE.md` — Template used to structure the final README
- `docs/` — Documentation references and project notes
- `package.json` — Project metadata, scripts, and dependencies

## Architecture

Two-agent, layered workflow:

Client (CLI)  
 └─ Tools (filesystem)  
       └─ Researcher  
             └─ TemplateEnforcer  
                   └─ README.md (final output)

The workflow is orchestrated by script.ts, kicked off by bin/rereadme.js, with the Researcher extracting factual repository details via internal tools and the TemplateEnforcer applying the standardized README template.

## Constraints

- **Generated files**: do not edit `dist/`, `build/`, or lock files directly
- **Secrets**: never hardcode env vars; use `process.env` / config loader pattern found in `src/config`

## Testing

- **Run**: `npm run test`
- **Location**: `tests/` mirroring `lib/`/project structure
- **Pattern**: `*.test.ts`

## Help

Common issues and workarounds:

- Missing dependencies: Run `npm run check` or `npm run install` to verify tooling
- OpenAI API errors: Ensure `OPENAI_API_KEY` is set and has sufficient credits
- Permission errors: Ensure you have write access to the target README file
- Large repositories: Adjust scope or use interactive mode to review steps

Tips:

- Use `--interactive` to review changes at each step
- Use `--verbose` for detailed command output
- The tool creates backups of existing READMEs before updating
- Works best with structured codebases and standard conventions

## References

- [Google ZX Documentation](https://github.com/google/zx)
- [OpenAI Agents (GitHub Repository)](https://github.com/openai/agents)
- [Markdownlint CLI](https://github.com/igorshubovych/markdownlint-cli)
