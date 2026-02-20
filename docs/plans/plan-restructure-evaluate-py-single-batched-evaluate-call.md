# Plan: Restructure `evaluate.py` — Single Batched `evaluate()` Call

## Context

The current `evaluate.py` calls `evaluate()` once per unit inside a loop — 4 separate calls, each with one test case. This inverts DeepEval's intended pattern: `evaluate()` exists to accept a batch of test cases and produce a holistic view. The fix restructures into 3 clear phases — all LLM runs, then all test case construction, then a **single** `evaluate()` call with all 4 test cases at once.

The core constraint is that `evaluate()` applies the same metrics list to every test case. Two sub-problems:
1. **Keywords/sections vary per case** → solved by reading from `LLMTestCase.additional_metadata` in each metric's `measure()`.
2. **GEval criteria varies per case** (README vs AGENTS)** → solved by a new `AdaptiveGEvalMetric` class that reads `geval_criteria` from `additional_metadata` and skips gracefully when no golden exists.

## Files to Create / Modify

| File | Change |
|---|---|
| `evals/metrics/geval_adaptive.py` | **Create** — `AdaptiveGEvalMetric` class |
| `evals/metrics/__init__.py` | Add `AdaptiveGEvalMetric` export |
| `evals/metrics/keywords.py` | Read `keywords` from `additional_metadata` in `measure()` |
| `evals/metrics/section_headers.py` | Read `sections` from `additional_metadata` in `measure()` |
| `evals/metrics/section_content.py` | Read `sections` from `additional_metadata` in `measure()` |
| `evals/evaluate.py` | Restructure `main()`, remove `build_metrics()` + `run_eval_unit()` |

## New `AdaptiveGEvalMetric` (`evals/metrics/geval_adaptive.py`)

Wraps GEval but reads `criteria` per-case from `additional_metadata`. Skips (scores 1.0, passes) when no golden exists so it never penalizes first-run cases.

```python
from deepeval.metrics import BaseMetric, GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams


class AdaptiveGEvalMetric(BaseMetric):
    """GEval that reads criteria from test_case.additional_metadata['geval_criteria'].
    Passes trivially when expected_output is None (no golden yet)."""

    def __init__(self, threshold: float = 0.70, model: str = "gpt-5-mini") -> None:
        self.threshold = threshold
        self.model = model
        self.score = 0.0
        self.success = False
        self.reason = ""
        self.error = None

    def measure(self, test_case: LLMTestCase) -> float:
        metadata = test_case.additional_metadata or {}
        criteria = metadata.get("geval_criteria")

        if criteria is None or test_case.expected_output is None:
            self.score = 1.0
            self.success = True
            self.reason = "Skipped: no golden or no criteria."
            return self.score

        geval = GEval(
            name="Similarity",
            criteria=criteria,
            evaluation_params=[
                LLMTestCaseParams.ACTUAL_OUTPUT,
                LLMTestCaseParams.EXPECTED_OUTPUT,
            ],
            threshold=self.threshold,
            model=self.model,
            async_mode=False,
        )
        self.score = geval.measure(test_case)
        self.success = geval.is_successful()
        self.reason = geval.reason or ""
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return bool(self.success) if self.error is None else False

    @property
    def __name__(self) -> str:
        return "Adaptive GEval"
```

## Metric `measure()` Change (keywords, section_headers, section_content)

One-liner addition at the top of each `measure()` to resolve the per-case value from metadata, with constructor default as fallback:

```python
# keywords.py
keywords = (test_case.additional_metadata or {}).get("keywords") or self.keywords

# section_headers.py / section_content.py
sections = (test_case.additional_metadata or {}).get("sections") or self.sections
```

## `evaluate.py` Changes

### Remove
- `build_metrics()` function
- `run_eval_unit()` function

### Add

```python
SHARED_METRICS: list = [
    SectionHeadersMetric(threshold=1.0),   # sections from additional_metadata
    SectionContentMetric(threshold=1.0),   # sections from additional_metadata
    KeywordsMetric(threshold=1.0),          # keywords from additional_metadata
    AdaptiveGEvalMetric(),                  # criteria from additional_metadata
]
```

### Restructured `main()` — 3 explicit phases

```python
def main() -> None:
    units = [...]  # same 4 EvalUnits, unchanged

    # Phase 1: All LLM runs
    express_readme, express_agents = run_rereadme("express-server")
    rereadme_readme, rereadme_agents  = run_rereadme("rereadme")
    dataset_outputs = { ... }  # same mapping

    # Phase 2: Load goldens + build all test cases
    prepared: list = []   # (unit, test_case, golden_created)
    for unit in units:
        content = dataset_outputs[(unit.dataset_name, unit.output_type)]
        golden, golden_created = load_or_create_golden(unit.golden_path, content, unit.label)
        criteria = README_GEVAL_CRITERIA if unit.output_type == "readme" else AGENTS_GEVAL_CRITERIA
        test_case = LLMTestCase(
            input=unit.input_prompt,
            actual_output=content,
            expected_output=golden,
            additional_metadata={
                "keywords": unit.keywords,
                "sections": unit.sections,
                "geval_criteria": criteria,
            },
        )
        prepared.append((unit, test_case, golden_created))

    # Phase 3: Single evaluate() call with all 4 test cases
    test_cases = [tc for _, tc, _ in prepared]
    result = evaluate(
        test_cases=test_cases,
        metrics=SHARED_METRICS,
        display_config=DisplayConfig(print_results=True),
    )

    all_results: list[AccumulatedResult] = []
    for i, (unit, _, golden_created) in enumerate(prepared):
        test_result = result.test_results[i]
        metrics_data = test_result.metrics_data or []
        passed_metrics = sum(1 for md in metrics_data if md.success)
        all_results.append(AccumulatedResult(
            label=unit.label,
            success=test_result.success,
            passed_metrics=passed_metrics,
            total_metrics=len(SHARED_METRICS),
            golden_created=golden_created,
        ))

    print_summary(all_results)
    if any(not r.success for r in all_results):
        sys.exit(1)
```

## Key Design Notes

- **`AdaptiveGEvalMetric` skip behavior**: When `expected_output is None`, scores 1.0 and succeeds — so first-run cases aren't penalized and the overall test_result.success isn't dragged down by a missing golden.
- **`SHARED_METRICS` is module-level**: One set of 4 metric instances shared across all test cases, per-case configuration loaded from `additional_metadata` at measure-time.
- **Existing pytest tests unaffected**: They don't set `additional_metadata`, so all three deterministic metrics fall back to their constructor defaults exactly as before.
- **`EvalUnit.keywords = None`** (express-server README default case) correctly falls through since `None or self.keywords` returns `self.keywords`.

## Verification

1. `make check` — lint/typecheck must pass
2. `npm run eval:report` — should print **one** DeepEval table with 4 test cases, then the summary
3. First run (no goldens): all 4 cases show `AdaptiveGEvalMetric` = skipped/pass, summary shows `"golden created"`
4. Second run (goldens present): GEval activates with per-case criteria, scores shown
5. `npm run eval` — existing pytest suite must still pass (metrics fall back to constructor defaults when no metadata)
