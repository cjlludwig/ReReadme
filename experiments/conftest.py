import os
import shutil
import subprocess
from datetime import datetime

import pytest


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(REPO_ROOT, "experiments/datasets", "express-server")
GOLDEN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golden")
GOLDEN_PATH = os.path.join(GOLDEN_DIR, "express-server-README.md")
OUTPUT_FILENAME = "README-generated.md"


@pytest.fixture(scope="session")
def generated_readme():
    """Run rereadme against the express-server dataset and return generated content."""
    if not os.environ.get("OPENAI_API_KEY"):
        pytest.fail("OPENAI_API_KEY environment variable is required")

    work_dir = DATASET_DIR
    output_path = os.path.join(work_dir, OUTPUT_FILENAME)

    # Clean up any previous generated file
    if os.path.exists(output_path):
        os.remove(output_path)

    # Run rereadme as subprocess
    try:
        result = subprocess.run(
            [
                "npx",
                "tsx",
                os.path.join(REPO_ROOT, "script.ts"),
                "--output",
                OUTPUT_FILENAME,
            ],
            cwd=work_dir,
            timeout=300,
            capture_output=True,
            text=True,
        )
    except subprocess.TimeoutExpired:
        pytest.fail("rereadme timed out after 300 seconds")

    if result.returncode != 0:
        pytest.fail(
            f"rereadme failed with exit code {result.returncode}\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )

    if not os.path.exists(output_path):
        pytest.fail("rereadme did not produce output file")

    with open(output_path, "r") as f:
        content = f.read()

    # Back up generated file for inspection
    results_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
    os.makedirs(results_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    backup_path = os.path.join(results_dir, f"express-server-{timestamp}.md")
    shutil.copy2(output_path, backup_path)

    # Clean up generated file from dataset dir
    os.remove(output_path)

    return content


@pytest.fixture(scope="session")
def golden_readme():
    """Return golden README content if it exists, else None."""
    if os.path.exists(GOLDEN_PATH):
        with open(GOLDEN_PATH, "r") as f:
            return f.read()
    return None
