#!/usr/bin/env python3
"""
PREVIEW-ONLY. Build the screenshot walkthrough PDF.

One app page per PDF page: what it is, who uses it, what to look at. Images are
downscaled and re-encoded as JPEG first, otherwise the 2x PNGs push the file
past 6 MB and most viewers struggle to open it.
"""
import base64
import html
import io
import pathlib
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _common import BASE, REPO, SHOTS, launch  # noqa: E402

OUT = pathlib.Path("/home/khent/projects/gdcmas/docs/GDCMAS-UI-UX-Walkthrough.pdf")

# (file, title, purpose, [bullets])
PAGES = [
    ("01-sign-in.png", "Sign in",
     "The only page reachable without a session.",
     ["Email and password only. There is no patient login, because patients are records, not accounts.",
      "A valid password is not enough: the server layout re-checks that the staff row is still active, so a deactivated account cannot reach the app even with a valid password.",
      "The 'next' parameter is validated so it can only be a local path, closing off open-redirect abuse.",
      "Error text is deliberately vague. It never reveals whether an email has an account, which would leak staff existence to an attacker."]),
    ("02-dashboard.png", "Dashboard",
     "The landing page after sign-in: what needs attention today.",
     ["Today's appointment list first, because that is the question the secretary asks on arrival.",
      "Counts for patients, appointments and treatments give orientation without needing to open each list.",
      "Recent treatment entries surface cross-branch clinical activity.",
      "Times render in clinic time (Asia/Manila) regardless of the server's timezone."]),
    ("03-branches.png", "Both branches",
     "The dentist's view of the clinic: two branches, side by side.",
     ["Each branch gets its own block with its own figures. Merging them into one list would hide the thing that matters when you own two sites: whether one of them is behind.",
      "Per branch: active patients, appointments today, new registrations this week, and procedures recorded this week.",
      "Today's schedule is split by branch rather than interleaved, so the load at each site is visible at a glance.",
      "Open/closed status uses each branch's own hours, so a branch that has already closed reads differently from one still trading.",
      "Visible to dentists and admins. A secretary is scoped to a single branch by the database itself, so this comparison is not something they could reconstruct from the patient list.",
      "Reads on the phone as well, with the per-branch figures stacking into a single column."]),
    ("04-patients.png", "Patient directory",
     "Every patient, searchable, with the duplicate warning built in.",
     ["Search filters from the URL, so a filtered view can be bookmarked or shared with a colleague.",
      "Patient number, name, age and branch are shown together because staff identify people by any of them.",
      "New registrations are checked against likely duplicates by name and birthdate. Similarity is surfaced for a human to judge, never auto-merged, because merging patient records is unsafe to automate."]),
    ("05-patient-search.png", "Search results",
     "The same directory after a query, to show filtering end to end.",
     ["Results update without a full page load and the query stays in the address bar.",
      "An archived patient is hidden by default; the toggle includes them for records that need correcting."]),
    ("06-patient-overview.png", "Patient record: overview",
     "Demographics, medical context and upcoming visits for one patient.",
     ["Allergies are placed at the top, not buried in a tab, because an unnoticed allergy is a clinical risk.",
      "Demographics are read-only here and edited through a separate, deliberate flow.",
      "The tab bar (overview, treatments, consent, appointments, edit) is the whole record; nothing important is more than one click away."]),
    ("07-patient-treatments.png", "Patient record: treatments",
     "The clinical history that used to live on a paper index card.",
     ["The tooth is chosen by tapping it on the chart rather than typing a two-digit code. A dentist identifies a tooth by where it sits; asking for a number is the slowest, most error-prone way to record it.",
      "Teeth already treated for this patient are shaded with their procedure count, so prior work on the tooth is visible while charting rather than after.",
      "The chart and the text box are two views of one value, so a tapped tooth and a typed range can never disagree about what gets saved. Child teeth are one checkbox away.",
      "Charting follows the FDI two-digit notation, so a tooth is named the same way the clinic already names it.",
      "Each entry records surfaces, procedure and who performed it, which is what an audit or a complaint review needs.",
      "Print produces a clean chart for the physical file, with navigation and controls hidden."]),
    ("08-patient-consent.png", "Patient record: consent",
     "Consent captured per patient, versioned over time.",
     ["A consent record stores the exact version the patient agreed to, not just a checkbox.",
      "History is retained so a later dispute can be answered with what was actually signed at the time.",
      "Consent wording is a clinic decision and is deliberately not invented here."]),
    ("09-patient-appointments.png", "Patient record: appointments",
     "This patient's appointment history.",
     ["Past and upcoming are separated so the two are never confused.",
      "Overlapping appointments for the same patient are rejected by the database, not just by the form, so a race between two secretaries cannot double-book."]),
    ("10-patient-edit.png", "Patient record: edit",
     "Editing an existing record rather than creating a new one.",
     ["The form is pre-filled from the stored record, so an edit never silently blanks a field.",
      "Edits go through the same validation as registration, so a correction cannot create a record that registration would have refused."]),
    ("11-patient-allergy.png", "High-risk record: allergy alert",
     "The same overview, chosen to show how risk is escalated.",
     ["A patient with a recorded allergy is flagged prominently rather than left for the reader to notice.",
      "Escalation is visual and immediate because the cost of missing it is a medical incident."]),
    ("12-register-patient.png", "Register patient",
     "Digital intake, replacing the paper front-desk form.",
     ["Field-level validation messages appear next to the field that failed.",
      "A birthdate is optional. Blank means unknown, which is different from a wrong date, so it is never guessed.",
      "On a likely duplicate match the form pauses for explicit acknowledgement rather than creating a second record silently."]),
    ("13-appointments.png", "Appointments",
     "The shared clinic schedule across branches.",
     ["A month grid with per-day volume dots gives an overview before drilling into a day.",
      "The day view can be filtered by branch, and is labelled by branch to keep 'your branch' distinct from the clinic-wide record.",
      "The day list opens with a count of how many patients are still to be seen, so progress is readable without counting rows.",
      "The transition a secretary repeats all morning — check in, then complete — is a single labelled button on each row rather than an item in a dropdown. Anything else stays available under 'More'.",
      "Only the row being saved is disabled while it saves, so one slow request does not freeze the rest of the waiting room.",
      "The branch filter and its Apply control are both full-size touch targets for tablet use at the front desk."]),
    ("14-staff.png", "Staff",
     "Staff accounts and roles. Admin only.",
     ["Three roles: dentist, secretary, admin. Permissions are enforced by row-level security in the database, not by hiding buttons.",
      "The most recently created accounts are listed first so a new hire is easy to verify.",
      "An admin cannot deactivate their own account, which prevents locking the clinic out of its own system."]),
    ("15-audit-log.png", "Audit log",
     "Append-only record of access and changes. Admin only.",
     ["Every read and write of patient data is recorded, because the system holds identifiable health information.",
      "Rows link to the record they describe, turning a log line into a starting point for investigation.",
      "The log is append-only: there is no edit or delete affordance anywhere in the interface."]),
    ("16-backups.png", "Backups",
     "Backup and export activity. Admin only.",
     ["A clinic holding patient records needs a recoverable copy and a way to take one deliberately.",
      "The log records what was exported, by whom and when, so leaving the building with a backup is itself traceable.",
      "Real scheduled backups are a deployment decision and are not automated by this application."]),
    ("17-book.png", "Public booking",
     "The one page a patient can reach with no account at all.",
     ["Nothing on this page can read a patient record: the database grants the anon role no table access, so it only ever sees branch names and which slots are occupied.",
      "A submission lands as a request for the front desk to confirm — the page says plainly that this is not yet a booked appointment.",
      "Struck-through times are already booked or have passed; the grid follows the same slot rules the staff form uses.",
      "The database matches an existing patient on name and birthdate, or opens a new record. Two matches are refused rather than guessed.",
      "Deliberately unfinished before go-live: rate limiting and bot protection are still needed before this page faces the internet."]),
    ("18-mobile-dashboard.png", "Mobile: dashboard",
     "The dashboard at phone width.",
     ["The sidebar collapses to a horizontal scrolling nav so navigation survives a narrow screen without hiding it behind a menu.",
      "Interactive controls are at least 44px tall, the minimum comfortable touch target, because front-desk staff work on phones."]),
    ("19-mobile-patients.png", "Mobile: patient directory",
     "The patient list at phone width.",
     ["The table remains readable by scrolling horizontally within the table, so columns are never silently dropped.",
      "Patient names are comfortably tappable rather than bare inline text."]),
    ("20-mobile-branches.png", "Both branches on a phone",
     "The same cross-branch comparison, on the screen most staff actually carry.",
     ["Each branch becomes its own stacked block, so the counts, schedule, and recent treatments are read by scrolling rather than side by side.",
      "The branch name and open/closed badge stay at the top of each block, which is the part that has to be legible at a glance before opening anything else."]),
    ("21-mobile-book.png", "Booking on a phone",
     "The public booking page at the width most patients will actually use.",
     ["Slot times wrap into a tappable grid, with booked and passed times struck through rather than hidden, so the day's shape stays readable.",
      "Every control is checked against the 24px WCAG minimum target size on this screen, because a patient books on a phone, not a front desk.",
      "The form asks only for what the clinic needs to contact the patient — no account, no password, no record to browse."]),
]

