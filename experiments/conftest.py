import os
import subprocess
import shutil

import pytest


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(REPO_ROOT, "datasets", "express-server")
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

    # Build a clean environment without the venv so script.ts finds system
    # Python (which has gitingest installed).
    env = os.environ.copy()
    env.pop("VIRTUAL_ENV", None)
    venv_bin = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".venv", "bin")
    path_dirs = [d for d in env.get("PATH", "").split(os.pathsep) if d != venv_bin]
    env["PATH"] = os.pathsep.join(path_dirs)

    # Run rereadme as subprocess
    try:
        result = subprocess.run(
            [
                "npx",
                "tsx",
                os.path.join(REPO_ROOT, "script.ts"),
                "--input",
                os.path.join(work_dir, "README.md"),
                "--output",
                output_path,
            ],
            cwd=work_dir,
            env=env,
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

    # Clean up generated file
    os.remove(output_path)

    return content


@pytest.fixture(scope="session")
def golden_readme():
    """Return golden README content if it exists, else None."""
    if os.path.exists(GOLDEN_PATH):
        with open(GOLDEN_PATH, "r") as f:
            return f.read()
    return None
