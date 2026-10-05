#!/usr/bin/env python3
"""Record a narrated-by-caption walkthrough of the clinic UI.

Playwright records silent video, so each step injects a caption overlay into the
page before it waits. The result is a video a colleague can watch without anyone
having to narrate it live.

Preview mode is required: writes are rejected, so the appointment status click
moves the row visually and nothing is persisted.
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import launch  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = os.environ.get("GDCMAS_BASE_URL", "http://localhost:3000").rstrip("/")
VERIFY = "--verify" in sys.argv

# Human label the app renders for each preview role, used to assert the file is
# named for the role actually on screen.
ROLE_LABEL = {"admin": "Administrator", "dentist": "Dentist", "secretary": "Secretary"}


def preview_role() -> str:
    """Role the dev server is previewing.

    Must read .env.local, not just os.environ: Next loads that file into its own
    process, so a shell that never exported the variable still had the app
    previewing as secretary. Keying the output filename off os.environ alone
    wrote the secretary recording over the dentist one.
    """
    raw = os.environ.get("GDCMAS_PREVIEW_ROLE")
    if not raw:
        env = Path(__file__).resolve().parents[2] / ".env.local"
        if env.exists():
            for line in env.read_text().splitlines():
                line = line.strip()
                if line.startswith("GDCMAS_PREVIEW_ROLE"):
                    raw = line.split("=", 1)[1].strip().strip("\"'")
                    break
    return (raw or "dentist").strip() or "dentist"

OUT_DIR = Path(__file__).resolve().parents[2] / "docs"
RAW_DIR = Path("/tmp/opencode/walkthrough-raw")
SIZE = {"width": 1280, "height": 720}

CAPTION_CSS = """
  #__cap {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
    padding: 18px 28px 20px; background: linear-gradient(transparent, rgba(2,6,23,.92) 38%);
    color: #f8fafc; font: 600 19px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    letter-spacing: .1px; pointer-events: none; text-shadow: 0 1px 3px rgba(0,0,0,.7);
  }
  #__cap b { display:block; font-size: 13px; letter-spacing: .14em; text-transform: uppercase;
            color: #7dd3fc; margin-bottom: 5px; font-weight: 700; }
  /* The Next.js dev-tools badge is a preview artifact, not part of the product. */
  nextjs-portal, [data-nextjs-toast] { display: none !important; }
