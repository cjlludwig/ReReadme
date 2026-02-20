from deepeval.metrics import BaseMetric, GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams


class AdaptiveGEvalMetric(BaseMetric):
    """GEval that reads criteria from test_case.additional_metadata['geval_criteria'].
    Passes trivially when expected_output is None (no golden yet)."""

    def __init__(self, threshold: float = 0.70, model: str = "gpt-4o-mini") -> None:
        self.threshold = threshold
        self._model = model
        self.score = 0.0
        self.success = False
        self.reason = ""
        self.error = None

    def measure(self, test_case: LLMTestCase) -> float:
        metadata = test_case.additional_metadata or {}
        criteria = metadata.get("geval_criteria")

        if criteria is None or test_case.expected_output is None:
            self.score = 1.0
            self.success = True
            self.reason = "Skipped: no golden or no criteria."
            return self.score

        geval = GEval(
            name="Similarity",
            criteria=criteria,
            evaluation_params=[
                LLMTestCaseParams.ACTUAL_OUTPUT,
                LLMTestCaseParams.EXPECTED_OUTPUT,
            ],
            threshold=self.threshold,
            model=self._model,
            async_mode=False,
        )
        self.score = geval.measure(test_case)
        self.success = geval.is_successful()
        self.reason = geval.reason or ""
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return bool(self.success) if self.error is None else False

    @property
    def __name__(self) -> str:
        return "Adaptive GEval"
