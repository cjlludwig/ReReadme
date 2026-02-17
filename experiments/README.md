# rereadme Evaluation Framework

DeepEval-based evaluation for rereadme's generated README quality.

## Setup

Requires Python >= 3.11 and [uv](https://docs.astral.sh/uv/).

```bash
# From repo root
npm run setup
```

This clones the test dataset submodule and installs Python dependencies via `uv sync`.

## Running Evaluations

```bash
npm run eval
```

Or directly:

```bash
cd experiments
uv run deepeval test run test_express_server.py -v
```

Requires `OPENAI_API_KEY` set in environment (used by both rereadme and the GEval LLM judge).

## Metrics

### Deterministic Metrics

| Metric | What it checks | Threshold |
|--------|---------------|-----------|
| **Section Headers** | Required markdown headers present (`## Description`, `## Getting Started`, etc.) | 1.0 |
| **Section Content** | Each required section has >= 20 chars of content | 1.0 |
| **NPM Commands** | `npm install` and `npm test` appear in output | 1.0 |

### LLM-as-Judge Metric

| Metric | What it checks | Threshold |
|--------|---------------|-----------|
| **README Similarity** (GEval) | Semantic similarity to golden README — structure, accuracy, completeness | 0.85 |

## Golden README Workflow

1. **First run** — No golden file exists. The similarity test writes the generated output to `golden/express-server-README.md` and skips with a message.
2. **Review** — Inspect the golden file. If it looks good, commit it.
3. **Subsequent runs** — GEval compares generated output against the committed golden file.
4. **On failure** — Review the diff. If the new output is better, delete the golden file and re-run to regenerate. If it's a regression, investigate the pipeline.

## CI (Planned)

See `.github/workflows/eval.yml.todo` for the planned CI workflow that runs evaluations on PRs touching `script.ts`, `lib/**`, or `templates/**`.
