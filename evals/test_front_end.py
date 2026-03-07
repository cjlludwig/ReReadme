import os

import pytest
from deepeval import assert_test  # type: ignore[attr-defined]
from deepeval.test_case import LLMTestCase

from metrics import (
    SectionHeadersMetric,
    SectionContentMetric,
    KeywordsMetric,
    GoldenAlignmentJudgeMetric,
    ReadabilityJudgeMetric,
    TemplateAdherenceJudgeMetric,
    FRONT_END_README_KEYWORDS,
    FRONT_END_AGENTS_KEYWORDS,
    AGENTS_SECTIONS,
    AGENTS_MIN_CONTENT_LENGTH,
)


GOLDEN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golden")
GOLDEN_PATH = os.path.join(GOLDEN_DIR, "front-end-README.md")
AGENTS_GOLDEN_PATH = os.path.join(GOLDEN_DIR, "front-end-AGENTS.md")


def test_section_headers(generated_readme_front_end: str) -> None:
    """All required section headers must be present."""
    metric = SectionHeadersMetric(threshold=1.0)
    test_case = LLMTestCase(
        input="Generate a README for front-end",
        actual_output=generated_readme_front_end,
    )
    assert_test(test_case, [metric])


def test_section_content(generated_readme_front_end: str) -> None:
    """All required sections must have meaningful content (>= 20 chars)."""
    metric = SectionContentMetric(threshold=1.0)
    test_case = LLMTestCase(
        input="Generate a README for front-end",
        actual_output=generated_readme_front_end,
    )
    assert_test(test_case, [metric])


def test_keywords(generated_readme_front_end: str) -> None:
    """README must include key front-end project keywords."""
    metric = KeywordsMetric(threshold=1.0, keywords=FRONT_END_README_KEYWORDS)
    test_case = LLMTestCase(
        input="Generate a README for front-end",
        actual_output=generated_readme_front_end,
    )
    assert_test(test_case, [metric])


def test_golden_readme_similarity(
    generated_readme_front_end: str, golden_readme_front_end: str | None
) -> None:
    """Generated README should be semantically similar to the golden version."""
    if golden_readme_front_end is None:
        os.makedirs(GOLDEN_DIR, exist_ok=True)
        with open(GOLDEN_PATH, "w") as f:
            f.write(generated_readme_front_end)
        pytest.skip(
            "Golden README created at evals/golden/front-end-README.md. "
            "Review and commit it, then re-run."
        )

    metric = GoldenAlignmentJudgeMetric()

    test_case = LLMTestCase(
        input="Generate a README for front-end",
        actual_output=generated_readme_front_end,
        expected_output=golden_readme_front_end,
    )
    assert_test(test_case, [metric])


def test_agents_section_headers(generated_agents_front_end: str) -> None:
    """AGENTS.md must contain the core required section headers."""
    metric = SectionHeadersMetric(threshold=1.0, sections=AGENTS_SECTIONS)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for front-end",
        actual_output=generated_agents_front_end,
    )
    assert_test(test_case, [metric])


def test_agents_section_content(generated_agents_front_end: str) -> None:
    """Core AGENTS.md sections must have meaningful content."""
    metric = SectionContentMetric(threshold=1.0, sections=AGENTS_SECTIONS, min_content_length=AGENTS_MIN_CONTENT_LENGTH)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for front-end",
        actual_output=generated_agents_front_end,
    )
    assert_test(test_case, [metric])


def test_agents_keywords(generated_agents_front_end: str) -> None:
    """AGENTS.md must include key facts an agent needs to work in the repo."""
    metric = KeywordsMetric(threshold=1.0, keywords=FRONT_END_AGENTS_KEYWORDS)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for front-end",
        actual_output=generated_agents_front_end,
    )
    assert_test(test_case, [metric])


def test_agents_golden_similarity(
    generated_agents_front_end: str, golden_agents_front_end: str | None
) -> None:
    """Generated AGENTS.md should be semantically similar to the golden version."""
    if golden_agents_front_end is None:
        os.makedirs(GOLDEN_DIR, exist_ok=True)
        with open(AGENTS_GOLDEN_PATH, "w") as f:
            f.write(generated_agents_front_end)
        pytest.skip(
            "Golden AGENTS.md created at evals/golden/front-end-AGENTS.md. "
            "Review and commit it, then re-run."
        )

    metric = GoldenAlignmentJudgeMetric()

    test_case = LLMTestCase(
        input="Generate an AGENTS.md for front-end",
        actual_output=generated_agents_front_end,
        expected_output=golden_agents_front_end,
    )
    assert_test(test_case, [metric])


def test_readme_readability(generated_readme_front_end: str) -> None:
    """Generated README must pass the readability judge (clarity, conciseness, structure)."""
    metric = ReadabilityJudgeMetric()
    test_case = LLMTestCase(
        input="Generate a README for front-end",
        actual_output=generated_readme_front_end,
    )
    assert_test(test_case, [metric])


def test_readme_template_adherence(generated_readme_front_end: str) -> None:
    """Generated README must pass template adherence (coverage, alignment, completeness)."""
    metric = TemplateAdherenceJudgeMetric()
    test_case = LLMTestCase(
        input="Generate a README for front-end",
        actual_output=generated_readme_front_end,
    )
    assert_test(test_case, [metric])
