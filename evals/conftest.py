import os
import shutil
import subprocess
from collections.abc import Generator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pytest


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(REPO_ROOT, "evals/datasets", "express-server")
GOLDEN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golden")
GOLDEN_PATH = os.path.join(GOLDEN_DIR, "express-server-README.md")
OUTPUT_FILENAME = "README-generated.md"
AGENTS_OUTPUT_FILENAME = "AGENTS-generated.md"


@dataclass
class CiRunResult:
    returncode: int
    stdout: str
    suggestions: str | None  # file content if written, else None


def run_ci(base_ref: str, head_ref: str, output_path: Path) -> CiRunResult:
    if not os.environ.get("OPENAI_API_KEY"):
        pytest.fail("OPENAI_API_KEY environment variable is not set")

    output_path.parent.mkdir(exist_ok=True)

    proc = subprocess.run(
        [
            "npx", "tsx", "script.ts",
            "--ci",
            "--verbose",
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


@pytest.fixture(scope="session")
def _express_server_run() -> tuple[str, str]:
    """Run rereadme --agents against express-server once, return (readme, agents)."""
    if not os.environ.get("OPENAI_API_KEY"):
        pytest.fail("OPENAI_API_KEY environment variable is required")

    work_dir = DATASET_DIR
    output_path = os.path.join(work_dir, OUTPUT_FILENAME)
    agents_output_path = os.path.join(work_dir, AGENTS_OUTPUT_FILENAME)

    # Clean up any previous generated files
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
        pytest.fail("rereadme timed out after 400 seconds")

    if result.returncode != 0:
        pytest.fail(
            f"rereadme failed with exit code {result.returncode}\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )

    if not os.path.exists(output_path):
        pytest.fail("rereadme did not produce README output file")
    if not os.path.exists(agents_output_path):
        pytest.fail("rereadme did not produce AGENTS.md output file")

    with open(output_path) as f:
        readme_content = f.read()
    with open(agents_output_path) as f:
        agents_content = f.read()

    # Back up generated files for inspection
    results_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
    os.makedirs(results_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    shutil.copy2(output_path, os.path.join(results_dir, f"express-server-{timestamp}.md"))
    shutil.copy2(agents_output_path, os.path.join(results_dir, f"express-server-AGENTS-{timestamp}.md"))

    # Clean up generated files from dataset dir
    for p in [output_path, agents_output_path]:
        if os.path.exists(p):
            os.remove(p)

    return readme_content, agents_content


@pytest.fixture(scope="session")
def generated_readme(_express_server_run: tuple[str, str]) -> str:
    readme, _ = _express_server_run
    return readme


@pytest.fixture(scope="session")
def generated_agents_express_server(_express_server_run: tuple[str, str]) -> str:
    _, agents = _express_server_run
    return agents


@pytest.fixture(scope="session")
def golden_readme():
    """Return golden README content if it exists, else None."""
    if os.path.exists(GOLDEN_PATH):
        with open(GOLDEN_PATH) as f:
            return f.read()
    return None


# --- rereadme dataset ---

REREADME_DATASET_DIR = os.path.join(REPO_ROOT, "evals/datasets", "rereadme")
REREADME_GOLDEN_PATH = os.path.join(GOLDEN_DIR, "rereadme-README.md")


@pytest.fixture(scope="session")
def _rereadme_run() -> tuple[str, str]:
    """Run rereadme --agents against the rereadme dataset once, return (readme, agents)."""
    if not os.environ.get("OPENAI_API_KEY"):
        pytest.fail("OPENAI_API_KEY environment variable is required")

    work_dir = REREADME_DATASET_DIR
    output_path = os.path.join(work_dir, OUTPUT_FILENAME)
    agents_output_path = os.path.join(work_dir, AGENTS_OUTPUT_FILENAME)

    # Clean up any previous generated files
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
        pytest.fail("rereadme timed out after 400 seconds")

    if result.returncode != 0:
        pytest.fail(
            f"rereadme failed with exit code {result.returncode}\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )

    if not os.path.exists(output_path):
        pytest.fail("rereadme did not produce README output file")
    if not os.path.exists(agents_output_path):
        pytest.fail("rereadme did not produce AGENTS.md output file")

    with open(output_path) as f:
        readme_content = f.read()
    with open(agents_output_path) as f:
        agents_content = f.read()

    # Back up generated files for inspection
    results_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
    os.makedirs(results_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    shutil.copy2(output_path, os.path.join(results_dir, f"rereadme-{timestamp}.md"))
    shutil.copy2(agents_output_path, os.path.join(results_dir, f"rereadme-AGENTS-{timestamp}.md"))

    # Clean up generated files from dataset dir
    for p in [output_path, agents_output_path]:
        if os.path.exists(p):
            os.remove(p)

    return readme_content, agents_content


@pytest.fixture(scope="session")
def generated_readme_rereadme(_rereadme_run: tuple[str, str]) -> str:
    readme, _ = _rereadme_run
    return readme


@pytest.fixture(scope="session")
def generated_agents_rereadme(_rereadme_run: tuple[str, str]) -> str:
    _, agents = _rereadme_run
    return agents


@pytest.fixture(scope="session")
def golden_readme_rereadme():
    """Return golden rereadme README content if it exists, else None."""
    if os.path.exists(REREADME_GOLDEN_PATH):
        with open(REREADME_GOLDEN_PATH) as f:
            return f.read()
    return None


# --- Golden AGENTS.md fixtures ---

EXPRESS_AGENTS_GOLDEN_PATH = os.path.join(GOLDEN_DIR, "express-server-AGENTS.md")
REREADME_AGENTS_GOLDEN_PATH = os.path.join(GOLDEN_DIR, "rereadme-AGENTS.md")


@pytest.fixture(scope="session")
def golden_agents_express_server():
    """Return golden express-server AGENTS.md content if it exists, else None."""
    if os.path.exists(EXPRESS_AGENTS_GOLDEN_PATH):
        with open(EXPRESS_AGENTS_GOLDEN_PATH) as f:
            return f.read()
    return None


@pytest.fixture(scope="session")
def golden_agents_rereadme():
    """Return golden rereadme AGENTS.md content if it exists, else None."""
    if os.path.exists(REREADME_AGENTS_GOLDEN_PATH):
        with open(REREADME_AGENTS_GOLDEN_PATH) as f:
            return f.read()
    return None


# --- CI mode fixtures ---


@pytest.fixture(scope="session")
def ci_run_pr11() -> Generator[CiRunResult, None, None]:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    output_path = Path(REPO_ROOT) / "evals" / "results" / f"ci-pr11-{timestamp}.md"
    yield run_ci("3ea3dcf", "bd31fbc", output_path)


@pytest.fixture(scope="session")
def ci_run_pr14() -> Generator[CiRunResult, None, None]:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    output_path = Path(REPO_ROOT) / "evals" / "results" / f"ci-pr14-{timestamp}.md"
    yield run_ci("ae761da", "8a10c7a", output_path)


@pytest.fixture(scope="session")
def ci_run_pr15() -> Generator[CiRunResult, None, None]:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    output_path = Path(REPO_ROOT) / "evals" / "results" / f"ci-pr15-{timestamp}.md"
    yield run_ci("8a10c7a", "cfa1d4c", output_path)


@pytest.fixture(scope="session")
def ci_run_pr17() -> Generator[CiRunResult, None, None]:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    output_path = Path(REPO_ROOT) / "evals" / "results" / f"ci-pr17-{timestamp}.md"
    yield run_ci("5513e67", "5bbc138", output_path)
