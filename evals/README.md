# rereadme Evaluation Framework

DeepEval-based evaluation for rereadme's generated README quality.

## Setup

Requires Python >= 3.11 and [uv](https://docs.astral.sh/uv/).

```bash
# From repo root
npm run setup
```

This clones the test dataset submodules and installs Python dependencies via `uv sync`.

## Running Evaluations

Run all experiments:

```bash
npm run eval
```

Run a single experiment:

```bash
npm run eval:rereadme
```

Or directly:

```bash
cd evals
uv run deepeval test run test_express_server.py -v
uv run deepeval test run test_rereadme.py -v
```

Requires `OPENAI_API_KEY` set in environment (used by both rereadme and the GEval LLM judge).

## Experiments

### express-server (`test_express_server.py`)

Runs rereadme against a Node.js/Express/MongoDB sample project. Keywords checked: `npm install`, `npm start`, `http://localhost:9000`, `Node.js`, `Express.js`, `MongoDB`.

### rereadme (`test_rereadme.py`)

Runs rereadme against its own repository (self-referencing submodule). Keywords checked: `npm install`, `npm run dev`, `OPENAI_API_KEY`, `TypeScript`, `OpenAI Agents SDK`, `markdownlint`.

### front-end (`test_front_end.py`)

Runs rereadme against an Express/Redis/Prometheus/Mocha BFF microservice (port 8079). Includes 8 standard tests plus 2 LLM-judge tests for readability and template adherence. Keywords checked: `npm install`, `npm test`, `Express`, `Redis`, `Docker`, `Prometheus`.

## Metrics

### Deterministic Metrics

| Metric | What it checks | Threshold |
|--------|---------------|-----------|
| **Section Headers** | Required markdown headers present (`## Description`, `## Getting Started`, etc.) | 1.0 |
| **Section Content** | Each required section has >= 20 chars of content | 1.0 |
| **NPM Commands** | `npm install` and `npm test` appear in output | 1.0 |

### LLM-as-Judge Metrics

| Metric | What it checks | Threshold |
|--------|---------------|-----------|
| **README Similarity** (GEval) | Semantic similarity to golden README — structure, accuracy, completeness | 0.85 |
| **Readability Judge** | Boolean PASS/FAIL — clarity, conciseness, and Markdown structure | 1.0 |
| **Template Adherence Judge** | Boolean PASS/FAIL — section coverage, alignment to template, no unfilled placeholders | 1.0 |

#### Boolean Judge Metrics

`ReadabilityJudgeMetric` and `TemplateAdherenceJudgeMetric` are `BaseMetric` subclasses in `metrics/judge.py` that call an OpenAI LLM with a fixed system prompt and parse a `verdict: PASS | FAIL` response. Score is `1.0` for PASS and `0.0` for FAIL, with a default threshold of `1.0`. The `reasoning` field is exposed for DeepEval's report output. These are applied to the front-end README in `test_front_end.py`.

## Golden README Workflow

1. **First run** — No golden file exists. The similarity test writes the generated output to `golden/express-server-README.md` and skips with a message.
2. **Review** — Inspect the golden file. If it looks good, commit it.
3. **Subsequent runs** — GEval compares generated output against the committed golden file.
4. **On failure** — Review the diff. If the new output is better, delete the golden file and re-run to regenerate. If it's a regression, investigate the pipeline.

## CI (Planned)

See `.github/workflows/eval.yml.todo` for the planned CI workflow that runs evaluations on PRs touching `script.ts`, `lib/**`, or `templates/**`.
