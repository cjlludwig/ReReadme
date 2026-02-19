# Plan: DeepEval `evaluate()` Runner

## Context

The existing `evals/test_*.py` files use `assert_test()` (pytest-style pass/fail per assertion). The user wants a parallel path using DeepEval's `evaluate()` function for holistic visualization of overall run performance — showing metric scores, pass rates, and aggregate summaries across all datasets and output types in a single script invocation. New files only (backward compat).

## Files to Create / Modify

- **Create**: `evals/evaluate.py` — standalone script
- **Modify**: `package.json` — add `eval:report` script

## What `evaluate.py` Does

### Structure (in order)

1. `from __future__ import annotations` + stdlib imports
2. Compute `EVALS_DIR` / `REPO_ROOT` using `os.path`, then `sys.path.insert(0, EVALS_DIR)` so local `metrics` package is importable
3. Third-party + local imports (with `# noqa: E402` since they come after `sys.path` mutation)
4. Module-level constants (keyword lists, section configs, golden paths, GEval params)
5. `@dataclass EvalUnit` — groups label, dataset_name, output_type, input_prompt, golden_path, keywords, sections (`None` = default README sections)
6. `@dataclass AccumulatedResult` — label, success, passed_metrics, total_metrics, golden_created
7. `run_rereadme(dataset_name) -> tuple[str, str]` — extracted from conftest.py, replaces `pytest.fail` with `sys.exit`; runs `npx tsx script.ts --output README-generated.md --agents --agents-output AGENTS-generated.md --no-backup`; backs up to `evals/results/`; cleans up dataset dir; returns `(readme, agents)`
8. `load_or_create_golden(golden_path, content, label) -> tuple[str | None, bool]` — reads golden if it exists; if not, writes it and returns `(None, True)` with a `print()` notice (no `pytest.skip`)
9. `build_metrics(unit, golden) -> list` — always adds `SectionHeadersMetric`, `SectionContentMetric`, `KeywordsMetric` (with unit's sections/keywords); conditionally appends `GEval` if `golden is not None`
10. `run_eval_unit(unit, content, golden, golden_created) -> AccumulatedResult` — builds `LLMTestCase`, calls `evaluate([test_case], metrics)`, extracts `result.test_results[0]`, counts passed metrics
11. `print_summary(results)` — prints a 4-row table: Unit / Status / Metrics / Note
12. `main()` — defines 4 `EvalUnit`s; runs `run_rereadme()` twice (once per dataset, shared between README+AGENTS units for that dataset); evaluates all 4 units; prints summary; `sys.exit(1)` if any unit failed
13. `if __name__ == "__main__": main()`

### 4 Evaluation Units

| Label | Dataset | Output | Keywords | Sections |
|---|---|---|---|---|
| express-server / README | express-server | readme | 6 keywords (npm install, npm start, localhost:9000, Node.js, Express.js, MongoDB) | None (default) |
| express-server / AGENTS.md | express-server | agents | 5 keywords (same minus localhost) | `["## Project", "## Commands"]` |
| rereadme / README | rereadme | readme | 9 keywords | None (default) |
| rereadme / AGENTS.md | rereadme | agents | 5 keywords | `["## Project", "## Commands"]` |

### Key Design Decisions

- **2 `run_rereadme()` calls, 4 `evaluate()` calls**: Runner runs once per dataset (shared output). Each `evaluate()` call gets 1 test case + its specific metrics, avoiding the "same metrics for all cases" constraint of batching them.
- **Golden handling without pytest**: `load_or_create_golden` writes the file and prints a notice; `build_metrics` simply omits `GEval` when `golden=None`. The Summary table shows `"golden created"` in the Note column.
- **`display_config=DisplayConfig(print_results=True)`**: Let DeepEval print its native per-unit table (shows individual scores + reasons). `print_summary()` then adds a cross-unit aggregate view on top.
- **GEval params**: threshold=0.70, model="gpt-5-mini", same criteria strings as existing tests

### GEval criteria (copy from test files)

- README: `"Evaluate semantic similarity between the generated README and the golden README. Consider section structure alignment, technical accuracy of descriptions, and content completeness. Minor wording and structure differences should be tolerated."`
- AGENTS: `"Evaluate semantic similarity between the generated AGENTS.md and the golden AGENTS.md. Focus on: presence of required sections (Project, Commands), accuracy of commands, correctness of file structure, and appropriate constraints. Minor wording differences should be tolerated."`

## `package.json` Change

Add to `scripts`:
```json
"eval:report": "cd evals && NO_COLOR=1 uv run python evaluate.py"
```
(After `eval:agents`, maintaining logical grouping. `NO_COLOR=1` matches existing eval scripts.)

## Reused Code / Assets

- `evals/metrics/__init__.py` — `SectionHeadersMetric`, `SectionContentMetric`, `KeywordsMetric` imported as-is
- `evals/conftest.py` — `run_rereadme()` is a straight port of the fixture runner logic (no pytest dependency in new version)
- `evals/golden/` — same golden file paths as used by pytest tests
- Keyword lists and section configs — copied verbatim from `test_express_server.py` and `test_rereadme.py`

## Mypy / Ruff Notes

- `from __future__ import annotations` enables `str | None` in function signatures
- Use `Optional[str]` from `typing` for dataclass field type hints
- `# noqa: E402` on all imports after `sys.path.insert`
- `from deepeval import evaluate  # type: ignore[attr-defined]` (matches existing test file pattern)
- `metrics: list` (broad annotation for heterogeneous `BaseMetric` + `GEval` list)

## Verification

1. Run `npm run eval:report` — should invoke both datasets, print 4 DeepEval unit tables, then print the summary table
2. First run with no goldens: 4 rows, `"golden created"` in Note, 3 metrics each
3. Subsequent run with goldens: 4 rows, 4 metrics each (+ GEval), scores shown
4. If any metric fails: `sys.exit(1)` (nonzero exit code)
5. Run `make check` after implementation to verify lint/typecheck pass
