import os

import pytest
from deepeval import assert_test  # type: ignore[attr-defined]
from deepeval.test_case import LLMTestCase

from metrics import (
    SectionHeadersMetric,
    SectionContentMetric,
    KeywordsMetric,
    GoldenAlignmentJudgeMetric,
    REREADME_README_KEYWORDS,
    REREADME_AGENTS_KEYWORDS,
    AGENTS_SECTIONS,
    AGENTS_MIN_CONTENT_LENGTH,
)


GOLDEN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golden")
GOLDEN_PATH = os.path.join(GOLDEN_DIR, "rereadme-README.md")
AGENTS_GOLDEN_PATH = os.path.join(GOLDEN_DIR, "rereadme-AGENTS.md")


def test_section_headers(generated_readme_rereadme):
    """All required section headers must be present."""
    metric = SectionHeadersMetric(threshold=1.0)
    test_case = LLMTestCase(
        input="Generate a README for rereadme",
        actual_output=generated_readme_rereadme,
    )
    assert_test(test_case, [metric])


def test_section_content(generated_readme_rereadme):
    """All required sections must have meaningful content (>= 20 chars)."""
    metric = SectionContentMetric(threshold=1.0)
    test_case = LLMTestCase(
        input="Generate a README for rereadme",
        actual_output=generated_readme_rereadme,
    )
    assert_test(test_case, [metric])


def test_keywords(generated_readme_rereadme):
    """README must include rereadme-specific keywords."""
    metric = KeywordsMetric(threshold=1.0, keywords=REREADME_README_KEYWORDS)
    test_case = LLMTestCase(
        input="Generate a README for rereadme",
        actual_output=generated_readme_rereadme,
    )
    assert_test(test_case, [metric])


def test_golden_readme_similarity(generated_readme_rereadme, golden_readme_rereadme):
    """Generated README should be semantically similar to the golden version."""
    if golden_readme_rereadme is None:
        # First run: create the golden file
        os.makedirs(GOLDEN_DIR, exist_ok=True)
        with open(GOLDEN_PATH, "w") as f:
            f.write(generated_readme_rereadme)
        pytest.skip(
            "Golden README created at evals/golden/rereadme-README.md. "
            "Review and commit it, then re-run."
        )

    metric = GoldenAlignmentJudgeMetric()

    test_case = LLMTestCase(
        input="Generate a README for rereadme",
        actual_output=generated_readme_rereadme,
        expected_output=golden_readme_rereadme,
    )
    assert_test(test_case, [metric])


def test_agents_section_headers(generated_agents_rereadme: str) -> None:
    """AGENTS.md must contain the core required section headers."""
    metric = SectionHeadersMetric(threshold=1.0, sections=AGENTS_SECTIONS)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for rereadme",
        actual_output=generated_agents_rereadme,
    )
    assert_test(test_case, [metric])


def test_agents_section_content(generated_agents_rereadme: str) -> None:
    """Core AGENTS.md sections must have meaningful content."""
    metric = SectionContentMetric(threshold=1.0, sections=AGENTS_SECTIONS, min_content_length=AGENTS_MIN_CONTENT_LENGTH)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for rereadme",
        actual_output=generated_agents_rereadme,
    )
    assert_test(test_case, [metric])


def test_agents_keywords(generated_agents_rereadme: str) -> None:
    """AGENTS.md must include key facts an agent needs to work in the repo."""
    metric = KeywordsMetric(threshold=1.0, keywords=REREADME_AGENTS_KEYWORDS)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for rereadme",
        actual_output=generated_agents_rereadme,
    )
    assert_test(test_case, [metric])


def test_agents_golden_similarity(
    generated_agents_rereadme: str, golden_agents_rereadme: str | None
) -> None:
    """Generated AGENTS.md should be semantically similar to the golden version."""
    if golden_agents_rereadme is None:
        os.makedirs(GOLDEN_DIR, exist_ok=True)
        with open(AGENTS_GOLDEN_PATH, "w") as f:
            f.write(generated_agents_rereadme)
        pytest.skip(
            "Golden AGENTS.md created at evals/golden/rereadme-AGENTS.md. "
            "Review and commit it, then re-run."
        )

    metric = GoldenAlignmentJudgeMetric()

    test_case = LLMTestCase(
        input="Generate an AGENTS.md for rereadme",
        actual_output=generated_agents_rereadme,
        expected_output=golden_agents_rereadme,
    )
    assert_test(test_case, [metric])
