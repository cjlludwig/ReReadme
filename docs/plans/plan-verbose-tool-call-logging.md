# Plan: Verbose Tool Call Logging

## Context

Currently, verbose mode shows coarse step-level output (e.g., "Step 1/3: Researcher") but goes silent while agents are actively working. Users have no sense of progress during the multi-turn agent loop — tool calls happen invisibly. This adds tasteful, dimmed per-tool-call lines using the SDK's lifecycle hooks so users can follow along without being overwhelmed.

## Approach

`Agent extends AgentHooks extends EventEmitterDelegate` — every agent instance supports `.on('agent_tool_start', handler)` directly. This is the SDK's lifecycle hooks API. We attach handlers to each agent that has tools, right after they're created in `runner.ts`. No `Runner` class needed; existing `run()` calls stay unchanged.

`createAgents()` already returns `detailFetcher` (agents.ts:214), so no changes to `lib/agents.ts`. All changes live in `lib/runner.ts` only.

## Implementation

### Files to modify

**`lib/runner.ts`** — only file that needs changes.

#### 1. Add `summarizeToolCall` helper (private to module)

Extracts the most meaningful detail (path, pattern, refs) from each known tool's argument JSON. Falls back to empty string for unknown tools.

```ts
function summarizeToolCall(name: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    switch (name) {
      case 'list_directory': return (args.path as string) ?? '.';
      case 'read_file':      return args.path as string;
      case 'search_code':    return `"${args.pattern}"${args.glob ? ` in ${args.glob}` : ''}`;
      case 'get_structure':  return args.path as string;
      case 'gitDiffStat':    return `${args.fromRef}…${args.toRef ?? 'HEAD'}`;
      case 'gitLog':         return `${args.fromRef}…${args.toRef ?? 'HEAD'}`;
      case 'gitDiff':        return `${args.fromRef ?? 'origin/main'}…${args.toRef ?? 'HEAD'}`;
      default:               return '';
    }
  } catch {
    return '';
  }
}
```

#### 2. Add `attachToolLogger` helper

Attaches the `agent_tool_start` lifecycle hook to any agent. Uses `log.detail()` which already self-guards on `_verbose` — no extra condition needed.

```ts
function attachToolLogger(agent: Agent): void {
  agent.on('agent_tool_start', (_ctx, tool, details) => {
    const tc = details.toolCall;
    if (tc.type !== 'function_call') return;
    const summary = summarizeToolCall(tc.name, tc.arguments);
    log.detail(`→ ${tc.name}${summary ? `  ${summary}` : ''}`);
  });
}
```

#### 3. Wire into `runAgentWorkflow()`

After `createAgents()`, attach to `researcher` and `detailFetcher` (the two agents that have tools):

```ts
const { researcher, templateEnforcer, detailFetcher, agentsDocWriter } = createAgents(...);
attachToolLogger(researcher);
attachToolLogger(detailFetcher);
```

Existing `run(researcher, ...)` calls are unchanged.

#### 4. Wire into `runDiffWorkflow()`

After `createDiffAgents()`, attach to both diff agents:

```ts
const { diffAnalyzer, readmePatcher } = createDiffAgents(model);
attachToolLogger(diffAnalyzer);
attachToolLogger(readmePatcher);
```

## Sample verbose output

```
◆  Step 1/3: Researcher (model: gpt-5-nano)
◆  → list_directory  .
◆  → read_file  package.json
◆  → search_code  "openai" in *.ts
◆  → read_file  lib/agents.ts
◆  → get_structure  lib/runner.ts
◆  → list_directory  src/
◆  Researcher done (3241 chars)
◆  Step 2/3: TemplateEnforcer
◆  → read_file  tsconfig.json      ← (DetailFetcher, called via handoff)
◆  TemplateEnforcer done (2804 chars)
```

(The `◆` and dimming come from `log.detail()` → `p.log.step(pc.dim(msg))` — less visually prominent than the step markers.)

## Verification

1. `npm run dev -- --verbose` in this repo — confirm dimmed `→ tool_name  path` lines appear under each step marker during agent execution
2. `npm run dev` (no `--verbose`) — confirm no tool lines appear
3. `npm run dev -- --ci --verbose` — confirm diff tool calls (`gitDiffStat`, `gitLog`, `gitDiff`) appear
4. `npm test` — existing tests pass unchanged (hooks don't affect agent outputs)
5. `make check` — lint/typecheck pass
