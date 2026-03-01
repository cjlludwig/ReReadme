"""CI mode eval tests — pinned to real PRs with deterministic commit SHAs."""

from __future__ import annotations

import re

import pytest
from deepeval import assert_test  # type: ignore[attr-defined]
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


@pytest.mark.parametrize("case", CI_CASES, ids=[str(c["id"]) for c in CI_CASES])
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


@pytest.mark.parametrize("case", CI_CASES, ids=[str(c["id"]) for c in CI_CASES])
def test_exit_code(case: dict, request: pytest.FixtureRequest) -> None:
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    assert result.returncode == 0, (
        f"Expected exit code 0 for {case['id']}, got {result.returncode}. "
        f"stdout: {result.stdout[:500]}"
    )


@pytest.mark.parametrize("case", CI_CASES, ids=[str(c["id"]) for c in CI_CASES])
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


@pytest.mark.parametrize("case", CI_CASES, ids=[str(c["id"]) for c in CI_CASES])
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


@pytest.mark.parametrize("case", CI_CASES, ids=[str(c["id"]) for c in CI_CASES])
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
