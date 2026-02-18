# Plan: Rename `experiments/` → `evals/`

## Context

`experiments/` is the industry term for one-off research; `evals/` is the standard name for
systematic quality evaluation pipelines. Renaming makes the directory's purpose clearer and
aligns with common convention in AI tooling.

The directory contains git submodules, so the rename requires both a `git mv` and updates
to `.gitmodules` + `git submodule sync` so git tracks submodule paths correctly.

---

## Step 1: Rename the directory (git)

```bash
git mv experiments evals
```

This stages the rename in git's index. The submodule pointers still show the old path in
`.gitmodules` and `.git/config` until fixed in Step 2.

---

## Step 2: Update `.gitmodules`

**File:** `.gitmodules`

Two submodule entries, each with two lines to update:

```text
# Before
[submodule "experiments/datasets/express-server"]
    path = experiments/datasets/express-server
[submodule "experiments/datasets/rereadme"]
    path = experiments/datasets/rereadme

# After
[submodule "evals/datasets/express-server"]
    path = evals/datasets/express-server
[submodule "evals/datasets/rereadme"]
    path = evals/datasets/rereadme
```

Then run:

```bash
git submodule sync
```

to propagate the updated paths into `.git/config`.

---

## Step 3: Update file content references

All changes are simple string replacements: `experiments` → `evals`.

| File | What changes |
|------|-------------|
| `.gitignore` | 6 lines: `experiments/__pycache__/`, `.pytest_cache/`, `.deepeval_cache/`, `.venv/`, `datasets/express-server/README-generated.md`, `results/` |
| `package.json` | `setup`, `eval`, `eval:rereadme`, `eval:agents` scripts: `cd experiments` and `experiments/datasets/...` paths |
| `tsconfig.json` | `exclude` entry: `"experiments/datasets"` → `"evals/datasets"` |
| `jest.config.ts` | `testPathIgnorePatterns` and `modulePathIgnorePatterns` |
| `eslint.config.js` | `ignores` array: `"experiments/"` → `"evals/"` |
| `Makefile` | All 8 occurrences: `lint-md`, `lint-py`, `typecheck-py`, `depcheck`, `deptry`, `fix` targets |
| `CLAUDE.md` | Section heading and all path references (~8 occurrences) |
| `.github/workflows/eval.yml.todo` | `cd experiments` → `cd evals` |

### Files inside `evals/` (after directory rename)

| File | What changes |
|------|-------------|
| `evals/conftest.py` | Lines 10, 108: `"experiments/datasets"` → `"evals/datasets"` |
| `evals/test_express_server.py` | Lines 65, 131: skip message strings |
| `evals/test_rereadme.py` | Lines 77, 143: skip message strings |
| `evals/README.md` | `cd experiments` reference on line 33 |

---

## Step 4: Fix `docs/overview.md` linting errors

This file was added alongside this work and has three `markdownlint` failures that block `make check`:

1. **Line 7** — trailing space after `"repeatable "` → remove it
2. **Line 15** — bare URL → wrap as a markdown link: `[Traces](<url>)`
3. **Line 22** — missing trailing newline → add one

---

## Verification

```bash
make check   # ESLint, markdownlint, ruff, tsc, mypy, depcheck, deptry must all pass
```

Spot-check submodule wiring:

```bash
git submodule status   # should show evals/datasets/... paths, no leading '-'
```
