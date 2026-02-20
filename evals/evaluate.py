from __future__ import annotations

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

EVALS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(EVALS_DIR)
sys.path.insert(0, EVALS_DIR)

from deepeval.evaluate import evaluate, DisplayConfig  # noqa: E402
from deepeval.test_case import LLMTestCase  # noqa: E402

from metrics import (  # noqa: E402
    SectionHeadersMetric,
    SectionContentMetric,
    KeywordsMetric,
    AdaptiveGEvalMetric,
    EXPRESS_AGENTS_KEYWORDS,
    REREADME_README_KEYWORDS,
    REREADME_AGENTS_KEYWORDS,
    AGENTS_SECTIONS,
    README_GEVAL_CRITERIA,
    AGENTS_GEVAL_CRITERIA,
)

# --- Constants ---

OUTPUT_FILENAME = "README-generated.md"
AGENTS_OUTPUT_FILENAME = "AGENTS-generated.md"
GOLDEN_DIR = os.path.join(EVALS_DIR, "golden")

EXPRESS_README_GOLDEN = os.path.join(GOLDEN_DIR, "express-server-README.md")
EXPRESS_AGENTS_GOLDEN = os.path.join(GOLDEN_DIR, "express-server-AGENTS.md")
REREADME_README_GOLDEN = os.path.join(GOLDEN_DIR, "rereadme-README.md")
REREADME_AGENTS_GOLDEN = os.path.join(GOLDEN_DIR, "rereadme-AGENTS.md")

SHARED_METRICS: list = [
    SectionHeadersMetric(threshold=1.0),
    SectionContentMetric(threshold=1.0),
    KeywordsMetric(threshold=1.0),
    AdaptiveGEvalMetric(),
]


# --- Dataclasses ---


@dataclass
class EvalUnit:
    label: str
    dataset_name: str
    output_type: str  # "readme" or "agents"
    input_prompt: str
    golden_path: str
    keywords: Optional[list[str]]
    sections: Optional[list[str]]  # None = default README sections


@dataclass
class AccumulatedResult:
    label: str
    success: bool
    passed_metrics: int
    total_metrics: int
    golden_created: bool


# --- Runner ---


def run_rereadme(dataset_name: str) -> tuple[str, str]:
    """Run rereadme --agents against a dataset once, return (readme, agents)."""
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY environment variable is required")

    work_dir = os.path.join(REPO_ROOT, "evals", "datasets", dataset_name)
    output_path = os.path.join(work_dir, OUTPUT_FILENAME)
    agents_output_path = os.path.join(work_dir, AGENTS_OUTPUT_FILENAME)

    for p in [output_path, agents_output_path]:
        if os.path.exists(p):
            os.remove(p)

    try:
        result = subprocess.run(
            [
                "npx",
                "tsx",
                os.path.join(REPO_ROOT, "script.ts"),
                "--output",
                OUTPUT_FILENAME,
                "--agents",
                "--agents-output",
                AGENTS_OUTPUT_FILENAME,
                "--no-backup",
            ],
            cwd=work_dir,
            timeout=400,
            capture_output=True,
            text=True,
        )
    except subprocess.TimeoutExpired:
        sys.exit(f"rereadme timed out after 400 seconds (dataset: {dataset_name})")

    if result.returncode != 0:
        sys.exit(
            f"rereadme failed with exit code {result.returncode}\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )

    if not os.path.exists(output_path):
        sys.exit("rereadme did not produce README output file")
    if not os.path.exists(agents_output_path):
        sys.exit("rereadme did not produce AGENTS.md output file")

    with open(output_path) as f:
        readme_content = f.read()
    with open(agents_output_path) as f:
        agents_content = f.read()

    results_dir = os.path.join(EVALS_DIR, "results")
    os.makedirs(results_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    shutil.copy2(output_path, os.path.join(results_dir, f"{dataset_name}-{timestamp}.md"))
    shutil.copy2(
        agents_output_path,
        os.path.join(results_dir, f"{dataset_name}-AGENTS-{timestamp}.md"),
    )

    for p in [output_path, agents_output_path]:
        if os.path.exists(p):
            os.remove(p)

    return readme_content, agents_content


def load_or_create_golden(
    golden_path: str, content: str, label: str
) -> tuple[str | None, bool]:
    """Return golden content if it exists; otherwise write it and return (None, True)."""
    if os.path.exists(golden_path):
        with open(golden_path) as f:
            return f.read(), False
    os.makedirs(os.path.dirname(golden_path), exist_ok=True)
    with open(golden_path, "w") as f:
        f.write(content)
    print(f"[{label}] Golden file created at {golden_path}. Review and commit it, then re-run.")
    return None, True


def main() -> None:
    units = [
        EvalUnit(
            label="express-server / README",
            dataset_name="express-server",
            output_type="readme",
            input_prompt="Generate a README for express-server",
            golden_path=EXPRESS_README_GOLDEN,
            keywords=None,  # use default 6 keywords from KeywordsMetric
            sections=None,  # use default README sections
        ),
        EvalUnit(
            label="express-server / AGENTS.md",
            dataset_name="express-server",
            output_type="agents",
            input_prompt="Generate an AGENTS.md for express-server",
            golden_path=EXPRESS_AGENTS_GOLDEN,
            keywords=EXPRESS_AGENTS_KEYWORDS,
            sections=AGENTS_SECTIONS,
        ),
        EvalUnit(
            label="rereadme / README",
            dataset_name="rereadme",
            output_type="readme",
            input_prompt="Generate a README for rereadme",
            golden_path=REREADME_README_GOLDEN,
            keywords=REREADME_README_KEYWORDS,
            sections=None,  # use default README sections
        ),
        EvalUnit(
            label="rereadme / AGENTS.md",
            dataset_name="rereadme",
            output_type="agents",
            input_prompt="Generate an AGENTS.md for rereadme",
            golden_path=REREADME_AGENTS_GOLDEN,
            keywords=REREADME_AGENTS_KEYWORDS,
            sections=AGENTS_SECTIONS,
        ),
    ]

    # Phase 1: All LLM runs
    print("Running rereadme against express-server...")
    express_readme, express_agents = run_rereadme("express-server")
    print("Running rereadme against rereadme...")
    rereadme_readme, rereadme_agents = run_rereadme("rereadme")

    dataset_outputs: dict[tuple[str, str], str] = {
        ("express-server", "readme"): express_readme,
        ("express-server", "agents"): express_agents,
        ("rereadme", "readme"): rereadme_readme,
        ("rereadme", "agents"): rereadme_agents,
    }

    # Phase 2: Load goldens + build all test cases
    prepared: list = []
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
        display_config=DisplayConfig(print_results=True, file_output_dir='results'),
    )


if __name__ == "__main__":
    main()
