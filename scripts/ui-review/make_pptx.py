#!/usr/bin/env python3
"""
PREVIEW-ONLY. Build the PowerPoint walkthrough deck.

Screen content is imported from `make_pdf.py` rather than retyped, so the PDF and
the deck cannot drift apart when a bullet is edited. The deck adds what a
fixed-layout page cannot: a title slide, the access model, the staff UX changes
made after the first PDF, and a verification/status slide.
"""

import pathlib
import sys

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _common import REPO, SHOTS  # noqa: E402
from make_pdf import PAGES  # noqa: E402

OUT = REPO / "docs" / "GDCMAS-Project-Walkthrough.pptx"

TEAL = RGBColor(0x4A, 0x7A, 0x5C)  # brand sage, from app/globals.css --brand
INK = RGBColor(0x1C, 0x19, 0x17)
MUTED = RGBColor(0x78, 0x71, 0x6C)
PAPER = RGBColor(0xFA, 0xFA, 0xF9)
RULE = RGBColor(0xE7, 0xE5, 0xE4)
AMBER_BG = RGBColor(0xFE, 0xF3, 0xC7)
AMBER_INK = RGBColor(0x78, 0x35, 0x0F)

W, H = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.62)

ADMIN_ONLY = {"14-staff", "15-audit-log", "16-backups"}
DENTIST_ADMIN = {"03-branches", "20-mobile-branches"}
PUBLIC = {"01-sign-in", "17-book", "21-mobile-book"}


def role_tag(slug: str) -> str:
    if slug in PUBLIC:
        return "Public"
    if slug in DENTIST_ADMIN:
        return "Dentist + admin"
    if slug in ADMIN_ONLY:
        return "Admin only"
    return "All staff"


def blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def bg(slide, color=PAPER):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def text(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, space=0):
    """runs = [(text, size, bold, color, space_after_pt), ...]"""
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    for i, (body, size, bold, color, after) in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(after or space)
        r = p.add_run()
        r.text = body
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = "Calibri"
    return box


def rule(slide, x, y, w, color=TEAL, weight=2):
    from pptx.enum.shapes import MSO_SHAPE
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, Pt(weight))
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    sh.line.fill.background()
    sh.shadow.inherit = False
    return sh


def picture(slide, path: pathlib.Path, x, y, max_w, max_h):
    """Fit inside the box, preserving aspect ratio, centred horizontally."""
    with Image.open(path) as im:
        iw, ih = im.size
    scale = min(max_w / iw, max_h / ih)
    w, h = int(iw * scale), int(ih * scale)
    return slide.shapes.add_picture(
        str(path), x + int((max_w - w) / 2), y, width=w, height=h
    )


def chrome(slide, title, tag, num, total):
    """Shared header: title, role badge, teal rule, page number."""
    bg(slide)
    text(slide, MARGIN, Inches(0.34), Inches(9.4), Inches(0.5),
         [(title, 24, True, INK, 0)])
    if tag:
        chip = slide.shapes.add_textbox(W - MARGIN - Inches(2.3), Inches(0.42), Inches(2.3), Inches(0.3))
        tf = chip.text_frame
        tf.word_wrap = False
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.RIGHT
        r = p.add_run()
        r.text = tag.upper()
        r.font.size = Pt(9.5)
        r.font.bold = True
        r.font.color.rgb = MUTED
        r.font.name = "Calibri"
    rule(slide, MARGIN, Inches(0.92), W - 2 * MARGIN)
    text(slide, MARGIN, H - Inches(0.52), Inches(4), Inches(0.3),
         [(f"Gonzaga Dental Clinic · {num:02d} / {total:02d}", 9, False, MUTED, 0)])


def bullets(slide, x, y, w, h, items, size=13):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    for i, b in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(9)
        r = p.add_run()
        r.text = "•  " + b
        r.font.size = Pt(size)
        r.font.color.rgb = INK
        r.font.name = "Calibri"
    return box


def note(slide, x, y, w, h, body):
    box = slide.shapes.add_textbox(x, y, w, h)
    box.fill.solid()
    box.fill.fore_color.rgb = AMBER_BG
    box.line.color.rgb = RGBColor(0xFC, 0xD3, 0x4D)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.14)
    tf.margin_right = Inches(0.14)
    tf.margin_top = Inches(0.1)
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = body
    r.font.size = Pt(11.5)
    r.font.color.rgb = AMBER_INK
    r.font.name = "Calibri"
    return box