CSS = """
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
       color: #1c1917; background: #fff; }
.page { width: 210mm; height: 297mm; padding: 14mm 12mm; display: flex;
        flex-direction: column; page-break-after: always; overflow: hidden; }
.page:last-child { page-break-after: auto; }

.head { display: flex; align-items: baseline; gap: 8px;
        border-bottom: 2px solid #4a7a5c; padding-bottom: 5px; margin-bottom: 9px; }
.num { font-size: 10pt; font-weight: 700; color: #4a7a5c; letter-spacing: .06em; }
.title { font-size: 16pt; font-weight: 700; margin: 0; }
.role { margin-left: auto; font-size: 8pt; color: #78716c; text-transform: uppercase;
        letter-spacing: .08em; }

.body { display: flex; gap: 9mm; flex: 1; min-height: 0; }
.text { width: 66mm; flex-shrink: 0; }
.purpose { font-size: 9.5pt; line-height: 1.45; color: #44403c; margin: 0 0 7px;
           padding: 6px 8px; background: #eaf3ec; border-left: 3px solid #4a7a5c; }
ul { margin: 0; padding-left: 13px; }
li { font-size: 8.4pt; line-height: 1.42; margin-bottom: 6px; color: #292524; }
li::marker { color: #4a7a5c; }

.shot { flex: 1; min-width: 0; display: flex; align-items: flex-start;
        justify-content: center; border: 1px solid #e7e5e4; background: #fafaf9;
        padding: 5px; border-radius: 4px; }
.shot img { max-width: 100%; max-height: 100%; object-fit: contain;
            border: 1px solid #d6d3d1; }

.cover { justify-content: center; }
.cover h1 { font-size: 26pt; margin: 0 0 4mm; line-height: 1.15; }
.cover .sub { font-size: 11pt; color: #57534e; margin: 0 0 8mm; }
.cover .meta { font-size: 9pt; color: #78716c; line-height: 1.7;
               border-top: 1px solid #e7e5e4; padding-top: 5mm; }
.warn { margin-top: 7mm; padding: 8px 10px; background: #fef3c7;
        border: 1px solid #fcd34d; border-radius: 4px; font-size: 8.6pt;
        line-height: 1.5; color: #78350f; }
"""


