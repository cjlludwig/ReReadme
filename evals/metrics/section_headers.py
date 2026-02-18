import re
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

REQUIRED_SECTIONS = [
    "## Description",
    "## Getting Started",
    "### Dependencies",
    "### Installation",
    "## Usage",
]


class SectionHeadersMetric(BaseMetric):
    """Checks that all required markdown section headers are present."""

    def __init__(self, threshold: float = 1.0, sections: list[str] | None = None):
        self.threshold = threshold
        self.sections = sections if sections is not None else REQUIRED_SECTIONS
        self.score = 0.0
        self.success = False
        self.reason = ""
        self.error = None

    def measure(self, test_case: LLMTestCase) -> float:
        try:
            assert test_case.actual_output is not None
            content = test_case.actual_output
            found = []
            missing = []

            for header in self.sections:
                pattern = rf"^{re.escape(header)}\s*$"
                if re.search(pattern, content, re.MULTILINE | re.IGNORECASE):
                    found.append(header)
                else:
                    missing.append(header)

            self.score = len(found) / len(self.sections)
            self.success = self.score >= self.threshold

            if missing:
                # Extract actual headers from the content for debugging
                actual_headers = re.findall(r"^#{1,3}\s+.+$", content, re.MULTILINE)
                self.reason = f"Missing headers: {', '.join(missing)}. Found: {', '.join(actual_headers)}"
            else:
                self.reason = "All required headers present."

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
        return "Section Headers"
