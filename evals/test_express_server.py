import os

import pytest
from deepeval import assert_test  # type: ignore[attr-defined]
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from metrics import SectionHeadersMetric, SectionContentMetric, KeywordsMetric


GOLDEN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golden")
GOLDEN_PATH = os.path.join(GOLDEN_DIR, "express-server-README.md")
AGENTS_GOLDEN_PATH = os.path.join(GOLDEN_DIR, "express-server-AGENTS.md")

# AGENTS.md must always have Project and Commands; other sections are optional per template rules
AGENTS_REQUIRED_SECTIONS = ["## Project", "## Commands"]

AGENTS_KEYWORDS = [
    "npm install",
    "npm start",
    "Node.js",
    "Express.js",
    "MongoDB",
]


def test_section_headers(generated_readme):
    """All required section headers must be present."""
    metric = SectionHeadersMetric(threshold=1.0)
    test_case = LLMTestCase(
        input="Generate a README for express-server",
        actual_output=generated_readme,
    )
    assert_test(test_case, [metric])


def test_section_content(generated_readme):
    """All required sections must have meaningful content (>= 20 chars)."""
    metric = SectionContentMetric(threshold=1.0)
    test_case = LLMTestCase(
        input="Generate a README for express-server",
        actual_output=generated_readme,
    )
    assert_test(test_case, [metric])


def test_keywords(generated_readme):
    """README must include npm install and npm test commands."""
    metric = KeywordsMetric(threshold=1.0)
    test_case = LLMTestCase(
        input="Generate a README for express-server",
        actual_output=generated_readme,
    )
    assert_test(test_case, [metric])


def test_golden_readme_similarity(generated_readme, golden_readme):
    """Generated README should be semantically similar to the golden version."""
    if golden_readme is None:
        # First run: create the golden file
        os.makedirs(GOLDEN_DIR, exist_ok=True)
        with open(GOLDEN_PATH, "w") as f:
            f.write(generated_readme)
        pytest.skip(
            "Golden README created at evals/golden/express-server-README.md. "
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
        input="Generate a README for express-server",
        actual_output=generated_readme,
        expected_output=golden_readme,
    )
    assert_test(test_case, [metric])


def test_agents_section_headers(generated_agents_express_server: str) -> None:
    """AGENTS.md must contain the core required section headers."""
    metric = SectionHeadersMetric(threshold=1.0, sections=AGENTS_REQUIRED_SECTIONS)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for express-server",
        actual_output=generated_agents_express_server,
    )
    assert_test(test_case, [metric])


def test_agents_section_content(generated_agents_express_server: str) -> None:
    """Core AGENTS.md sections must have meaningful content (>= 20 chars)."""
    metric = SectionContentMetric(threshold=1.0, sections=AGENTS_REQUIRED_SECTIONS)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for express-server",
        actual_output=generated_agents_express_server,
    )
    assert_test(test_case, [metric])


def test_agents_keywords(generated_agents_express_server: str) -> None:
    """AGENTS.md must include key facts an agent needs to work in the repo."""
    metric = KeywordsMetric(threshold=1.0, keywords=AGENTS_KEYWORDS)
    test_case = LLMTestCase(
        input="Generate an AGENTS.md for express-server",
        actual_output=generated_agents_express_server,
    )
    assert_test(test_case, [metric])


def test_agents_golden_similarity(
    generated_agents_express_server: str, golden_agents_express_server: str | None
) -> None:
    """Generated AGENTS.md should be semantically similar to the golden version."""
    if golden_agents_express_server is None:
        os.makedirs(GOLDEN_DIR, exist_ok=True)
        with open(AGENTS_GOLDEN_PATH, "w") as f:
            f.write(generated_agents_express_server)
        pytest.skip(
            "Golden AGENTS.md created at evals/golden/express-server-AGENTS.md. "
            "Review and commit it, then re-run."
        )

    metric = GEval(
        name="AGENTS.md Similarity",
        criteria=(
            "Evaluate semantic similarity between the generated AGENTS.md and the golden AGENTS.md. "
            "Focus on: presence of required sections (Project, Commands), accuracy of commands, "
            "correctness of file structure, and appropriate constraints. "
            "Minor wording differences should be tolerated."
        ),
        evaluation_params=[
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        threshold=0.70,
        model="gpt-5-mini",
    )

    test_case = LLMTestCase(
        input="Generate an AGENTS.md for express-server",
        actual_output=generated_agents_express_server,
        expected_output=golden_agents_express_server,
    )
    assert_test(test_case, [metric])
