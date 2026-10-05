#!/usr/bin/env python3
"""
Shared helpers for the preview UI-review scripts.

Kept dependency-free (stdlib + playwright) so the scripts can run from a plain
checkout. Two environment variables override the defaults:

    GDCMAS_BASE_URL   app to review          (default http://localhost:3000)
    GDCMAS_SHOTS_DIR  where images are read/written
"""

import os
import pathlib

REPO = pathlib.Path(__file__).resolve().parents[2]
BASE = os.environ.get("GDCMAS_BASE_URL", "http://localhost:3000").rstrip("/")
SHOTS = pathlib.Path(
    os.environ.get("GDCMAS_SHOTS_DIR", REPO / ".ui-review")
)


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
