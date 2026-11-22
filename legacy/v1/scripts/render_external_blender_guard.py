#!/usr/bin/env python3
"""Sampled Linux /proc process-tree RSS guard for the optional Blender adapter.

This is a bounded *watchdog*, not a kernel-enforced memory allocation limit.
The OS may overshoot between samples. On non-Linux platforms execution remains
diagnostic-only and resource enforcement is explicitly reported unavailable.
"""
from __future__ import annotations

import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace


def _tree_rss_kib(pid: int) -> int:
    """Resident bytes of Blender and every live /proc-listed child, in KiB."""
    seen = set()
    pending = [pid]
    total = 0
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        root = Path("/proc") / str(current)
        try:
            status = (root / "status").read_text()
            children = (root / "task" / str(current) / "children").read_text()
        except FileNotFoundError:
            # Process exited between inspection and read.
            continue
        except OSError as error:
            raise RuntimeError("R14E_BACKEND_RESOURCE: cannot inspect child process RSS") from error
        for line in status.splitlines():
            if line.startswith("VmRSS:"):
                total += int(line.split()[1])
                break
        pending.extend(int(value) for value in children.split())
    return total


def _stop_process_tree(proc):
    if proc.poll() is not None:
        return
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            proc.kill()
    except ProcessLookupError:
        pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


def run_guarded(cmd, *, env, timeout_seconds, max_working_mib, poll_seconds=0.1):
    """Run Blender with subprocess termination on sampled RSS/time budget.

    No shell, detached process tree, or unbounded captured in-memory stdout.
    """
    if timeout_seconds <= 0 or not 0.01 <= poll_seconds <= 1:
        raise ValueError("R14E_UNSUPPORTED: invalid watchdog time budget")
    if max_working_mib <= 0:
        raise ValueError("R14E_UNSUPPORTED: invalid RSS budget")
    limit_kib = int(max_working_mib * 1024)
    linux = sys.platform.startswith("linux") and Path("/proc/self/status").is_file()
    with tempfile.TemporaryFile(mode="w+t", encoding="utf8", errors="replace") as stdout:
        with tempfile.TemporaryFile(mode="w+t", encoding="utf8", errors="replace") as stderr:
            proc = subprocess.Popen(cmd, stdout=stdout, stderr=stderr,
                                    env=env, start_new_session=(os.name == "posix"))
            peak = 0
            started = time.monotonic()
            try:
                while True:
                    if linux:
                        current = _tree_rss_kib(proc.pid)
                        peak = max(peak, current)
                        if current > limit_kib:
                            raise RuntimeError(
                                "R14E_BACKEND_RESOURCE: sampled Blender process-tree RSS "
                                f"{current} KiB exceeds {limit_kib} KiB budget")
                    status = proc.poll()
                    if status is not None:
                        break
                    if time.monotonic() - started > timeout_seconds:
                        raise RuntimeError("R14E_BACKEND_TIMEOUT: Blender exceeded budget")
                    time.sleep(poll_seconds)
                stdout.seek(0)
                stderr.seek(0)
                # Logs are diagnostic only; refuse huge output rather than allocating it.
                if stdout.seek(0, 2) > 4*1024*1024 or stderr.seek(0, 2) > 4*1024*1024:
                    raise RuntimeError("R14E_BACKEND_RESOURCE: subprocess log budget exceeded")
                stdout.seek(0)
                stderr.seek(0)
                return SimpleNamespace(
                    returncode=status, stdout=stdout.read(), stderr=stderr.read(),
                    peak_tree_rss_kib=peak if linux else None,
                    watchdog=("linux-procfs-tree-sampled" if linux else "unavailable-platform"),
                    hard_memory_limit=False)
            except BaseException:
                _stop_process_tree(proc)
                raise
