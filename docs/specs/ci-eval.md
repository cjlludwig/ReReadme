# Evals for CI Mode

Consistent evals for the CI diff-analysis workflow, pinned to real PRs that introduced user-facing changes without README updates. Tests run against the rereadme repo itself using specific commit SHAs so diffs are deterministic.

## Reference PRs (Test Cases)

Three cases cover the full signal range: high, medium, and none.

### PR #11 — Adding the CI Mode

**Link:** <https://github.com/cjlludwig/ReReadme/pull/11>
**Refs:** `base=3ea3dcf`, `head=bd31fbc`

**Expected:**

- Signal level: **high**
- Suggestions file written: yes
- The suggestions should identify the missing usage documentation for the `--ci`, `--base-ref`, and `--head-ref` flags

**Deterministic checks:**

- Output file exists at `evals/results/ci-pr11-{timestamp}.md`
- Output contains a GitHub alert block (`[!CAUTION]` or `[!WARNING]`)
- Keywords present: `--ci`, `--base-ref`, `--head-ref` (or `base-ref`), `Usage` (or `usage`)

**Non-deterministic (GEval):**

- Criteria: Was `high` the correct signal level? The diff adds a new CLI flag with no README update — this is a clear, high-confidence gap in user-facing documentation. The reasoning must name the specific flag(s) and the exact README section that is missing coverage. Generic or vague justification should fail.
- Threshold: 0.70

---

### PR #14 — Wiring the Common GHA

**Link:** <https://github.com/cjlludwig/ReReadme/pull/14>
**Refs:** `base=ae761da`, `head=8a10c7a`

**Expected:**

- Signal level: **medium**
- Suggestions file written: yes
- The suggestions should note GHA usage (a code snippet and a link to the action) while acknowledging this is discretionary since no CI docs currently exist

**Deterministic checks:**

- Output file exists at `evals/results/ci-pr14-{timestamp}.md`
- Output contains a GitHub alert block (`[!WARNING]` or `[!TIP]`)
- Keywords present: `action` or `GitHub Actions` or `uses:`

**Non-deterministic (GEval):**

- Criteria: Was `medium` (not `high`) the correct tier? The diff wires a reusable GHA but the repo has no existing CI integration section — whether users want this documented is ambiguous. The reasoning must justify the downgrade from high (no existing section, discretionary content). A response that calls this `high` without addressing the ambiguity should fail.
- Threshold: 0.70

---

### PR #15 — Minor Refactor and Coverage Improvements

**Link:** <https://github.com/cjlludwig/ReReadme/pull/15>
**Refs:** `base=8a10c7a`, `head=cfa1d4c`

**Expected:**

- Signal level: **none / not significant**
- Suggestions file written: **no** (script exits without writing)

**Deterministic checks:**

- Output file does **not** exist (primary assertion)
- Process exits with code 0

**Non-deterministic (GEval):**

- Input: captured stdout from the subprocess (contains signal level + reason logged before exit)
- Criteria: Given that the diff contains only internal test reorganization and code coverage improvements — no new flags, no new APIs, no breaking changes — is "no documentation suggestions" a justified and well-reasoned conclusion? Vague reasons like "minor change" are insufficient; the reasoning should name specific change types (test refactor, internal extraction) and explain why they are non-user-facing.
- Threshold: 0.70

---

## Implementation

### File layout

```text
evals/
  conftest.py           ← add 3 new session-scoped CI fixtures
  test_ci_mode.py       ← new file; all CI eval tests
  results/              ← timestamped suggestions files written here
```

### conftest.py additions

Add a helper `run_ci` and three session-scoped fixtures. Each fixture:

1. Runs `npx tsx script.ts --ci --base-ref <base> --head-ref <head> --ci-output <output_path>` with `cwd=REPO_ROOT`
2. Captures `(returncode, stdout, output_path)` — the output file may or may not exist depending on signal
3. Backs up the output file to `evals/results/` if present (same timestamp pattern as existing fixtures)
4. Cleans up the output file from `evals/results/` only at session teardown (leave for inspection during run)
5. Returns a `CiRunResult` dataclass: `(returncode: int, stdout: str, suggestions: str | None)`
   - `suggestions` is the file content if the file was written, else `None`

Fixture names: `ci_run_pr11`, `ci_run_pr14`, `ci_run_pr15`.

### test_ci_mode.py structure

A single file with parametrized test functions. Each case is defined as a config dict in a `CI_CASES` list at the top of the file. All test logic is shared; only the per-case config varies.

**Case config shape:**

```python
CI_CASES = [
    {
        "id": "pr11_ci_flag",
        "fixture": "ci_run_pr11",
        "expected_significant": True,
        "expected_signal": "high",
        "keywords": ["--ci", "--base-ref", "usage"],
        "geval_criteria": "...",   # signal tier + reasoning quality rubric
    },
    {
        "id": "pr14_gha",
        "fixture": "ci_run_pr14",
        "expected_significant": True,
        "expected_signal": "medium",
        "keywords": ["action"],    # matches "GitHub Actions", "uses:", etc.
        "geval_criteria": "...",
    },
    {
        "id": "pr15_refactor",
        "fixture": "ci_run_pr15",
        "expected_significant": False,
        "expected_signal": None,
        "keywords": [],
        "geval_criteria": "...",   # evaluated against stdout, not suggestions
    },
]
```

**Test functions (all parametrized over `CI_CASES`):**

```text
test_file_presence(case, request)
  ← if expected_significant: assert suggestions is not None
  ← else: assert suggestions is None

test_exit_code(case, request)
  ← assert returncode == 0 for all cases

test_output_format(case, request)
  ← skip if not expected_significant
  ← assert alert block ([!CAUTION] / [!WARNING] / [!TIP]) present in suggestions

test_keywords(case, request)
  ← skip if not expected_significant
  ← assert all case["keywords"] present (case-insensitive) in suggestions

test_signal_geval(case, request)
  ← GEval on suggestions (if significant) or stdout (if not significant)
  ← criteria and expected tier from case config
  ← threshold: 0.70
```

`request.getfixturevalue(case["fixture"])` resolves the right `CiRunResult` per case.

### npm scripts

```json
"eval:ci":  "cd evals && uv run pytest test_ci_mode.py -v",
"eval:all":  "cd evals && uv run pytest -v"
```

The existing `eval` script is unchanged. `eval:all` runs everything including the new CI tests.

---

## Metrics Summary

| Type | Check | Cases |
|------|-------|-------|
| Deterministic | File present/absent | All three |
| Deterministic | Alert block in output | PR #11, #14 |
| Deterministic | Keyword scan | PR #11, #14 |
| Deterministic | Exit code 0 | PR #15 |
| Non-deterministic (GEval 0.70) | Signal tier + reasoning quality | All three |

GEval model: `gpt-4o-mini` (consistent with existing `GEVAL_MODEL` in `evals/metrics/types.py`).

---

## Notes

- **CWD**: All CI fixtures run from `REPO_ROOT`, not a dataset dir — git operations resolve against the rereadme repo history.
- **Noise bar**: GEval criteria for all three cases explicitly penalize vague reasoning. The eval is designed to catch a model that calls everything "high" or uses boilerplate justifications.
- **Commit SHAs**: The refs above are squash-merge commits on `main`. `base^` resolves to the commit immediately before each PR landed.
- **OPENAI_API_KEY**: CI fixtures share the same guard as existing fixtures (`pytest.fail` if missing).
