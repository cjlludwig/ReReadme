# Plan: front-end microservice eval + boolean judge metrics

## Context

The user wants to:
1. Add the existing `evals/datasets/front-end` microservice as a new rereadme eval dataset, following the same pattern as `test_express_server.py`
2. Include it in the standalone `evaluate.py` runner
3. Implement the two judge prompts in `evals/metrics/judge.py` as actual DeepEval `BaseMetric` subclasses with boolean PASS/FAIL output and separate reasoning (not GEval 0–1 scores)

---

## Files to Modify / Create

| File | Action |
|------|--------|
| `evals/metrics/judge.py` | Transform stub into real metric module |
| `evals/metrics/types.py` | Add `FRONT_END_README_KEYWORDS`, `FRONT_END_AGENTS_KEYWORDS` |
| `evals/metrics/__init__.py` | Export new classes and constants |
| `evals/conftest.py` | Add front-end fixtures |
| `evals/test_front_end.py` | **Create** — 10 tests (8 standard + 2 new judge tests) |
| `evals/evaluate.py` | Add 2 front-end `EvalUnit`s and golden path constants |
| `package.json` | Add front-end to `setup` submodule command; add `test_front_end.py` to `eval`; add `eval:front-end` script |
| `evals/README.md` | Document new experiment and new judge metrics |

---

## Step 1 — `evals/metrics/judge.py`: Boolean judge metrics

The file currently contains two bare string literals as placeholder prompts. Extract them as named constants and implement `BooleanJudgeMetric` (base), `ReadabilityJudgeMetric`, and `TemplateAdherenceJudgeMetric`.

Implementation pattern (mirrors `AdaptiveGEvalMetric`):
- Subclass `deepeval.metrics.BaseMetric`
- `measure()` calls `openai.OpenAI()` with the prompt as the system message and `test_case.actual_output` as the user message
- Parse `verdict: PASS | FAIL` and `reasoning: ...` from the response with regex
- Score: `1.0` = PASS, `0.0` = FAIL; threshold defaults to `1.0`
- Expose `reason` attribute for DeepEval's report output

```python
READABILITY_SYSTEM_PROMPT = """You are an LLM judge ..."""   # exact text from current file
TEMPLATE_ADHERENCE_SYSTEM_PROMPT = """You are an LLM judge ..."""  # exact text from current file

class BooleanJudgeMetric(BaseMetric):  # abstract base
    _system_prompt: str  # set by subclass

    def measure(self, test_case: LLMTestCase) -> float:
        # call OpenAI, parse verdict/reasoning, set self.score / self.success / self.reason

class ReadabilityJudgeMetric(BooleanJudgeMetric):
    _system_prompt = READABILITY_SYSTEM_PROMPT
    __name__ = "Readability Judge"

class TemplateAdherenceJudgeMetric(BooleanJudgeMetric):
    _system_prompt = TEMPLATE_ADHERENCE_SYSTEM_PROMPT
    __name__ = "Template Adherence Judge"
```

Model default: `GEVAL_MODEL` from `types.py` (`"gpt-5-mini"`).

---

## Step 2 — `evals/metrics/types.py`: Front-end keywords

Front-end dataset is an Express/Redis/Prometheus/Mocha BFF microservice on port 8079.

```python
FRONT_END_README_KEYWORDS = [
    "npm install",
    "npm test",
    "Express",
    "Redis",
    "Docker",
    "Prometheus",
]

FRONT_END_AGENTS_KEYWORDS = [
    "npm test",
    "npm start",
    "server.js",
    "api/",
]
```

---

## Step 3 — `evals/metrics/__init__.py`: Export additions

Add to imports and `__all__`:
- `ReadabilityJudgeMetric`, `TemplateAdherenceJudgeMetric` from `.judge`
- `FRONT_END_README_KEYWORDS`, `FRONT_END_AGENTS_KEYWORDS` from `.types`

---

## Step 4 — `evals/conftest.py`: Front-end fixtures

Follow the exact pattern of `_express_server_run` / `golden_readme` / etc.