def build():
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H

    # Screens start at 1; the framing slides are counted in the total so the
    # page numbers on the slides stay honest.
    # Two different counts, and conflating them shifts every footer number:
    #   BEFORE_SCREENS = slides that precede the screenshot run (title, what it
    #                    replaces, access model, the two UX slides, bugs)
    #   extra_slides   = BEFORE_SCREENS plus the two slides that follow it
    #                    (verification, decisions)
    BEFORE_SCREENS = 6
    extra_slides = BEFORE_SCREENS + 2
    total = len(PAGES) + extra_slides

    # 1. Title
    s = blank(prs)
    bg(s, RGBColor(0x0B, 0x1F, 0x24))
    text(s, MARGIN, Inches(2.5), Inches(10.5), Inches(1.4),
         [("Gonzaga Dental Clinic", 44, True, RGBColor(0xF8, 0xFA, 0xFC), 6),
          ("Two branches, one patient record", 22, False, RGBColor(0x7D, 0xD3, 0xFC), 0)])
    rule(s, MARGIN, Inches(4.15), Inches(3.0), TEAL, 3)
    text(s, MARGIN, Inches(4.45), Inches(10.5), Inches(1.2),
         [("Clinic management system · interface walkthrough", 14, False, RGBColor(0xCB, 0xF5, 0xE1), 4),
          ("All screens shown use fabricated sample data. No real patient information is present.",
           11.5, False, RGBColor(0x94, 0xA3, 0xB8), 0)])

    # 2. What it is
    s = blank(prs)
    chrome(s, "What this replaces", None, 2, total)
    bullets(s, MARGIN, Inches(1.35), Inches(6.1), Inches(5), [
        "A paper front-desk register: a wall calendar for appointments and a card index for treatment history.",
        "The card index is where patient safety degrades — an allergy noted on one card is invisible on the next.",
        "With two branches, patients appear at either site, so a single shared record is the minimum requirement, not a nice-to-have.",
        "Appointments, clinical notes and consent are kept apart by role, so a secretary cannot silently alter a clinical record.",
    ], size=14)
    bullets(s, Inches(7.0), Inches(1.35), Inches(5.7), Inches(5), [
        "Next.js app with PostgreSQL row-level security as the only authority on who sees what.",
        "Branch scoping is enforced in the database, so a hidden button is never the thing standing between two patients.",
        "Preview mode renders every screen against fabricated data with no database, so the interface can be reviewed before a backend is committed to.",
        "Designed around the three screens staff use all day: the day list, the patient record, and charting a tooth.",
    ], size=14)

    # 3. Access model
    s = blank(prs)
    chrome(s, "Who sees what", None, 3, total)
    rows = [
        ("Secretary", "Own branch only", "Patients, appointments, consent. Cannot record treatments or see staff, backups, audit or the branch comparison."),
        ("Dentist", "Both branches", "Adds treatment recording and the side-by-side branch view."),
        ("Admin", "Both branches", "Adds staff accounts, audit log and backups."),
    ]
    y = Inches(1.45)
    for role, scope, detail in rows:
        rule(s, MARGIN, y, W - 2 * MARGIN, RULE, 1)
        text(s, MARGIN, y + Inches(0.16), Inches(2.1), Inches(0.4), [(role, 15, True, TEAL, 0)])
        text(s, Inches(3.0), y + Inches(0.16), Inches(2.4), Inches(0.4), [(scope, 15, True, INK, 0)])
        text(s, Inches(5.6), y + Inches(0.16), Inches(7.1), Inches(0.8), [(detail, 12.5, False, INK, 0)])
        y += Inches(0.92)
    rule(s, MARGIN, y, W - 2 * MARGIN, RULE, 1)
    note(s, MARGIN, y + Inches(0.3), W - 2 * MARGIN, Inches(1.5),
         "One deliberate exception: a secretary may open a patient registered at the other branch once that patient has an "
         "appointment at theirs. Without it, a visitor from the other site could never be checked in — the first cross-branch "
         "visit of the day is exactly when the desk needs the record. An unassigned secretary is granted no branch access, not all of it.")

    # 4. Staff UX change 1
    s = blank(prs)
    chrome(s, "Charting: tap the tooth, don't code it", None, 4, total)
    shot = SHOTS / "07-patient-treatments.png"
    if shot.exists():
        picture(s, shot, MARGIN, Inches(1.3), Inches(6.0), Inches(5.3))
    bullets(s, Inches(6.9), Inches(1.45), Inches(5.8), Inches(4.4), [
        "Charting was a free-text field asking for an FDI code. A dentist identifies a tooth by where it sits, so a two-digit code is the slowest and most error-prone way to record one — and a wrong tooth is clinical data, not a typo.",
        "The chart is now interactive: tap to select, tap again to remove.",
        "Teeth already treated are shaded with their procedure count, so prior work is visible while charting rather than afterwards.",
        "The chart and the text box are two views of one value, so a tapped tooth and a typed range can never disagree about what is saved.",
        "Touch targets are 44x44 px, meeting the platform minimum rather than the 40 px that was being missed.",
    ], size=12.5)
    note(s, Inches(6.9), Inches(5.55), Inches(5.8), Inches(0.95),
         "Tap targets cannot express a range like 11-18, so typing still works and stays in sync with the chart.")

    # 5. Staff UX change 2
    s = blank(prs)
    chrome(s, "The waiting room: one tap, not a dropdown", None, 5, total)
    shot = SHOTS / "13-appointments.png"
    if shot.exists():
        picture(s, shot, MARGIN, Inches(1.3), Inches(6.0), Inches(5.3))
    bullets(s, Inches(6.9), Inches(1.45), Inches(5.8), Inches(4.4), [
        "The day list opens with how many patients are still to be seen, so progress is readable without counting rows.",
        "Check in, then complete — the transition repeated all morning — is a single labelled button on each row. Anything else stays under 'More'.",
        "The buttons are labelled the way staff speak. The row says 'Check in', not 'confirmed'.",
        "Only the row being saved is disabled while it saves. A single global flag meant one slow request froze every row's controls.",
        "Status changes are announced to screen readers, so the outcome is not visual-only.",
    ], size=12.5)

    # 6. Bugs found while doing the above
    s = blank(prs)
    chrome(s, "Bugs found while making it usable", None, 6, total)
    bullets(s, MARGIN, Inches(1.35), Inches(12.1), Inches(5.2), [
        "Mobile overflow on every page. Responsive grids declared no base single column, so below the breakpoint the implicit column sized to its widest content and pushed the page into horizontal scroll. Fixed across 17 grids; verified at five widths.",
        "Treatment dates defaulted to the wrong day. The form used the server's UTC date, so between midnight and 8am Manila a treatment would default to yesterday.",
        "The 'secretary' preview persona never existed. The role fell through a conditional to 'dentist', so the entire secretary interface could not be reviewed despite being documented.",
        "Preview contradicted its own security model. The fabricated data ignored branch scoping, so a secretary persona saw every patient in the clinic while the sidebar insisted they saw one branch.",
        "A secondary button class used by several screens did not exist in the stylesheet.",
    ], size=14)

    # 7..n Screens
    num = BEFORE_SCREENS
    for f, title, purpose, pts in PAGES:
        num += 1
        slug = f.rsplit(".", 1)[0]
        s = blank(prs)
        chrome(s, title, role_tag(slug), num, total)
        path = SHOTS / f
        if path.exists():
            picture(s, path, MARGIN, Inches(1.22), Inches(6.35), Inches(4.55))
        text(s, Inches(7.25), Inches(1.25), Inches(5.5), Inches(0.7), [(purpose, 12.5, False, MUTED, 0)])
        bullets(s, Inches(7.25), Inches(1.95), Inches(5.5), Inches(4.6), pts, size=11.5)
        if not path.exists():
            note(s, MARGIN, Inches(1.3), Inches(6.3), Inches(0.6),
                 f"Missing screenshot: {f}. Run npm run ui:shots with the dev server up.")

    # Verification
    num += 1
    s = blank(prs)
    chrome(s, "How it was verified", None, num, total)
    bullets(s, MARGIN, Inches(1.35), Inches(6.2), Inches(5), [
        "Database smoke test against a throwaway PostgreSQL instance: 26 sections, including 8 attempts that must be denied by row-level security.",
        "The schema is applied twice per run to prove it is idempotent, and the seed runs twice.",
        "TypeScript, ESLint and a production build with preview disabled, confirming every authenticated route stays dynamic.",
        "21 screenshots captured at desktop and mobile, with console errors and page errors treated as failures.",
        "A layout audit at five viewport widths checks for horizontal overflow and undersized touch targets.",
    ], size=13.5)
    bullets(s, Inches(7.0), Inches(1.35), Inches(5.7), Inches(5), [
        "Not yet verified, and it matters: production authentication, the real REST layer, writes, and end-to-end row-level security all need live Supabase credentials.",
        "No automated browser tests are committed, so a regression in the interactive chart would only be caught by review.",
        "Branch opening hours are read per branch for display, but booking still uses one clinic-wide hours map.",
        "The first cross-branch visit of the day still needs a dentist or admin to create.",
        "No automated backups are running yet; the backups screen shows the manual procedure.",
    ], size=13.5)

    # Decisions needed
    num += 1
    s = blank(prs)
    chrome(s, "Decisions needed from the clinic", None, num, total)
    bullets(s, MARGIN, Inches(1.35), Inches(12.1), Inches(5.2), [
        "Real opening hours per branch. Today the branch pages display each branch's own hours, but appointment booking uses a single clinic-wide map, so a branch that is closed can still be booked.",
        "Consent wording and version, and whether consent is required before a procedure or only recorded afterwards.",
        "What intake must capture, and whether registration collects consent at the same time.",
        "The procedure code list, and whether codes must map to a national fee schedule.",
        "Record retention periods, backup schedule, and who may hold each role — particularly whether a receptionist ever needs the dentist and admin views.",
        "Whether a patient may be registered at one branch and treated routinely at the other, which changes how appointments are booked.",
        "Public booking: whether publishing per-branch availability is acceptable, and rate limiting or a captcha before the page faces the internet.",
        "How a self-booked request should match an existing patient — name plus birthdate today — or whether a stronger identifier is required.",
    ], size=14)

    prs.save(OUT)
    print(f"{OUT}  ({OUT.stat().st_size // 1024} KB, {len(prs.slides._sldIdLst)} slides)")


if __name__ == "__main__":
    build()
