from __future__ import annotations

import unittest

from app.hwp_controller import HwpControllerStateError, build_controller
from app.sandbox import WorkflowRuntimeError, run_workflow
from app.validator import UnsafeCodeError, validate_python


class ValidatorTests(unittest.TestCase):
    def test_rejects_forbidden_call(self) -> None:
        code = "def run(controller):\n    eval('1+1')\n"
        with self.assertRaises(UnsafeCodeError):
            validate_python(code)

    def test_rejects_invalid_run_signature(self) -> None:
        code = "def run(controller, extra):\n    return None\n"
        with self.assertRaises(UnsafeCodeError):
            validate_python(code)


class WorkflowTests(unittest.TestCase):
    def test_collects_controller_trace(self) -> None:
        code = (
            "def run(controller):\n"
            "    controller.open_document('input.hwp')\n"
            "    controller.insert_text('hello')\n"
            "    controller.save_document('output.hwp')\n"
        )
        controller = build_controller("pyhwpx")
        result = run_workflow(code, controller, dry_run=False)
        trace = result["controller_trace"]
        self.assertEqual(trace["adapter"], "pyhwpx")
        self.assertEqual(trace["saved_documents"]["output.hwp"], "hello")
        self.assertEqual(trace["operations"], ["open:input.hwp", "insert:hello", "save:output.hwp"])

    def test_dry_run_skips_execution(self) -> None:
        code = "def run(controller):\n    controller.open_document('input.hwp')\n"
        controller = build_controller("native")
        result = run_workflow(code, controller, dry_run=True)
        self.assertTrue(result["dry_run"])
        self.assertEqual(result["controller_trace"]["operations"], [])

    def test_runtime_error_is_wrapped(self) -> None:
        code = "def run(controller):\n    raise RuntimeError('boom')\n"
        controller = build_controller("pyhwpx")
        with self.assertRaises(WorkflowRuntimeError):
            run_workflow(code, controller, dry_run=False)

    def test_controller_requires_open_document(self) -> None:
        controller = build_controller("pyhwpx")
        with self.assertRaises(HwpControllerStateError):
            controller.insert_text("hello")


if __name__ == "__main__":
    unittest.main()
