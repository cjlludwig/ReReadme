# Plan: Replace GEval with boolean GoldenAlignmentJudgeMetric

## Context

The existing golden-similarity tests use DeepEval's `GEval` which produces a 0–1 float score against a threshold. The user wants this replaced with the same boolean PASS/FAIL pattern used in `judge.py` — with a lenient prompt (minor wording/structure differences should PASS; only fail if significant sections are missing or key facts are wrong). All judges should default to `gpt-4o-mini`. The new metric and its prompt live in `judge.py` alongside the existing boolean judges.

---

## Files to Modify

| File | Action |
|------|--------|
| `evals/metrics/judge.py` | Add `GoldenAlignmentJudgeMetric` |
| `evals/metrics/types.py` | Change `GEVAL_MODEL` to `"gpt-4o-mini"`; remove `GEVAL_THRESHOLD`, `README_GEVAL_CRITERIA`, `AGENTS_GEVAL_CRITERIA` |
| `evals/metrics/geval_adaptive.py` | **Delete** |
| `evals/metrics/__init__.py` | Export `GoldenAlignmentJudgeMetric`; remove `AdaptiveGEvalMetric`, `GEVAL_THRESHOLD`, `README_GEVAL_CRITERIA`, `AGENTS_GEVAL_CRITERIA` |
| `evals/test_express_server.py` | Replace GEval metric + clean up imports |
| `evals/test_rereadme.py` | Replace GEval metric + clean up imports |
| `evals/test_front_end.py` | Replace GEval metric + clean up imports |
| `evals/evaluate.py` | Replace `AdaptiveGEvalMetric` with `GoldenAlignmentJudgeMetric` in `SHARED_METRICS`; clean up imports |

**Leave alone:** `test_ci_mode.py` — its GEval usage is for CI diff-quality analysis (not golden comparison) and uses `GEVAL_MODEL` only, which we'll update in types.py automatically.

---

## Step 1 — `evals/metrics/judge.py`: Add `GoldenAlignmentJudgeMetric`

Add a new prompt constant and class. The metric overrides `measure()` to short-circuit with PASS when `expected_output is None` (no golden yet), then delegates to the base class. `_build_user_message` places both golden and generated README in the user turn.

```python
GOLDEN_ALIGNMENT_SYSTEM_PROMPT = """You are an LLM judge comparing a generated README to a reference golden README.

Criteria:
- Core coverage: Does the generated README address the same key topics as the golden (purpose, setup, usage, commands)?
- Technical accuracy: Are technical details (commands, ports, dependencies) substantially correct?

Be lenient: differences in wording, section order, additional context, or formatting are fine.
PASS if the content is substantially similar and covers the core details.
FAIL only if significant required sections are missing or key technical facts are wrong.

Response format:
verdict: PASS | FAIL
reasoning: <one sentence explanation>"""


class GoldenAlignmentJudgeMetric(BooleanJudgeMetric):
    _system_prompt = GOLDEN_ALIGNMENT_SYSTEM_PROMPT

    def measure(self, test_case: LLMTestCase) -> float:
        if not test_case.expected_output:
            self.score = 1.0
            self.success = True
            self.reason = "Skipped: no golden file yet."
            return self.score
        return super().measure(test_case)

    def _build_user_message(self, test_case: LLMTestCase) -> str:
        return (
            f"Golden README:\n{test_case.expected_output or ''}\n\n"
            f"Generated README:\n{test_case.actual_output or ''}"
        )

    @property
    def __name__(self) -> str:
        return "Golden Alignment Judge"
```

---

## Step 2 — `evals/metrics/types.py`: Update model, remove GEval constants

- Change `GEVAL_MODEL = "gpt-4o-mini"` (was `"gpt-5-mini"`)
- Remove `GEVAL_THRESHOLD`, `README_GEVAL_CRITERIA`, `AGENTS_GEVAL_CRITERIA` (no longer used anywhere after the test file updates; `test_ci_mode.py` only imports `GEVAL_MODEL`)

---

## Step 3 — Delete `evals/metrics/geval_adaptive.py`

No remaining callers after the evaluate.py update. Remove the file entirely.

---

## Step 4 — `evals/metrics/__init__.py`: Update exports

- Add `GoldenAlignmentJudgeMetric` import from `.judge`
- Remove `AdaptiveGEvalMetric` import from `.geval_adaptive`
- Remove `GEVAL_THRESHOLD`, `README_GEVAL_CRITERIA`, `AGENTS_GEVAL_CRITERIA` from `.types` import and `__all__`
- Keep `GEVAL_MODEL` (still used by `test_ci_mode.py`)

---

## Step 5 — `evals/test_express_server.py`, `test_rereadme.py`, `test_front_end.py`

Same change in each file:

**Remove** imports:
```python
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams  # drop LLMTestCaseParams
# drop: README_GEVAL_CRITERIA, AGENTS_GEVAL_CRITERIA, GEVAL_THRESHOLD, GEVAL_MODEL
```

**Add** import: `GoldenAlignmentJudgeMetric`

**Replace** both golden-similarity tests (README + AGENTS) — the golden skip/create logic is unchanged, only the metric construction changes:

```python
# Before:
metric = GEval(
    name="README Similarity",
    criteria=README_GEVAL_CRITERIA,
    evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
    threshold=GEVAL_THRESHOLD,
    model=GEVAL_MODEL,
)

# After:
metric = GoldenAlignmentJudgeMetric()
```

`LLMTestCase` still receives `expected_output=golden_readme` so the metric can access it.

---

## Step 6 — `evals/evaluate.py`: Swap metric in SHARED_METRICS

- Remove `AdaptiveGEvalMetric` import; add `GoldenAlignmentJudgeMetric`
- Remove `README_GEVAL_CRITERIA`, `AGENTS_GEVAL_CRITERIA` imports (no longer passed as metadata)
- Replace `AdaptiveGEvalMetric()` with `GoldenAlignmentJudgeMetric()` in `SHARED_METRICS`
- Remove `geval_criteria` key from `additional_metadata` passed to each `LLMTestCase`

---

## Verification

1. `make check` — ruff, mypy, deptry all pass (no orphaned imports)
2. `cd evals && uv run deepeval test run test_express_server.py -v` — `test_golden_readme_similarity` and `test_agents_golden_similarity` run as PASS/FAIL (no float score)
3. `uv run python evaluate.py` — SHARED_METRICS shows "Golden Alignment Judge" replacing "Adaptive GEval"
