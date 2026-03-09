# Observability

Because rereadme runs on your OpenAI API key, all inference, traces, and usage data live in your account — no telemetry is routed anywhere else. The OpenAI Agents SDK instruments every run automatically: tool calls, agent handoffs, model inferences, and timing are all captured without any configuration in the codebase.

## What Gets Traced

Each rereadme run produces one trace per workflow. The agents you will see by name:

**Standard workflow (`rereadme`):**

- `ReadmeWriter` — repo exploration, context gathering, and README generation in a single pass
- `AgentsDocWriter` — agents doc generation (only when `--agents` is passed)

**CI workflow (`rereadme --ci`):**

- `DiffAnalyzer` — diff significance evaluation
- `ReadmePatcher` — surgical README suggestion generation (only when diff is significant)

These names come from the `name` field on each `Agent` definition in `lib/agents.ts`.

## View Traces

Traces land in your OpenAI account in real time as each run completes.

1. Go to [platform.openai.com/logs](https://platform.openai.com/logs?api=traces) and select the **Traces** tab
2. Each rereadme run appears as a top-level trace entry
3. Expand a trace to see individual agent spans, tool calls, and handoffs with latency and token counts

For setup steps and filtering options, see the [OpenAI tracing guide](https://openai.github.io/openai-agents-js/guides/tracing/).

## Use Traces for Debugging

Traces are most useful when a run produces unexpected output:

- **Agent skipped a section** — check the `ReadmeWriter` span; look at which files were read and whether the relevant file was accessed
- **CI mode did not flag a change** — check the `DiffAnalyzer` span and its structured output for `signalLevel` and `significanceReason`
- **Run was slow** — span latencies show where time was spent (typically the largest model inference call)

## Live Output in the Terminal

Pass `--verbose` to stream agent trace output to the terminal during a run:

```shell
rereadme --verbose
rereadme --ci --verbose
```

This shows tool calls and agent transitions in real time — useful for local development and debugging without opening the platform UI.

## References

- [OpenAI Agents SDK — Tracing guide](https://openai.github.io/openai-agents-js/guides/tracing/)
- [OpenAI Platform — Traces](https://platform.openai.com/logs?api=traces)
- [rereadme README](../README.md)
