#!/usr/bin/env python3
"""
PREVIEW-ONLY capture script.

Screenshots every page of the running dev server for design review. Not part of
the app; delete along with lib/preview/ when the real Supabase project exists.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _common import BASE, REPO, SHOTS, clinic_today, launch  # noqa: E402

OUT = SHOTS
TODAY = clinic_today()
PATIENT = "0001-0000-4000-8000-000000000001"
PATIENT2 = "0005-0000-4000-8000-000000000005"

# (slug, path, viewport, description, full_page)
SHOTS = [
    ("01-sign-in", "/login", (1280, 900), "Sign-in screen. The only public page in the system.", False),
    ("02-dashboard", "/dashboard", (1440, 1000), "Dashboard: today's schedule, counts, recent activity.", True),
    ("03-branches", "/branches", (1440, 1400), "The dentist's two-branch overview: each branch's counts, schedule, treatments, and open/closed status side by side.", True),
    ("04-patients", "/patients", (1440, 1000), "Patient directory with search and the duplicate-warning flag.", True),
    ("05-patient-search", "/patients?q=delacruz", (1440, 900), "Search filters the directory from the URL.", True),
    ("06-patient-overview", f"/patients/{PATIENT}?tab=overview", (1440, 1200), "Patient record: demographics, allergies, upcoming visits, tooth map.", True),
    ("07-patient-treatments", f"/patients/{PATIENT}?tab=treatments", (1440, 1100), "Treatment history, replacing the index card patients used to photograph.", True),
    ("08-patient-consent", f"/patients/{PATIENT}?tab=consent", (1440, 1000), "Consent versions captured per patient.", True),
    ("09-patient-appointments", f"/patients/{PATIENT}?tab=appointments", (1440, 900), "Appointment history for one patient.", True),
    ("10-patient-edit", f"/patients/{PATIENT}?tab=edit", (1440, 1200), "Edit tab: pre-filled from the stored record.", True),
    ("11-patient-allergy", f"/patients/{PATIENT2}?tab=overview", (1440, 1000), "Allergy alert surfaced at the top of a high-risk record.", True),
    ("12-register-patient", "/patients/new", (1440, 1300), "Digital intake form replacing the paper front-desk form.", True),
    ("13-appointments", "/appointments", (1440, 1200), "Shared schedule: month grid with volume dots, then the day view.", True),
    ("14-staff", "/staff", (1440, 1000), "Staff accounts, roles, and home-branch assignment (admin only).", True),
    ("15-audit-log", "/audit-log", (1440, 1000), "Append-only audit log (admin only).", True),
    ("16-backups", "/backups", (1440, 1000), "Backup log and export action (admin only).", True),
    ("17-book", f"/book?date={TODAY}", (1440, 1500), "Public booking page: branch, date, and which times are open. No account, no patient data.", True),
]

# Mobile checks on the most-used screens.
MOBILE = [
    ("18-mobile-dashboard", "/dashboard", (390, 844), "Dashboard at phone width: sidebar collapses to a scrollable nav.", True),
    ("19-mobile-patients", "/patients", (390, 844), "Patient directory at phone width.", True),
    ("20-mobile-branches", "/branches", (390, 844), "Two-branch overview at phone width: the per-branch figures stack into one column.", True),
    ("21-mobile-book", f"/book?date={TODAY}", (390, 844), "Public booking at phone width — the screen a patient actually books from.", True),
]


def shoot(page, slug, path, size, desc, full, problems):
    page.set_viewport_size({"width": size[0], "height": size[1]})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    resp = page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(700)
    page.screenshot(path=str(OUT / f"{slug}.png"), full_page=full)
    status = resp.status if resp else 0
    # A visible Supabase/React error boundary is a real defect, not cosmetics.
    body = page.inner_text("body")[:4000]
    if "Application error" in body or "Internal Server Error" in body:
        problems.append(f"{slug}: error page rendered")
    for e in errors[:2]:
        if "favicon" not in e.lower():
            problems.append(f"{slug}: console {e[:120]}")
    print(f"  {status}  {slug:26} {desc[:52]}")
    return {"slug": slug, "path": path, "desc": desc, "status": status,
            "errors": [e[:160] for e in errors if "favicon" not in e.lower()][:3]}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # Renumbering a slug leaves the old file behind, and the deck/PDF would
    # happily embed the stale image — clear the previous run first.
    for old in OUT.glob("*.png"):
        old.unlink()
    problems, results = [], []
    with sync_playwright() as p:
        b = launch(p)
        pg = b.new_page(device_scale_factor=2)
        print("Capturing desktop pages:")
        for s in SHOTS:
            results.append(shoot(pg, *s, problems))
        print("Capturing mobile pages:")
        for s in MOBILE:
            results.append(shoot(pg, *s, problems))
        b.close()

    print(f"\n{len(results)} screenshots -> {OUT}")
    if problems:
        print("PROBLEMS:")
        for x in problems:
            print("  !", x)
    else:
        print("No page errors or console errors detected.")

    import json
    (OUT / "results.json").write_text(json.dumps(results, indent=2))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