Add:
- `FRONT_END_DATASET_DIR = os.path.join(REPO_ROOT, "evals/datasets", "front-end")`
- `FRONT_END_README_GOLDEN_PATH`, `FRONT_END_AGENTS_GOLDEN_PATH`
- `_front_end_run()` session fixture — runs `npx tsx script.ts --output README-generated.md --agents --agents-output AGENTS-generated.md --no-backup` in front-end dir, backs up to `results/` with `front-end-<timestamp>.md` prefix
- `generated_readme_front_end()`, `generated_agents_front_end()`
- `golden_readme_front_end()`, `golden_agents_front_end()`

---

## Step 5 — `evals/test_front_end.py`: New test file (create)

10 tests total — the standard 8 (matching `test_express_server.py`) plus 2 new judge tests applied to the README:

Standard 8 (identical pattern, swapping fixtures/keywords/golden paths):
1. `test_section_headers` — `SectionHeadersMetric(threshold=1.0)`
2. `test_section_content` — `SectionContentMetric(threshold=1.0)`
3. `test_keywords` — `KeywordsMetric(..., keywords=FRONT_END_README_KEYWORDS)`
4. `test_golden_readme_similarity` — `GEval` + golden workflow
5. `test_agents_section_headers` — `SectionHeadersMetric(..., sections=AGENTS_SECTIONS)`
6. `test_agents_section_content` — `SectionContentMetric(..., sections=AGENTS_SECTIONS)`
7. `test_agents_keywords` — `KeywordsMetric(..., keywords=FRONT_END_AGENTS_KEYWORDS)`
8. `test_agents_golden_similarity` — `GEval` + golden workflow

New judge tests (README only, where the judge prompts are most applicable):
9. `test_readme_readability` — `ReadabilityJudgeMetric()` on `generated_readme_front_end`
10. `test_readme_template_adherence` — `TemplateAdherenceJudgeMetric()` on `generated_readme_front_end`

---

## Step 6 — `evals/evaluate.py`: Add front-end units

Add golden path constants:
```python
FRONT_END_README_GOLDEN = os.path.join(GOLDEN_DIR, "front-end-README.md")
FRONT_END_AGENTS_GOLDEN = os.path.join(GOLDEN_DIR, "front-end-AGENTS.md")
```

Phase 1: call `run_rereadme("front-end")` → `front_end_readme, front_end_agents`

Add to `dataset_outputs` dict:
```python
("front-end", "readme"): front_end_readme,
("front-end", "agents"): front_end_agents,
```

Add 2 `EvalUnit`s:
```python
EvalUnit(
    label="front-end / README",
    dataset_name="front-end",
    output_type="readme",
    input_prompt="Generate a README for front-end",
    golden_path=FRONT_END_README_GOLDEN,
    keywords=FRONT_END_README_KEYWORDS,
    sections=None,
),
EvalUnit(
    label="front-end / AGENTS.md",
    dataset_name="front-end",
    output_type="agents",
    input_prompt="Generate an AGENTS.md for front-end",
    golden_path=FRONT_END_AGENTS_GOLDEN,
    keywords=FRONT_END_AGENTS_KEYWORDS,
    sections=AGENTS_SECTIONS,
),
```

---

## Step 7 — `package.json`: Script updates

- `setup`: append `evals/datasets/front-end` to the `git submodule update --init` command
- `eval`: append `test_front_end.py` to the deepeval test run list
- Add `"eval:front-end": "cd evals && NO_COLOR=1 uv run deepeval test run test_front_end.py -v"`

---

## Step 8 — `evals/README.md`: Documentation updates

- Add `front-end` entry under **Experiments** section
- Add **Boolean Judge Metrics** subsection under **Metrics**, documenting `ReadabilityJudgeMetric` and `TemplateAdherenceJudgeMetric`

---

## Verification

1. `npm run setup` — confirms front-end submodule initialises without errors
2. `cd evals && uv run deepeval test run test_front_end.py -v` — confirms 10 tests run
3. First run: golden tests skip and write `golden/front-end-README.md` + `golden/front-end-AGENTS.md`
4. `uv run python evaluate.py` — confirms 6 units run (express-server + rereadme + front-end, each README + AGENTS)
5. `make check` — TypeScript lint + Python lint (ruff/mypy) pass
