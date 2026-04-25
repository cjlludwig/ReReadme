import re

from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase


class ArchitectureDiagramMetric(BaseMetric):
    """Checks README architecture diagrams for concise, readable Mermaid flowcharts."""

    def __init__(self, threshold: float = 1.0):
        self.threshold = threshold
        self.score = 0.0
        self.success = False
        self.reason = ""
        self.error = None

    def measure(self, test_case: LLMTestCase) -> float:
        try:
            assert test_case.actual_output is not None
            content = test_case.actual_output
            failures: list[str] = []

            section_match = re.search(
                r"^## Architecture\s*(.*?)(?=^## |\Z)",
                content,
                re.MULTILINE | re.DOTALL,
            )
            if not section_match:
                failures.append("missing Architecture section")
                return self._finish(failures)

            mermaid_blocks = re.findall(
                r"```mermaid\s*\n(.*?)```",
                section_match.group(1),
                re.DOTALL | re.IGNORECASE,
            )
            if len(mermaid_blocks) != 1:
                failures.append(f"expected exactly one Mermaid block, found {len(mermaid_blocks)}")
                return self._finish(failures)

            diagram = mermaid_blocks[0]
            if not re.search(r"^\s*flowchart\s+LR\s*$", diagram, re.MULTILINE):
                failures.append("diagram must use flowchart LR")
            if re.search(r"^\s*graph\s+TD\s*$", diagram, re.MULTILINE):
                failures.append("diagram uses graph TD")
            if "classDef" not in diagram:
                failures.append("diagram missing classDef styling")
            for class_name in ["caller", "app", "external", "storage", "observability"]:
                if not re.search(rf"^\s*classDef\s+{class_name}\b", diagram, re.MULTILINE):
                    failures.append(f"diagram missing {class_name} layer style")
            fills = set(re.findall(r"classDef\s+\w+\s+[^\n]*fill:(#[0-9a-fA-F]{6})", diagram))
            if len(fills) < 4:
                failures.append("diagram needs more layer color contrast")
            if not re.search(r"-->|---|\.-\.|==>", diagram):
                failures.append("diagram has no edges")

            edge_count = len(re.findall(r"(-->|---|\.-\.|==>)", diagram))
            if edge_count > 10:
                failures.append(f"too many edges: {edge_count}")

            node_ids = self._node_ids(diagram)
            if len(node_ids) > 8:
                failures.append(f"too many visible nodes: {len(node_ids)}")
            if len(node_ids) < 3:
                failures.append(f"too few visible nodes: {len(node_ids)}")
            if not re.search(r"(\[\(|\[\[|\(\(|\{\{|\{[^}\n]+\}|\[/|@{ *shape:)", diagram):
                failures.append("diagram should use node shapes to distinguish system types")

            unlabeled_edges = [
                line.strip()
                for line in diagram.splitlines()
                if re.search(r"(-->|---|\.-\.|==>)", line) and "|" not in line
            ]
            if unlabeled_edges:
                failures.append("edges must be labeled")

            if re.search(r"\b(function|class|module|file|src/|lib/|controllers?/|services?/|dao)\b", diagram, re.IGNORECASE):
                failures.append("diagram appears to include implementation-detail nodes")

            return self._finish(failures)
        except Exception as e:
            self.error = str(e)
            raise

    def _finish(self, failures: list[str]) -> float:
        self.success = not failures
        self.score = 1.0 if self.success else 0.0
        self.reason = "Architecture diagram is concise and readable." if self.success else "; ".join(failures)
        return 1.0 if self.success else 0.0

    def _node_ids(self, diagram: str) -> set[str]:
        node_ids: set[str] = set()
        skip_prefixes = ("flowchart", "graph", "classDef", "class ", "linkStyle", "style ", "subgraph", "end", "%%")
        for raw_line in diagram.splitlines():
            line = raw_line.strip()
            if not line or line.startswith(skip_prefixes):
                continue
            if re.search(r"(-->|---|\.-\.|==>)", line):
                parts = re.split(r"-->|---|\.-\.|==>", line)
                for part in parts:
                    part = re.sub(r"^\s*\|[^|]*\|", "", part)
                    match = re.match(r"\s*([A-Za-z][A-Za-z0-9_]*)", part)
                    if match:
                        node_ids.add(match.group(1))
                continue
            match = re.match(r"([A-Za-z][A-Za-z0-9_]*)\s*(\[|\(|@)", line)
            if match:
                node_ids.add(match.group(1))
        return node_ids

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        if self.error is not None:
            return False
        return bool(self.success)

    @property
    def __name__(self) -> str:
        return "Architecture Diagram"
