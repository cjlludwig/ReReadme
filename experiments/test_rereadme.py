import os

import pytest
from deepeval import assert_test  # type: ignore[attr-defined]
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from metrics import SectionHeadersMetric, SectionContentMetric, KeywordsMetric


GOLDEN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golden")
GOLDEN_PATH = os.path.join(GOLDEN_DIR, "rereadme-README.md")

REREADME_KEYWORDS = [
    "npm install",
    "npm run dev",
    "OPENAI_API_KEY",
    "TypeScript",
    "OpenAI Agents SDK",
    "markdownlint",
    "git clone https://github.com/connorludwig/rereadme.git",
    "rereadme",
    "rereadme --check"
]


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
    metric = KeywordsMetric(threshold=1.0, keywords=REREADME_KEYWORDS)
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
            "Golden README created at experiments/golden/rereadme-README.md. "
            "Review and commit it, then re-run."
        )

    metric = GEval(
        name="README Similarity",
        criteria=(
            "Evaluate semantic similarity between the generated README and the golden README. "
            "Consider section structure alignment, technical accuracy of descriptions, "
            "and content completeness. Minor wording and structure differences should be tolerated."
        ),
        evaluation_params=[
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        threshold=0.70,
        model="gpt-5-mini",
    )

    test_case = LLMTestCase(
        input="Generate a README for rereadme",
        actual_output=generated_readme_rereadme,
        expected_output=golden_readme_rereadme,
    )
    assert_test(test_case, [metric])
