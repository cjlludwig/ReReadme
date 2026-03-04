# Plan: Tool Call Stats Tracking for Eval Efficiency Metric

## Context

The rereadme Researcher agent makes 25+ tool calls per run, causing OpenAI 429 TPM rate limit errors. Before optimizing with batch tools (`get_file_tree`, `read_files`), we need a measurable metric that:
1. Emits a structured stats JSON per run (kept in `evals/results/` for inspection)
2. Asserts in evals that total tool calls stay within a budget — failing at the current ~25 baseline, passing after optimization

Data flow: `runner.ts` counts events → `script.ts` writes `--stats-output` JSON → `conftest.py` reads JSON → test files assert budget.

---

## File 1: `lib/runner.ts`

### 1a. Add `WorkflowStats` interface (after imports, before `summarizeToolCall`)

```typescript
export interface WorkflowStats {
  toolCallCount: number;
  toolCallsByAgent: Record<string, number>;
  toolCallsByTool: Record<string, number>;
}
```

### 1b. Change `attachToolLogger` signature — add `agentName` + shared `stats` param, increment counters

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attachToolLogger(agent: Agent<unknown, any>, agentName: string, stats: WorkflowStats): void {
  agent.on('agent_tool_start', (_ctx, _tool, details) => {
    const tc = details.toolCall;
    if (tc.type !== 'function_call') return;
    const summary = summarizeToolCall(tc.name, tc.arguments);
    log.toolCall(`→ ${tc.name}${summary ? `  ${summary}` : ''}`);
    stats.toolCallCount += 1;
    stats.toolCallsByAgent[agentName] = (stats.toolCallsByAgent[agentName] ?? 0) + 1;
    stats.toolCallsByTool[tc.name] = (stats.toolCallsByTool[tc.name] ?? 0) + 1;
  });
}
```

### 1c. Inside `runDiffWorkflow` — update the two `attachToolLogger` calls with throwaway stats

```typescript
const _diffStats: WorkflowStats = { toolCallCount: 0, toolCallsByAgent: {}, toolCallsByTool: {} };
attachToolLogger(diffAnalyzer, 'DiffAnalyzer', _diffStats);
attachToolLogger(readmePatcher, 'ReadmePatcher', _diffStats);
```

### 1d. Inside `runAgentWorkflow` — allocate stats, thread into loggers, return alongside readme/agents

- Update return type: `Promise<{ readme: string; agents?: string; stats: WorkflowStats }>`
- Allocate after agents created, before first `attachToolLogger` call:
  ```typescript
  const stats: WorkflowStats = { toolCallCount: 0, toolCallsByAgent: {}, toolCallsByTool: {} };
  attachToolLogger(researcher, 'Researcher', stats);
  attachToolLogger(detailFetcher, 'DetailFetcher', stats);
  ```
- Update the final return:
  ```typescript
  return { readme: stripFences(readme), agents: agents ? stripFences(agents) : undefined, stats };
  ```

---

## File 2: `script.ts`

### 2a. Update import — add `WorkflowStats` type import from runner

```typescript
import { runAgentWorkflow, runDiffWorkflow, type WorkflowStats } from './lib/runner.js'
```

### 2b. Add `STATS_OUTPUT` constant (after line 31, with other output flags)

```typescript
const STATS_OUTPUT = typeof args['stats-output'] === 'string' ? args['stats-output'] : undefined
```

### 2c. Add `workflowStats` declaration alongside `readmeContent`/`agentsContent` (lines 293–294)

```typescript
let readmeContent: string
let agentsContent: string | undefined
let workflowStats: WorkflowStats | undefined
```

### 2d. Capture stats inside the inner try block (after line 301 `agentsContent = result.agents`)

```typescript
workflowStats = result.stats
```

### 2e. Write stats JSON after the inner try/catch block, before `// Write README` (after line 308)

```typescript
// Write stats JSON if requested
if (STATS_OUTPUT && workflowStats !== undefined) {
  await fs.writeFile(STATS_OUTPUT, JSON.stringify(workflowStats, null, 2) + '\n')
  log.detail(`Stats written to ${STATS_OUTPUT}`)
}
```

### 2f. Add `--stats-output` to `showHelp()` options list

```
  --stats-output FILE       Write tool call stats JSON to the specified file
```

---

## File 3: `evals/conftest.py`

### 3a. Add `import json` to imports block (top of file)

### 3b. Add `RunResult` dataclass after `CiRunResult`

```python
@dataclass
class RunResult:
    readme: str
    agents: str
    stats: dict  # type: ignore[type-arg]
```

### 3c. Rewrite `_express_server_run` fixture

