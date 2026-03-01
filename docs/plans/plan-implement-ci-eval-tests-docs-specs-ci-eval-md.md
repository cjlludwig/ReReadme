# Plan: Implement CI Eval Tests (docs/specs/ci-eval.md)

## Context

The CI mode (`--ci` flag) was added in PR #11 and needs automated quality evaluation covering the full signal range: high, medium, and none. This plan implements the eval framework described in `docs/specs/ci-eval.md`, adding three deterministic + GEval-graded test cases pinned to real squash-merge commits.

---

## Files to Modify

| File | Change |
|------|--------|
| `evals/conftest.py` | Add `CiRunResult` dataclass, `run_ci` helper, and three session-scoped CI fixtures |
| `evals/test_ci_mode.py` | **New file** — parametrized test suite for CI eval |
| `package.json` | Add `eval:ci` and `eval:all` scripts |

---

## Step 1: Add to `evals/conftest.py`

### New imports (at top of file, after existing imports)
```python
from dataclasses import dataclass
from collections.abc import Generator
```

### New dataclass (after existing imports, before fixtures)
```python
@dataclass
class CiRunResult:
    returncode: int
    stdout: str
    suggestions: str | None  # file content if written, else None
```

### New `run_ci` helper function
```python
def run_ci(base_ref: str, head_ref: str, output_path: Path) -> CiRunResult:
    if not os.environ.get("OPENAI_API_KEY"):
        pytest.fail("OPENAI_API_KEY environment variable is not set")

    output_path.parent.mkdir(exist_ok=True)

    proc = subprocess.run(
        [
            "npx", "tsx", "script.ts",
            "--ci",
            "--base-ref", base_ref,
            "--head-ref", head_ref,
            "--ci-output", str(output_path),
        ],
        capture_output=True,
        text=True,
        timeout=300,
        cwd=REPO_ROOT,
    )

    suggestions: str | None = None
    if output_path.exists():
        suggestions = output_path.read_text(encoding="utf-8")

    stdout = proc.stdout + proc.stderr  # merge for signal level logging
    return CiRunResult(returncode=proc.returncode, stdout=stdout, suggestions=suggestions)
```

### Three session-scoped fixtures (append after existing fixtures)
```python
@pytest.fixture(scope="session")
def ci_run_pr11() -> Generator[CiRunResult, None, None]:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    output_path = REPO_ROOT / "evals" / "results" / f"ci-pr11-{timestamp}.md"
    result = run_ci("3ea3dcf", "bd31fbc", output_path)
    yield result
    if output_path.exists():
        output_path.unlink()


@pytest.fixture(scope="session")
def ci_run_pr14() -> Generator[CiRunResult, None, None]:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    output_path = REPO_ROOT / "evals" / "results" / f"ci-pr14-{timestamp}.md"
    result = run_ci("ae761da", "8a10c7a", output_path)
    yield result
    if output_path.exists():
        output_path.unlink()


@pytest.fixture(scope="session")
def ci_run_pr15() -> Generator[CiRunResult, None, None]:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    output_path = REPO_ROOT / "evals" / "results" / f"ci-pr15-{timestamp}.md"
    result = run_ci("8a10c7a", "cfa1d4c", output_path)
    yield result
    if output_path.exists():
        output_path.unlink()
```

**Note:** `datetime` is likely already imported in conftest.py for the timestamp pattern; verify and add if missing.

---

## Step 2: Create `evals/test_ci_mode.py`

