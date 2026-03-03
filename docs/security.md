# Security

Key security properties for teams evaluating rereadme for use in shared environments or CI pipelines.

## Filesystem Access Is Sandboxed to the Repo Root

Every path the agent requests is resolved against the working directory and rejected if it escapes it (`safePath()` in `lib/tools.ts`). No file outside the repo root can be accessed, regardless of what the agent requests.

## Gitignored Files Are Never Exposed to the Agent

All four filesystem tools enforce gitignore rules before returning content:

- `read_file` and `get_structure` check gitignore status and throw `Access denied` if a file is ignored
- `search_code` uses globby with `gitignore: true`, so ignored files are excluded before any content is read
- `list_directory` filters the result set through gitignore before returning entries

Secrets, credentials, and other sensitive files that belong in `.gitignore` are not sent to the AI.

## The Tool Only Operates in Git Repositories

Gitignore enforcement requires git. The tool does not run outside a git repo, which ensures the above protections are always active.

## The API Key Is Never Logged or Written to Disk

`OPENAI_API_KEY` is read from the environment and passed to the OpenAI client. It is not included in any output files, agent traces, or verbose logs.

## Agents Have No Write Access

The agent tools (`list_directory`, `read_file`, `search_code`, `get_structure`) are read-only. File writes happen only at the CLI layer: the generated README and a timestamped backup (`script.ts`). In CI mode, the README is never modified unless `--apply` is explicitly passed.

## Outbound Network Calls Are Limited to the OpenAI API

The only external network calls are to the OpenAI API via the Agents SDK. No telemetry or other services are contacted.
