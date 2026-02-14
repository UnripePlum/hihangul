from __future__ import annotations

from dataclasses import dataclass

from .nlu import NLUResult


@dataclass
class Plan:
    title: str
    steps: list[str]


class AgentPlanner:
    def build_plan(self, nlu: NLUResult) -> Plan:
        base_steps = [
            "Open input HWP document",
            "Apply deterministic edit steps",
            "Save output document",
        ]
        if nlu.intent == "apply_template":
            steps = ["Load template rules", *base_steps]
            title = "Template Automation"
        elif nlu.intent == "edit_table":
            steps = ["Find table range", "Apply table updates", *base_steps]
            title = "Table Automation"
        elif nlu.intent == "review_document":
            steps = ["Scan sections", "Insert review marks", *base_steps]
            title = "Review Automation"
        else:
            steps = base_steps
            title = "General HWP Automation"
        return Plan(title=title, steps=steps)