"""


def add_caption(page, step: str, text: str) -> None:
    if VERIFY:
        assert page.viewport_size["width"] == 1280, page.viewport_size
    page.evaluate(
        """([step, text, css]) => {
            let el = document.getElementById('__cap');
            if (!el) {
                const s = document.createElement('style');
                s.textContent = css;
                document.head.appendChild(s);
                el = document.createElement('div');
                el.id = '__cap';
                document.body.appendChild(el);
            }
            el.innerHTML = '<b>' + step + '</b>' + text;
        }""",
        [step, text, CAPTION_CSS],
    )
    if not VERIFY:
        return
    # Silent video means the caption is the only narration, so prove it rendered
    # and sits inside the recorded frame rather than below the fold.
    page.wait_for_timeout(120)
    box = page.query_selector("#__cap")
    if not box:
        raise SystemExit(f"caption element missing for step {step!r}")
    if not box.is_visible():
        raise SystemExit(f"caption not visible for step {step!r}")
    bb = box.bounding_box()
    if not bb or bb["y"] + bb["height"] > page.viewport_size["height"] + 1:
        raise SystemExit(f"caption outside viewport for step {step!r}: {bb}")
    shown = box.inner_text()
    if text not in shown:
        raise SystemExit(f"caption text mismatch for {step!r}: {shown!r}")
    print(f"  ok  {step:<22} {text[:58]}...")


def clear_caption(page) -> None:
    page.evaluate("() => { const e = document.getElementById('__cap'); if (e) e.remove(); }")


def scroll_through(page, pace: int = 550) -> None:
    """Scroll to the bottom in viewport-sized steps so tall pages are readable."""
    height = page.evaluate("() => document.body.scrollHeight")
    y = 0
    while y < height:
        page.evaluate("(d) => window.scrollBy({top: d, behavior: 'smooth'})", pace)
        page.wait_for_timeout(260)
        y += pace
        height = page.evaluate("() => document.body.scrollHeight")
    page.wait_for_timeout(400)
    page.evaluate("() => window.scrollTo({top: 0, behavior: 'smooth'})")
    page.wait_for_timeout(500)


def run() -> None:
    if RAW_DIR.exists():
        shutil.rmtree(RAW_DIR)
    RAW_DIR.mkdir(parents=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # One file per persona: a secretary recording cannot contain the tooth
    # picker at all, so a single canonical name would silently misrepresent
    # whichever role happened to be configured last.
    role = preview_role()
    webm_target = OUT_DIR / f"GDCMAS-Walkthrough-Video-{role}.webm"

    with sync_playwright() as pw:
        browser = launch(pw)
        ctx = browser.new_context(
            viewport=SIZE,
            **({} if VERIFY else {
                "record_video_dir": str(RAW_DIR),
                "record_video_size": SIZE,
            }),
            device_scale_factor=1,
            reduced_motion="no-preference",
        )
        page = ctx.new_page()

        def go(path: str) -> None:
            page.goto(BASE + path, wait_until="networkidle", timeout=45_000)
            page.wait_for_timeout(900)

        # 1. Entry point
        go("/login")
        go("/")
        shown = page.eval_on_selector_all("aside p", "els => els.map(e => e.textContent.trim())")
        expected = ROLE_LABEL.get(role)
        if expected and expected not in shown:
            raise SystemExit(
                f"previewing as {role!r} but the sidebar shows {shown[:2]!r}; "
                f"expected {expected!r}. Refusing to label the file wrongly."
            )
        print(f"  persona confirmed on screen: {shown[0] if shown else '(sidebar empty)'}")
        add_caption(page, "Gonzaga Dental Clinic · Staff Walkthrough",
                   "Staff sign-in. Preview mode uses fabricated data and rejects all writes.")
        page.wait_for_timeout(2600)

        # 2. Dashboard
        go("/")
        add_caption(page, "Dashboard",
                   "One screen answers the morning question: who is coming, and how many are still to be seen.")
        page.wait_for_timeout(3000)

        add_caption(page, "Dashboard",
                   "Today's schedule is listed here, so the front desk works from the same list it books from.")
        scroll_through(page)
        page.wait_for_timeout(1800)

        # 3. Patients
        go("/patients")
        add_caption(page, "Patients",
                   "The patient directory. A secretary only sees their own branch — the database enforces this, not the interface.")
        page.wait_for_timeout(2800)
        scroll_through(page, pace=700)
        page.wait_for_timeout(1500)

        # 4. Search — the directory filters from the URL as you type
        go("/patients")
        add_caption(page, "Patient search",
                   "Search by name or contact. Needed constantly for a returning patient calling at the desk.")
        page.wait_for_timeout(2000)
        found = 0
        try:
            box = page.query_selector("input[type='search']")
            if box:
                box.click()
                page.keyboard.type("del", delay=120)
                page.keyboard.press("Enter")
                page.wait_for_timeout(3000)
                found = len(page.query_selector_all("a[href*='/patients/']"))
                add_caption(page, "Patient search",
                           "The query lives in the URL, so a search can be shared or reloaded instead of retyped.")
        except Exception as exc:  # noqa: BLE001
            print(f"  ! search typing skipped: {exc}")
        print(f"  search results for 'del': {found}")
        page.wait_for_timeout(2600)

        # 5. Open a patient record. Read from the directory rather than the
        #    search page, because the query above may legitimately return nothing.
        go("/patients")
        patient_href = None
        for sel in ("a[href*='/patients/']",):
            for link in page.query_selector_all(sel):
                href = link.get_attribute("href") or ""
                if re.fullmatch(r"/patients/[0-9a-f-]{32,36}", href):
                    patient_href = href
                    break
            if patient_href:
                break
        if not patient_href:
            raise SystemExit("no patient link found to record")
        print(f"  patient: {patient_href}")

        go(patient_href)
        add_caption(page, "Patient record",
                   "One record per patient, shared across both branches. Allergies sit at the top, because an unnoticed allergy is a clinical risk.")
        page.wait_for_timeout(3000)
        scroll_through(page, pace=600)
        page.wait_for_timeout(2000)

        # 6. Tooth chart, read-only
        go(patient_href + "?tab=treatments")
        add_caption(page, "Treatments · tooth chart",
                   "The chart is the record of what was done. Shaded teeth already have recorded procedures.")
        page.wait_for_timeout(3000)

        # 7. Charting. Recording a treatment is dentist/admin-only
        #    (canWrite in app/(app)/patients/[id]/page.tsx), so a secretary
        #    persona sees the read-only chart instead of the picker. Handle both
        #    rather than recording a step that silently did nothing.
        teeth = page.query_selector_all("button[aria-label^='Tooth ']")
        if len(teeth) >= 10:
            add_caption(page, "Charting",
                       "Charting a tooth is a tap on the chart, not a two-digit code. A dentist identifies a tooth by where it sits.")
        else:
            print(f"  tooth buttons: {len(teeth)} (role cannot record treatments)")
            add_caption(page, "Tooth chart",
                       "Recording a treatment is restricted to the dentist or admin, so this chart is read-only here.")
            page.wait_for_timeout(3000)
            go(patient_href + "?tab=overview")
            add_caption(page, "Tooth chart",
                       "Shaded teeth already carry recorded procedures, so prior work on a tooth is visible at a glance.")
            page.wait_for_timeout(2200)
            marker = page.query_selector("[title*='Tooth'], [title*='tooth']")
            if marker:
                marker.scroll_into_view_if_needed()
                page.wait_for_timeout(600)
                page.mouse.wheel(0, -180)
                page.wait_for_timeout(900)
            page.wait_for_timeout(3200)
            go(patient_href + "?tab=treatments")
            page.wait_for_timeout(800)

        def tap(code: str) -> None:
            for t in teeth:
                if (t.get_attribute("aria-label") or "").startswith(f"Tooth {code}"):
                    t.click()
                    page.wait_for_timeout(700)
                    return
            print(f"  ! tooth {code} not found")

        # Only narrate the picker when it is actually on screen. Running these
        # captions unconditionally put "tapping adds the tooth" over a
        # read-only chart, and printed an empty saved value.
        if teeth:
            add_caption(page, "Charting",
                       "Tapping adds the tooth to the record; tapping again removes it.")
            for code in ("16", "15"):
                tap(code)
            page.wait_for_timeout(1400)

            add_caption(page, "Charting",
                       "The chart and the text box are two views of one value, so they can never disagree about what gets saved.")
            page.wait_for_timeout(2800)

            add_caption(page, "Charting",
                       "Child teeth are one checkbox away for a mixed dentition.")
            try:
                child = page.query_selector("label:has-text('Show child teeth') input[type='checkbox']")
                if child is None:
                    child = page.query_selector("input[type='checkbox']")
                if child and not child.is_checked():
                    child.check()
                    page.wait_for_timeout(2000)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! child-teeth toggle skipped: {exc}")
            page.wait_for_timeout(1600)

            fdi = ""
            try:
                fdi = page.input_value("#tooth_fdi")
            except Exception:  # noqa: BLE001
                pass
            if not fdi.strip():
                raise SystemExit(f"taps did not reach #tooth_fdi (got {fdi!r})")
            print(f"  tooth_fdi after taps: {fdi!r}")
            add_caption(page, "Charting",
                       f"The value that would be saved reads “{fdi}”. Preview mode refuses to store it.")
            page.wait_for_timeout(3200)
        else:
            add_caption(page, "Tooth chart",
                       "A dentist or admin picks the tooth by tapping it here, and the field fills itself.")
            page.wait_for_timeout(3400)

        # 8. Consent
        go(patient_href + "?tab=consent")
        add_caption(page, "Consent",
                   "Consent is versioned. The record keeps the exact wording the patient agreed to, not just a ticked box.")
        page.wait_for_timeout(3000)
        scroll_through(page, pace=700)
        page.wait_for_timeout(1400)

        # 9. Register
        go("/patients/new")
        add_caption(page, "Register patient",
                   "Intake. Allergies and medical conditions are captured at registration rather than discovered mid-treatment.")
        page.wait_for_timeout(2600)
        scroll_through(page, pace=700)
        page.wait_for_timeout(1600)

        # 10. Day list and the one-tap status action
        go("/appointments")
        add_caption(page, "Appointments",
                   "The day list opens with how many patients are still to be seen, so progress is readable without counting rows.")
        page.wait_for_timeout(3200)

        btn = None
        for label in ("Check in", "Confirm", "Complete", "Reopen"):
            found = page.query_selector(f"button:text-is('{label}')")
            if found:
                btn = found
                break
        if btn:
            add_caption(page, "Appointments",
                       "Check in, then complete — the transition repeated all morning — is one labelled button on the row.")
            page.wait_for_timeout(2400)
            btn.click()
            page.wait_for_timeout(700)
            add_caption(page, "Appointments",
                       "Only that row is disabled while it saves, so one slow request never freezes the whole waiting room.")
            page.wait_for_timeout(3000)
            clear_caption(page)
            page.wait_for_timeout(900)
        else:
            print("  ! no primary status button found")

        add_caption(page, "Appointments",
                   "That is the front-desk workflow: find the patient, check their details, move the appointment along."
                   + (" The dentist does the charting." if not teeth else ""))
        page.wait_for_timeout(3400)
        clear_caption(page)

        ctx.close()
        browser.close()

    produced = sorted(RAW_DIR.glob("*.webm"), key=lambda p: p.stat().st_mtime)
    if not produced:
        raise SystemExit("playwright produced no video")
    shutil.move(str(produced[-1]), str(webm_target))
    print(f"raw video: {webm_target}")


def to_mp4(webm: Path) -> None:
    """H.264 + yuv420p so it plays in PowerPoint, Keynote, QuickTime and phones."""
    mp4 = webm.with_suffix(".mp4")
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(webm),
            "-c:v", "libx264", "-preset", "slow", "-crf", "21",
            "-pix_fmt", "yuv420p",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-movflags", "+faststart",
            str(mp4),
        ],
        check=True,
        capture_output=True,
    )
    webm.unlink()
    print(f"mp4: {mp4}")


if __name__ == "__main__":
    if VERIFY:
        run()
        print("all captions rendered inside the frame")
    else:
        run()
        to_mp4(OUT_DIR / f"GDCMAS-Walkthrough-Video-{preview_role()}.webm")
