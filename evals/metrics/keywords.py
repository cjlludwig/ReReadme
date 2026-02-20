from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

from .types import EXPRESS_README_KEYWORDS


class KeywordsMetric(BaseMetric):
    """Checks that expected keywords are present in the README output."""

    def __init__(self, threshold: float = 1.0, keywords: list[str] | None = None):
        self.threshold = threshold
        self.keywords = keywords if keywords is not None else EXPRESS_README_KEYWORDS
        self.score = 0.0
        self.success = False
        self.reason = ""
        self.error = None

    def measure(self, test_case: LLMTestCase) -> float:
        try:
            assert test_case.actual_output is not None
            keywords = (test_case.additional_metadata or {}).get("keywords") or self.keywords
            content = test_case.actual_output.lower()
            found = []
            missing = []

            for cmd in keywords:
                if cmd.lower() in content:
                    found.append(cmd)
                else:
                    missing.append(cmd)

            self.score = len(found) / len(keywords)
            self.success = self.score >= self.threshold

            if missing:
                self.reason = f"Missing commands: {', '.join(missing)}"
            else:
                self.reason = "All required keywords present."

            return self.score
        except Exception as e:
            self.error = str(e)
            raise

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        if self.error is not None:
            return False
        return bool(self.success)

    @property
    def __name__(self):
        return "Keywords"