def jpeg_uri(path, max_w=1500, quality=84):
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def build_html():
    # Keyed on the slug, not the leading number: the numbering shifts whenever a
    # screen is added, and a number-keyed map silently starts labelling the wrong
    # page after a renumber.
    ADMIN_ONLY = {"14-staff", "15-audit-log", "16-backups"}
    DENTIST_ADMIN = {"03-branches", "20-mobile-branches"}
    PUBLIC = {"01-sign-in", "17-book", "21-mobile-book"}
    parts = []
    for i, (f, title, purpose, bullets) in enumerate(PAGES, 1):
        slug = f.rsplit(".", 1)[0]
        if slug in PUBLIC:
            tag = "Public"
        elif slug in DENTIST_ADMIN:
            tag = "Dentist + admin"
        elif slug in ADMIN_ONLY:
            tag = "Admin only"
        else:
            tag = "All staff"
        lis = "".join(f"<li>{html.escape(b)}</li>" for b in bullets)
        img = jpeg_uri(SHOTS / f)
        parts.append(f"""
<div class="page">
  <div class="head">
    <span class="num">{i:02d} / {len(PAGES):02d}</span>
    <h2 class="title">{html.escape(title)}</h2>
    <span class="role">{tag}</span>
  </div>
  <div class="body">
    <div class="text">
      <p class="purpose">{html.escape(purpose)}</p>
      <ul>{lis}</ul>
    </div>
    <div class="shot"><img src="{img}" alt="{html.escape(title)} screenshot"></div>
  </div>
</div>""")

    cover = f"""
<div class="page cover">
  <h1>Gonzaga Dental Clinic<br>Management System</h1>
  <p class="sub">UI/UX walkthrough &mdash; every screen, with notes on what it does and why it is built that way.</p>
  <div class="meta">
    <strong>Scope</strong> patient records, appointments, consent, treatments, staff, audit and public booking<br>
    <strong>Roles</strong> dentist, secretary, admin &mdash; patients are records, not user accounts<br>
    <strong>Screens documented</strong> {len(PAGES)}<br>
    <strong>Data in these images</strong> fabricated samples, generated locally
  </div>
  <div class="warn">
    <strong>Preview build.</strong> These screenshots come from a preview mode with no database
    attached. Every record shown is invented, the red banner is always visible, and the system is
    read-only: sign-in, saving, and permission enforcement are not exercised here. Preview mode must
    be switched off before any real patient data is entered.
  </div>
</div>"""
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{cover}{''.join(parts)}</body></html>"


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if not SHOTS.is_dir():
        raise SystemExit(f"No screenshots in {SHOTS}. Run capture.py first.")
    doc = build_html()
    html_path = SHOTS / "walkthrough.html"
    html_path.write_text(doc)
    with sync_playwright() as p:
        b = launch(p)
        pg = b.new_page()
        pg.goto(html_path.as_uri(), wait_until="networkidle")
        pg.pdf(path=str(OUT), format="A4", print_background=True,
               margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
        b.close()
    print(f"{OUT}  {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