Key changes from current implementation:
- Return type: `RunResult` (was `tuple[str, str]`)
- Move `results_dir` creation and `timestamp` generation to **before** the subprocess call (needed to pass `--stats-output` path)
- Add `--stats-output`, `stats_output_path` pointing directly to `results/express-server-stats-{timestamp}.json`
- After subprocess succeeds, read stats JSON: `stats_data = json.load(f) if os.path.exists(stats_output_path) else {}`
- Return `RunResult(readme=readme_content, agents=agents_content, stats=stats_data)`
- Stats file goes directly into `results/` (not dataset dir) — no cleanup needed for it

Stats path: `os.path.join(results_dir, f"express-server-stats-{timestamp}.json")`

Subprocess args addition:
```python
"--stats-output",
stats_output_path,
```

### 3d. Update `generated_readme` and `generated_agents_express_server` fixtures (tuple → attribute)

```python
@pytest.fixture(scope="session")
def generated_readme(_express_server_run: RunResult) -> str:
    return _express_server_run.readme

@pytest.fixture(scope="session")
def generated_agents_express_server(_express_server_run: RunResult) -> str:
    return _express_server_run.agents
```

### 3e. Add `tool_call_stats_express_server` fixture (after `generated_agents_express_server`)

```python
@pytest.fixture(scope="session")
def tool_call_stats_express_server(_express_server_run: RunResult) -> dict:  # type: ignore[type-arg]
    return _express_server_run.stats
```

### 3f. Mirror all of 3c–3e for `_rereadme_run`

- Stats path: `rereadme-stats-{timestamp}.json`
- Update `generated_readme_rereadme`, `generated_agents_rereadme` to use `.readme` / `.agents`
- Add `tool_call_stats_rereadme` fixture

---

## File 4: `evals/test_express_server.py`

Append after `test_agents_golden_similarity` (currently last test, line 147):

```python
TOOL_CALL_BUDGET = 15


def test_tool_call_efficiency(tool_call_stats_express_server: dict) -> None:  # type: ignore[type-arg]
    """Total tool calls must stay within budget to prevent 429 rate limit errors.

    Intentionally fails at ~25 calls (current baseline). Expected to pass
    after batch tool optimization reduces calls to <= 15.
    """
    stats = tool_call_stats_express_server
    total = stats.get("toolCallCount", 0)
    assert total <= TOOL_CALL_BUDGET, (
        f"Tool call count {total} exceeds budget of {TOOL_CALL_BUDGET}.\n"
        f"Per-agent: {stats.get('toolCallsByAgent', {})}\n"
        f"Per-tool:  {stats.get('toolCallsByTool', {})}"
    )
```

---

## File 5: `evals/test_rereadme.py`

Identical append — only difference is fixture name `tool_call_stats_rereadme`:

```python
TOOL_CALL_BUDGET = 15


def test_tool_call_efficiency(tool_call_stats_rereadme: dict) -> None:  # type: ignore[type-arg]
    """Total tool calls must stay within budget to prevent 429 rate limit errors.

    Intentionally fails at ~25 calls (current baseline). Expected to pass
    after batch tool optimization reduces calls to <= 15.
    """
    stats = tool_call_stats_rereadme
    total = stats.get("toolCallCount", 0)
    assert total <= TOOL_CALL_BUDGET, (
        f"Tool call count {total} exceeds budget of {TOOL_CALL_BUDGET}.\n"
        f"Per-agent: {stats.get('toolCallsByAgent', {})}\n"
        f"Per-tool:  {stats.get('toolCallsByTool', {})}"
    )
```

---

## Implementation Order

1. `lib/runner.ts` — defines `WorkflowStats`, updates signatures
2. `script.ts` — imports type, adds flag, writes JSON
3. `evals/conftest.py` — reads JSON, exposes via fixtures
4. `evals/test_express_server.py` + `evals/test_rereadme.py` — assert budget

## Backward Compatibility

All 8 existing tests in each file consume only the leaf string fixtures (`generated_readme`, `generated_agents_express_server`, etc.), whose return types remain `str`. No existing test function signatures change.

## Verification

After implementation:
1. `make typecheck-ts` — catches any interface/type mismatches
2. `make lint-ts` — ESLint clean
3. Manual smoke: `npm run dev -- --output /tmp/test-readme.md --stats-output /tmp/stats.json` in a test repo, inspect `/tmp/stats.json`
4. Full eval (when API quota allows): `cd evals && uv run pytest test_express_server.py::test_tool_call_efficiency -v` — expect failure at ~25 calls with breakdown in message
5. After batch tool optimization: same test passes at ≤ 15

## Results Dir Naming (post-plan)

Stats files land alongside existing artifacts:
```
evals/results/
  express-server-20260303T120000.md
  express-server-AGENTS-20260303T120000.md
  express-server-stats-20260303T120000.json   ← new
  rereadme-20260303T120000.md
  rereadme-AGENTS-20260303T120000.md
  rereadme-stats-20260303T120000.json         ← new
```
