"""CI mode eval tests — pinned to real PRs with deterministic commit SHAs."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from deepeval import assert_test  # type: ignore[attr-defined]
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from conftest import REPO_ROOT, CiRunResult
from metrics.types import GEVAL_MODEL

CI_CASES = [
    {
        "id": "pr11_ci_flag",
        "fixture": "ci_run_pr11",
        "expected_significant": True,
        "expected_signal": "high",
        "expected_alert": "CAUTION",
        "keywords": ["--ci", "usage"],
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
        "expected_alert": "WARNING",
        "keywords": ["action"],
        "check_section_headings": False,  # PR14 introduces a new concept (GitHub Action); agent may suggest a new section not yet in README
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
        "expected_alert": None,
        "keywords": [],
        "geval_criteria": (
            "This is stdout from a CI mode run where no README suggestions file was written (the correct outcome)"
            "The diff contained internal test reorganization and module extraction with no new CLI flags "
            "or user-visible behavior changes. Focus on the meaningful status text."
            "Evaluate whether the tool's behavior is consistent with correctly skipping this diff: "
            "(1) Does the stdout avoid asserting significant user-visible changes? "
            "   (i.e., no [!CAUTION] or [!WARNING] alert blocks, no phrases like "
            "   'high signal', 'README update required', or 'significant changes detected') "
            "(2) Is there any indication — however brief — that the diff was classified as "
            "   low priority or non-significant? "
            "   (e.g., 'Signal level: low', 'no update needed', 'no significant changes', "
            "   or simply the absence of urgency markers) "
            "(3) Is the overall behavior consistent with correctly skipping documentation "
            "   for internal refactoring? "
            "Score high if the tool's output is consistent with not documenting internal-only changes. "
            "Score low ONLY if the stdout explicitly asserts the changes are user-visible and "
            "significant, contradicting the correct classification."
        ),
    },
    {
        "id": "pr17_eval_tuning",
        "fixture": "ci_run_pr17",
        "expected_significant": False,
        "expected_signal": None,
        "expected_alert": None,
        "keywords": [],
        "geval_criteria": (
            "This is stdout from a CI mode run where no README suggestions file was written "
            "(the correct outcome). The diff was PR #17: eval test infrastructure, internal AI "
            "agent prompt tuning, developer-only npm scripts, and CI/CD metadata — none are "
            "user-visible changes. "
            "The stdout will likely contain terminal spinner animation characters and ANSI "
            "escape codes — ignore those when evaluating. Focus on the meaningful status text. "
            "Evaluate whether the tool's behavior is consistent with correctly skipping this diff: "
            "(1) Does the stdout avoid asserting significant user-visible changes? "
            "   (i.e., no [!CAUTION] or [!WARNING] alert blocks, no phrases like "
            "   'high signal', 'README update required', or 'significant changes detected') "
            "(2) Is there any indication — however brief — that the diff was classified as "
            "   low priority or non-significant? "
            "   (e.g., 'no output written', 'no README sections matched', "
            "   or simply the absence of urgency markers) "
            "(3) Is the overall behavior consistent with correctly skipping documentation "
            "   for internal/developer-only changes? "
            "Score high if the tool's output is consistent with not documenting internal-only changes. "
            "Score low ONLY if the stdout explicitly asserts the changes are user-visible and "
            "significant, contradicting the correct classification."
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
def test_alert_matches_signal(case: dict, request: pytest.FixtureRequest) -> None:
    if not case["expected_significant"]:
        pytest.skip("No output file expected for non-significant diff")
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    assert result.suggestions is not None
    expected = str(case["expected_alert"])
    assert f"[!{expected}]" in result.suggestions, (
        f"Expected [!{expected}] alert in suggestions for {case['id']}. "
        f"Got: {result.suggestions[:300]}"
    )


@pytest.mark.parametrize("case", CI_CASES, ids=[str(c["id"]) for c in CI_CASES])
def test_diff_block_present(case: dict, request: pytest.FixtureRequest) -> None:
    if not case["expected_significant"]:
        pytest.skip("No output file expected for non-significant diff")
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    assert result.suggestions is not None
    assert "```diff" in result.suggestions, (
        f"Expected a ```diff block in suggestions for {case['id']}."
    )
    assert re.search(r"^- .+", result.suggestions, re.MULTILINE), (
        f"Expected '- ' removal line in diff block for {case['id']}."
    )
    assert re.search(r"^\+ .+", result.suggestions, re.MULTILINE), (
        f"Expected '+ ' addition line in diff block for {case['id']}."
    )


@pytest.mark.parametrize("case", CI_CASES, ids=[str(c["id"]) for c in CI_CASES])
def test_section_heading_exists(case: dict, request: pytest.FixtureRequest) -> None:
    if not case["expected_significant"]:
        pytest.skip("No output file expected for non-significant diff")
    if not case.get("check_section_headings", True):
        pytest.skip("Section heading check skipped: PR introduces a new concept with no existing section")
    result: CiRunResult = request.getfixturevalue(case["fixture"])
    assert result.suggestions is not None
    readme_path = Path(REPO_ROOT) / "README.md"
    if not readme_path.exists():
        pytest.skip("README.md not found in repo root")
    readme = readme_path.read_text(encoding="utf-8")
    readme_headings = {
        line.lstrip("#").strip().lower()
        for line in readme.splitlines()
        if line.startswith("#")
    }
    section_names = re.findall(r"^\*\*Section:\*\* (.+)$", result.suggestions, re.MULTILINE)
    assert section_names, f"No **Section:** lines found in suggestions for {case['id']}."
    for name in section_names:
        assert name.strip().lower() in readme_headings, (
            f"Section '{name}' not found as a heading in README.md for {case['id']}. "
            f"Available headings: {sorted(readme_headings)}"
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
