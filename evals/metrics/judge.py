import os
import re

import openai
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

from .types import GEVAL_MODEL

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_TEMPLATE_PATH = os.path.join(_REPO_ROOT, "templates", "README_TEMPLATE.md")

READABILITY_SYSTEM_PROMPT = """You are an LLM judge evaluating a generated README for readability.

Criteria:
- Clarity: Would an external developer with no prior context understand the project's purpose?
- Conciseness: Is information presented without excessive repetition or padding?
- Structure: Are sections logically ordered with consistent Markdown formatting (headings, code blocks, lists)?

Verdict: PASS if all criteria are met. FAIL if any criterion has a significant deficiency.

Response format:
verdict: PASS | FAIL
reasoning: <one sentence per failed criterion, or a single confirmation if all passed>"""

TEMPLATE_ADHERENCE_SYSTEM_PROMPT = """You are an LLM judge evaluating a generated README for adherence to a source Markdown template.

Criteria:
- Coverage: Does the README contain all sections requested in the template?
- Alignment: Does the README follow the content descriptions and formatting of the template?
- Completeness: Is content appropriately filled out, with no unfilled placeholders, leftover comments, or obvious contradictions? Ex: `> Section description`, `<!-- EXAMPLE`

Verdict: PASS if all criteria are met. FAIL if any criterion has a significant deficiency.

Response format:
verdict: PASS | FAIL
reasoning: <one sentence per failed criterion, or a single confirmation if all passed>"""


class BooleanJudgeMetric(BaseMetric):
    _system_prompt: str

    def __init__(self, threshold: float = 1.0, model: str = GEVAL_MODEL) -> None:
        self.threshold = threshold
        self._model = model
        self.score = 0.0
        self.success = False
        self.reason = ""
        self.error = None

    def _build_user_message(self, test_case: LLMTestCase) -> str:
        return test_case.actual_output or ""

    def measure(self, test_case: LLMTestCase) -> float:
        client = openai.OpenAI()
        messages: list[openai.types.chat.ChatCompletionMessageParam] = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": self._build_user_message(test_case)},
        ]
        response = client.chat.completions.create(
            model=self._model,
            messages=messages,
        )
        text = response.choices[0].message.content or ""
        verdict_match = re.search(r"verdict:\s*(PASS|FAIL)", text, re.IGNORECASE)
        reasoning_match = re.search(r"reasoning:\s*(.+)", text, re.IGNORECASE | re.DOTALL)

        verdict = verdict_match.group(1).upper() if verdict_match else "FAIL"
        self.reason = reasoning_match.group(1).strip() if reasoning_match else text.strip()
        self.score = 1.0 if verdict == "PASS" else 0.0
        self.success = verdict == "PASS"
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return bool(self.success) if self.error is None else False


GOLDEN_ALIGNMENT_SYSTEM_PROMPT = """You are an LLM judge comparing a generated README to a reference golden README.

Criteria:
- Core coverage: Does the generated README address the same key topics as the golden (purpose, setup, usage, commands)?
- Technical accuracy: Are technical details (commands, ports, dependencies) substantially correct?

Be lenient: differences in wording, section order, additional context, or formatting are fine.
PASS if the content is substantially similar and covers the core details.
FAIL only if significant required sections are missing or key technical facts are wrong.

Response format:
verdict: PASS | FAIL
reasoning: <one sentence explanation>"""


class GoldenAlignmentJudgeMetric(BooleanJudgeMetric):
    _system_prompt = GOLDEN_ALIGNMENT_SYSTEM_PROMPT

    def measure(self, test_case: LLMTestCase) -> float:
        if not test_case.expected_output:
            self.score = 1.0
            self.success = True
            self.reason = "Skipped: no golden file yet."
            return self.score
        return super().measure(test_case)

    def _build_user_message(self, test_case: LLMTestCase) -> str:
        return (
            f"Golden README:\n{test_case.expected_output or ''}\n\n"
            f"Generated README:\n{test_case.actual_output or ''}"
        )

    @property
    def __name__(self) -> str:
        return "Golden Alignment Judge"


class ReadabilityJudgeMetric(BooleanJudgeMetric):
    _system_prompt = READABILITY_SYSTEM_PROMPT

    @property
    def __name__(self) -> str:
        return "Readability Judge"


class TemplateAdherenceJudgeMetric(BooleanJudgeMetric):
    _system_prompt = TEMPLATE_ADHERENCE_SYSTEM_PROMPT

    def __init__(
        self,
        template_path: str = DEFAULT_TEMPLATE_PATH,
        threshold: float = 1.0,
        model: str = GEVAL_MODEL,
    ) -> None:
        super().__init__(threshold=threshold, model=model)
        self._template_path = template_path

    def _build_user_message(self, test_case: LLMTestCase) -> str:
        template_content = ""
        if os.path.exists(self._template_path):
            with open(self._template_path) as f:
                template_content = f.read()
        return (
            f"Template:\n{template_content}\n\n"
            f"Generated README:\n{test_case.actual_output or ''}"
        )

    @property
    def __name__(self) -> str:
        return "Template Adherence Judge"
