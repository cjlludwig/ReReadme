# Findings: Single-Agent README Workspace

## Summary

The section workspace makes README generation more controllable and reduces broad rediscovery, but current eval and ad hoc runs show that clean structure is not enough. The agent can produce valid markdown that still misses required nested sections, exact commands, and expected technical details.

## Key Gaps

### Section Control vs. Nested Requirements

The workspace now advances through top-level `##` sections and assembles the final README from saved sections. This fixed duplicated nested headings and prevented the writer from adding arbitrary top-level sections.

The Express eval still failed because `### Dependencies` and `### Installation` were missing. Those are nested headings inside `## Getting Started`, so the workspace currently preserves them as instructions but does not enforce that required nested template headings appear in the saved section.

### Command Coverage

The eval called out missing `npm start` in both README and AGENTS checks. This suggests the writer is summarizing available commands instead of exhaustively grounding command lists from `package.json`, task runners, and CI workflows.

The single bounded discovery pass lowers tool calls, but it increases the risk that the agent keeps an incomplete command inventory unless the prompt and validator make command coverage explicit.

### Structural Validation Is Not Semantic Validation

The workspace validator now catches:

- leaked template guidance
- extra top-level headings inside a saved section
- malformed preamble/code-fence garbage
- unlabeled fenced code blocks
- required sections saved as omitted

It does not yet validate semantic completeness, such as:

- required nested headings
- required package scripts like `npm start`
- environment variables discovered from source/config
- service ports and external dependencies
- expected test/build/lint commands
- architecture diagram abstraction quality

### Architecture Diagram Quality

The Express eval failed the architecture diagram check. The diagram was present but did not match the expected abstraction: it missed the external-layer style and included implementation-detail nodes.

This points to a prompt/workflow gap. The architecture agent needs stronger constraints around external actors/services/layers first, and implementation details only when they are necessary to explain user-facing architecture.

### Tool-Call Reduction Tradeoff

Ad hoc validation showed improved tool-call volume. A successful local CLI run used 20 tool calls:

- `get_file_tree`: 1
- `read_files`: 1
- workspace tools: 18

That is materially better than uncontrolled exploration. The tradeoff is that quality now depends heavily on the first discovery pass being complete. If the agent under-reads package scripts, config, or docs in that pass, later sections inherit the gap.

### Retry Logic Helps Availability, Not Quality

The previous OpenAI failures were mostly 429s and connection errors. SDK retries plus workflow-level retry/backoff provide more headroom and should reduce transient failures.

They do not address output drift. Once the run succeeds, quality is still governed by the workspace protocol, prompt specificity, and validation rules.

### CLI Flag Semantics

Ad hoc validation caught a real CLI bug: `zx.argv` maps `--no-architecture` to `architecture: false`, not `no-architecture: true`. The same pattern applies to `--no-backup`.

That caused the architecture agent to run even when `--no-architecture` was passed. This is fixed, but it is a good example of direct CLI validation catching behavior that static checks missed.

## Eval Snapshot

Express eval command:

```shell
NO_COLOR=1 uv run deepeval test run test_express_server.py -v
```

Result:

- 3 passed
- 6 failed
- runtime: about 198 seconds

Failures:

- `test_section_headers`: missing `### Dependencies`, `### Installation`
- `test_section_content`: missing/insufficient content for those nested sections
- `test_keywords`: missing `npm start`
- `test_architecture_diagram`: diagram abstraction/style mismatch
- `test_agents_keywords`: missing `npm start`
- `test_agents_golden_similarity`: AGENTS output diverged from golden, especially tests and expected behavior

Passes:

- `test_golden_readme_similarity`
- `test_agents_section_headers`
- `test_agents_section_content`

## Main Takeaway

The section workspace is a useful control surface, but it currently enforces form more than facts. The next structural improvement should make template-derived expectations richer: required nested headings, command inventories, and discovered fact checklists should become explicit validation targets instead of relying on the model to remember them from instructions.
