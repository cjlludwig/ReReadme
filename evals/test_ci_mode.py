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
            "This is a README update suggestions document generated for a diff that introduced new CLI flags "
            "(--ci, --base-ref, --head-ref, --ci-output). "
            "Evaluate the quality and correctness of the suggestion: "
            "(1) Does the document open with a >[!CAUTION] GitHub alert block, indicating high urgency? "
            "(2) Does the content specifically name at least one of the new flags: '--ci', '--base-ref', '--head-ref'? "
            "(3) Does the suggestion target a Usage section or equivalent CLI reference section? "
            "Score high if the suggestion correctly names specific new flags and targets a relevant README section. "
            "Score low if the suggestion is vague, names no specific flags, or targets completely unrelated content."
        ),
    },
    {
        "id": "pr14_gha",
        "fixture": "ci_run_pr14",
        "expected_significant": True,
        "expected_signal": "medium",
        "keywords": ["action"],
        "geval_criteria": (
            "This is a README update suggestions document generated for a diff that introduced a reusable GitHub Action. "
            "Evaluate the quality and correctness of the suggestion: "
            "(1) Does the document open with a [!WARNING] GitHub alert block? "
            "(2) Does the content mention GitHub Actions, composite action, action.yml, or CI integration? "
            "(3) Is the suggestion scoped to documenting the GitHub Action as a user-facing integration feature? "
            "Score high if the suggestion concretely describes the GitHub Action and recommends adding relevant documentation. "
            "Score low if there is no mention of GitHub Actions or the suggestion targets completely unrelated sections."
        ),
    },
    {
        "id": "pr15_refactor",
        "fixture": "ci_run_pr15",
        "expected_significant": False,
        "expected_signal": None,
        "keywords": [],
        "geval_criteria": (
            "This is stdout from a CI mode run where no README update file was produced (the correct outcome). "
            "The diff contained internal test reorganization and TypeScript module extraction with no new CLI flags "
            "or user-visible behavior changes. "
            "Evaluate whether the tool's reasoning is appropriate: "
            "(1) Does the stdout indicate a non-significant or low-signal classification? "
            "   (Look for: 'Signal level: low', 'no output written', 'no README sections matched', "
            "   or the absence of a confident high/medium signal assertion.) "
            "(2) If the output says 'no README sections matched', is that a plausible outcome given that "
            "   the diff had no user-visible CLI or API changes to document? "
            "(3) Is the overall conclusion consistent with correctly skipping documentation for internal changes? "
            "Score high if the tool's output is consistent with not documenting internal-only changes. "
            "Score low only if the tool confidently asserts important user-visible changes occurred yet still produced no output."
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
