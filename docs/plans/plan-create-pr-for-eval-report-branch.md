# Plan: Create PR for eval-report branch

## Context

The `eval-report` branch adds a batched evaluate runner to the eval framework. It introduces
`evals/evaluate.py` as a central evaluation entry point using DeepEval's `evaluate()` function,
adds new metric types and an adaptive GEval metric, and refactors the existing test files to
use the consolidated evaluate call.

The user wants to create a PR from `eval-report` → `main`, skipping uncommitted local changes
to `evals/evaluate.py`, `docs/overview.md`, and `docs/plans/plan-restructure-evaluate-py-single-batched-evaluate-call.md`.

## PR Content

**Title**: `Feature: Add batched evaluate runner and consolidated eval entry point`

**Body** (filled PR template):

```
# Feature: Add batched evaluate runner and consolidated eval entry point

## Summary

Introduces `evals/evaluate.py` as a single batched evaluate entry point using DeepEval's
`evaluate()` function. Adds `types.py` for shared metric types, `geval_adaptive.py` for an
LLM-as-judge metric that adapts thresholds based on model, and refactors both test files to
delegate to the new evaluate runner.

## Type of change

- [x] New feature (non-breaking change that adds functionality)
- [x] Refactor (no functional changes)

## Changes made

- `evals/evaluate.py` — new batched evaluate runner using DeepEval `evaluate()`
- `evals/metrics/types.py` — shared metric type definitions
- `evals/metrics/geval_adaptive.py` — adaptive GEval metric with model-aware thresholds
- `evals/metrics/__init__.py` — expanded exports
- `evals/metrics/keywords.py`, `section_content.py`, `section_headers.py` — minor cleanups
- `evals/test_express_server.py`, `evals/test_rereadme.py` — refactored to use new evaluate runner
- `evals/golden/express-server-AGENTS.md` — new golden file for AGENTS.md eval
- `docs/plans/plan-deepeval-evaluate-runner.md` — design doc for the evaluate runner
- `package.json` — added eval script entry
- `README.md` — minor update
- `.claude/settings.json` — updated settings

## Testing

- [x] Unit tests added/updated
- [ ] Integration tests added/updated
- [x] Manual testing performed

## Checklist

- [x] Code follows project style guidelines
- [x] Self-review completed
- [x] Documentation updated (if applicable)
```

## Steps

1. Push branch to remote: `git push -u origin HEAD`
2. Create PR with `gh pr create` using the title and body above
3. Return the PR URL
