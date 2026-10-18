#!/usr/bin/env python3
"""
Shared helpers for the preview UI-review scripts.

Kept dependency-free (stdlib + playwright) so the scripts can run from a plain
checkout. Two environment variables override the defaults:

    GDCMAS_BASE_URL   app to review          (default http://localhost:3000)
    GDCMAS_SHOTS_DIR  where images are read/written
"""

import datetime
import os
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parents[2]
BASE = os.environ.get("GDCMAS_BASE_URL", "http://localhost:3000").rstrip("/")
SHOTS = pathlib.Path(
    os.environ.get("GDCMAS_SHOTS_DIR", REPO / ".ui-review")
)


def clinic_today() -> str:
    """The clinic-local date that preview fixtures are anchored to.

    Read from lib/preview/clock.ts rather than hardcoded, so the capture,
    audit and video scripts always point at the day the fixtures populated —
    navigating to any other date shows an empty slot grid. Asia/Manila is a
    fixed UTC+8 (CLINIC_UTC_OFFSET_MINUTES in lib/clinical/schedule.ts).
    """
    src = (REPO / "lib" / "preview" / "clock.ts").read_text()
    m = re.search(r'PREVIEW_ANCHOR_ISO = "([^"]+)"', src)
    if not m:
        raise RuntimeError("PREVIEW_ANCHOR_ISO not found in lib/preview/clock.ts")
    anchor = datetime.datetime.fromisoformat(m.group(1).replace("Z", "+00:00"))
    manila = datetime.timezone(datetime.timedelta(hours=8))
    return anchor.astimezone(manila).date().isoformat()


def launch(p):
    """Launch Chromium, tolerating a system install or a pinned download.

    Playwright resolves its own browser normally; GDCMAS_CHROME overrides that
    for environments where the browser lives outside the default cache.
    """
    override = os.environ.get("GDCMAS_CHROME")
    args = ["--no-sandbox"] if os.geteuid() == 0 else []
    if override:
        return p.chromium.launch(executable_path=override, args=args)
    try:
        return p.chromium.launch(args=args)
    except Exception:
        # Fall back to any Chromium already downloaded into the cache.
        cache = pathlib.Path.home() / ".cache/ms-playwright"
        for build in sorted(cache.glob("chromium-*/chrome-linux64/chrome")):
            return p.chromium.launch(executable_path=str(build), args=args)
        raise
