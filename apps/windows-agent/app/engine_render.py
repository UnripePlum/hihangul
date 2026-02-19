from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from threading import Lock

logger = logging.getLogger("windows-agent.engine-render")


def _ensure_win32() -> tuple[object, object]:
    try:
        import pythoncom  # type: ignore
        import win32com.client  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("pywin32 is not installed or unavailable on this platform") from exc
    return pythoncom, win32com.client


class HwpEngineSession:
    def __init__(self) -> None:
        self._lock = Lock()
        self._pythoncom = None
        self._client = None
        self._hwp = None
        self._initialized = False

    def start(self) -> None:
        with self._lock:
            if self._initialized:
                return
            pythoncom, win32_client = _ensure_win32()
            pythoncom.CoInitialize()
            try:
                hwp = win32_client.gencache.EnsureDispatch("HWPFrame.HwpObject")
                try:
                    hwp.XHwpWindows.Item(0).Visible = False
                except Exception:
                    pass
                try:
                    hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
                except Exception:
                    pass
            except Exception:
                pythoncom.CoUninitialize()
                raise

            self._pythoncom = pythoncom
            self._client = win32_client
            self._hwp = hwp
            self._initialized = True
            logger.info("HWP engine warmup complete")

    def stop(self) -> None:
        with self._lock:
            if not self._initialized:
                return
            try:
                if self._hwp is not None:
                    try:
                        self._hwp.Clear(3)
                    except Exception:
                        pass
                    self._hwp.Quit()
            except Exception:
                logger.exception("HWP engine shutdown failure")
            finally:
                if self._pythoncom is not None:
                    self._pythoncom.CoUninitialize()
            self._hwp = None
            self._client = None
            self._pythoncom = None
            self._initialized = False

    def _require_started(self) -> None:
        if not self._initialized or self._hwp is None:
            self.start()

    def render_pdf(self, file_name: str, file_bytes: bytes) -> bytes:
        if not file_name:
            raise ValueError("file_name is required")
        if not file_bytes:
            raise ValueError("file is empty")
        ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
        if ext not in {"hwp", "hwpx"}:
            raise ValueError("only .hwp and .hwpx are supported")

        with self._lock:
            self._require_started()
            with tempfile.TemporaryDirectory(prefix="hihangul_render_") as tmp:
                in_path = Path(tmp) / f"input.{ext}"
                out_path = Path(tmp) / "output.pdf"
                in_path.write_bytes(file_bytes)

                try:
                    opened = self._hwp.Open(str(in_path))
                    if not opened:
                        raise RuntimeError("failed to open document in HWP engine")
                    saved = self._hwp.SaveAs(str(out_path), "PDF", "lock:false")
                    if not saved or not out_path.exists():
                        raise RuntimeError("failed to save PDF via HWP engine")
                    return out_path.read_bytes()
                finally:
                    try:
                        self._hwp.Clear(3)
                    except Exception:
                        pass


_session = HwpEngineSession()


def warmup_hwp_engine() -> None:
    _session.start()


def shutdown_hwp_engine() -> None:
    _session.stop()


def render_to_pdf_via_hwp_engine(file_name: str, file_bytes: bytes) -> bytes:
    return _session.render_pdf(file_name=file_name, file_bytes=file_bytes)
