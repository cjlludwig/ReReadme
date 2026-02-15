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

MIN_CONTENT_LENGTH = 20


class SectionContentMetric(BaseMetric):
    """Checks that each required section has non-empty content (>= 20 chars)."""

    def __init__(self, threshold: float = 1.0):
        self.threshold = threshold
        self.score = 0.0
        self.success = False
        self.reason = ""
        self.error = None

    def measure(self, test_case: LLMTestCase) -> float:
        try:
            content = test_case.actual_output
            sections_with_content = []
            empty_sections = []

            for section in REQUIRED_SECTIONS:
                section_content = self._extract_section_content(content, section)
                if section_content and len(section_content.strip()) >= MIN_CONTENT_LENGTH:
                    sections_with_content.append(section)
                else:
                    empty_sections.append(section)

            self.score = len(sections_with_content) / len(REQUIRED_SECTIONS)
            self.success = self.score >= self.threshold

            if empty_sections:
                self.reason = f"Sections with insufficient content: {', '.join(empty_sections)}"
            else:
                self.reason = "All required sections have sufficient content."

            return self.score
        except Exception as e:
            self.error = str(e)
            raise

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        if self.error is not None:
            self.success = False
        return self.success

    @property
    def __name__(self):
        return "Section Content"

    @staticmethod
    def _extract_section_content(content: str, header: str) -> str:
        """Extract content between a header and the next header of same or higher level."""
        level = len(header) - len(header.lstrip("#"))
        pattern = rf"^{re.escape(header)}\s*$"
        match = re.search(pattern, content, re.MULTILINE | re.IGNORECASE)
        if not match:
            return ""

        start = match.end()
        # Find next header of same or higher level
        next_header = re.search(
            rf"^#{{{1},{level}}}\s+\S",
            content[start:],
            re.MULTILINE,
        )
        if next_header:
            return content[start : start + next_header.start()]
        return content[start:]