```python
"""CI mode eval tests — pinned to real PRs with deterministic commit SHAs."""

from __future__ import annotations

import re
import pytest
from deepeval import assert_test
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from conftest import CiRunResult
from metrics.types import GEVAL_MODEL

CI_CASES = [
    {
        "id": "pr11_ci_flag",
        "fixture": "ci_run_pr11",
        "expected_significant": True,
        "expected_signal": "high",
        "keywords": ["--ci", "--base-ref", "usage"],
        "geval_criteria": (
            "Was 'high' the correct signal level and is the reasoning sufficient? "
            "The diff introduces new CLI flags (--ci, --base-ref, --head-ref) with no README update. "
            "Evaluate: (1) Is the signal tier 'high'? "
            "(2) Does the output specifically name the --ci, --base-ref, and/or --head-ref flags? "
            "(3) Does it identify that usage documentation (a Usage section or similar) is missing coverage? "
            "Generic or vague justification without naming the specific flags should score low."
        ),
    },
    {
        "id": "pr14_gha",
        "fixture": "ci_run_pr14",
        "expected_significant": True,
        "expected_signal": "medium",
        "keywords": ["action"],
        "geval_criteria": (
            "Was 'medium' (not 'high') the correct signal level for this PR? "
            "The diff wires a reusable GitHub Action but the repo has no existing CI integration docs section. "
            "Evaluate: (1) Is the signal tier 'medium' rather than 'high'? "
            "(2) Does the reasoning acknowledge that this is discretionary because no CI docs section currently exists? "
            "(3) Does it mention GitHub Actions, the action file, or 'uses:' syntax? "
            "A response that calls this 'high' without addressing the missing CI docs section should score low."
        ),
    },
    {
        "id": "pr15_refactor",
        "fixture": "ci_run_pr15",
        "expected_significant": False,
        "expected_signal": None,
        "keywords": [],
        "geval_criteria": (
            "Given that the diff contains only internal test reorganization and code coverage improvements, "
            "is 'no documentation suggestions' a well-reasoned conclusion? "
            "Evaluate: (1) Is the signal level 'low' or 'none' (no file written)? "
            "(2) Does the reasoning specifically name the type of changes (test refactor, internal extraction, coverage improvements)? "
            "(3) Does it explain why these are non-user-facing? "
            "Vague reasons like 'minor change' without naming specific change types should score low."
        ),
    },
]


@pytest.mark.parametrize("case", CI_CASES, ids=[c["id"] for c in CI_CASES])
def test_file_presence(case: dict, request: pytest.FixtureRequest) -> None:
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    if case["expected_significant"]:
        assert result.suggestions is not None, (
            f"Expected suggestions file to be written for {case['id']}, but it was not. "
            f"stdout: {result.stdout[:500]}"
        )
    else:
        assert result.suggestions is None, (
            f"Expected no suggestions file for {case['id']}, but one was written."
        )


@pytest.mark.parametrize("case", CI_CASES, ids=[c["id"] for c in CI_CASES])
def test_exit_code(case: dict, request: pytest.FixtureRequest) -> None:
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    assert result.returncode == 0, (
        f"Expected exit code 0 for {case['id']}, got {result.returncode}. "
        f"stdout: {result.stdout[:500]}"
    )


@pytest.mark.parametrize("case", CI_CASES, ids=[c["id"] for c in CI_CASES])
def test_output_format(case: dict, request: pytest.FixtureRequest) -> None:
    if not case["expected_significant"]:
        pytest.skip("No output file expected for non-significant diff")
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    assert result.suggestions is not None
    alert_pattern = re.compile(r"\[!(CAUTION|WARNING|TIP)\]")
    assert alert_pattern.search(result.suggestions), (
        f"Expected GitHub alert block in suggestions for {case['id']}. "
        f"Got: {result.suggestions[:300]}"
    )


@pytest.mark.parametrize("case", CI_CASES, ids=[c["id"] for c in CI_CASES])
def test_keywords(case: dict, request: pytest.FixtureRequest) -> None:
    if not case["expected_significant"]:
        pytest.skip("No output file expected for non-significant diff")
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    assert result.suggestions is not None
    content_lower = result.suggestions.lower()
    for keyword in case["keywords"]:
        assert keyword.lower() in content_lower, (
            f"Keyword '{keyword}' not found in suggestions for {case['id']}."
        )


@pytest.mark.parametrize("case", CI_CASES, ids=[c["id"] for c in CI_CASES])
def test_signal_geval(case: dict, request: pytest.FixtureRequest) -> None:
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    actual_output = result.suggestions if case["expected_significant"] else result.stdout
    test_case = LLMTestCase(
        input="Evaluate the quality and correctness of this CI diff-analysis output.",
        actual_output=actual_output or "",
    )
    metric = GEval(
        name="signal_quality",
        criteria=case["geval_criteria"],
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        threshold=0.70,
        model=GEVAL_MODEL,
    )
    assert_test(test_case, [metric])
```

---

## Step 3: Update `package.json` scripts

Add after the existing `"eval:report"` entry:

```json
"eval:ci": "cd evals && uv run pytest test_ci_mode.py -v",
"eval:all": "cd evals && uv run pytest -v"
```

The existing `"eval"` script is unchanged.

---

## Verification

1. **Dry run conftest import**: `cd evals && uv run python -c "from conftest import CiRunResult, ci_run_pr11; print('OK')"` (fails fast on import errors)
2. **Run exit-code tests only** (fast, no LLM): `cd evals && uv run pytest test_ci_mode.py -v -k "exit_code"` — should pass without LLM calls since exit code doesn't depend on model output
3. **Full CI eval run**: `npm run eval:ci` — requires OPENAI_API_KEY; all 15 test assertions should pass (5 functions × 3 cases, minus skips for non-significant cases)
4. **Check results dir**: `ls evals/results/ci-pr*.md` — files should exist during run, cleaned up after
5. **Confirm existing evals unaffected**: `npm run eval` should still pass

---

## Notes

- `GEVAL_MODEL` in `evals/metrics/types.py` is `"gpt-5-mini"` (not `gpt-4o-mini` as spec notes — use the constant, not a hardcoded string)
- `datetime` import in conftest.py: verify it's already present before adding
- `os` import in conftest.py: verify it's already present (needed for `os.environ.get`)
- The CI fixtures run from `REPO_ROOT` so git history resolves correctly against the rereadme repo
- PR15 GEval evaluates `stdout` not `suggestions` — this captures the signal level + reason logged before early exit
