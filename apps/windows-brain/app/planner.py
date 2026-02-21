from __future__ import annotations

from dataclasses import dataclass

from .nlu import NLUResult


@dataclass
class Plan:
    title: str
    steps: list[str]
    directives: list[dict[str, str]]


class AgentPlanner:
    def build_plan(self, nlu: NLUResult) -> Plan:
        base_steps = [
            "Open source HWP document",
            "Create and use a derived copy as working target",
            "Apply deterministic edit steps on the copy only",
            "Save result document and return output path",
        ]
        directives: list[dict[str, str]] = [
            {"op": "emit_python_program", "value": "true"},
            {"op": "preserve_original", "value": "true"},
            {"op": "use_copy_output", "value": "true"},
            {"op": "output_path", "value": "output_copy.hwp"},
        ]

        for action in nlu.actions:
            action_type = action.get("type", "")
            if action_type == "replace_text" and action.get("from") and action.get("to"):
                directives.append(
                    {
                        "op": "replace_text",
                        "from": action["from"],
                        "to": action["to"],
                        "scope": nlu.entities.get("target_scope", "all"),
                    }
                )
            elif action_type == "set_bold":
                directives.append(
                    {"op": "set_bold", "value": action.get("value", "true"), "scope": nlu.entities.get("target_scope", "all")}
                )
            elif action_type == "set_font_size":
                directives.append(
                    {"op": "set_font_size", "value": action.get("value", "11"), "scope": nlu.entities.get("target_scope", "all")}
                )
            elif action_type == "set_font_family":
                directives.append(
                    {"op": "set_font_family", "value": action.get("value", "Malgun Gothic"), "scope": nlu.entities.get("target_scope", "all")}
                )

        if nlu.intent == "apply_template":
            steps = ["Load template rules", *base_steps]
            title = "Template Automation"
        elif nlu.intent == "edit_table":
            steps = ["Find table range", "Apply table updates", *base_steps]
            title = "Table Automation"
        elif nlu.intent == "review_document":
            steps = ["Scan sections", "Insert review marks", *base_steps]
            title = "Review Automation"
        elif nlu.intent == "style_update":
            steps = ["Detect style target range", "Apply style directives", *base_steps]
            title = "Style Automation"
        elif nlu.intent == "text_replace":
            steps = ["Find text range", "Replace text by directive", *base_steps]
            title = "Text Replace Automation"
        else:
            steps = base_steps
            title = "General HWP Automation"
        return Plan(title=title, steps=steps, directives=directives)
