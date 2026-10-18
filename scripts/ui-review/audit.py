#!/usr/bin/env python3
"""
PREVIEW-ONLY. Programmatic UI/UX audit — the checks that do not need eyes.

Complements capture.py: that proves pages render, this proves they render
*correctly*. Focuses on defects that are invisible in a code review but obvious
to a user: leaked "undefined", horizontal scroll on phones, unlabelled inputs,
tap targets under 44px.
"""
import json
import pathlib
import sys
import re

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _common import BASE, REPO, SHOTS, clinic_today, launch  # noqa: E402

PAT = "0001-0000-4000-8000-000000000001"

PAGES = [
    ("sign-in", "/login", 1280),
    ("dashboard", "/dashboard", 1440),
    ("branches", "/branches", 1440),
    ("patients", "/patients", 1440),
    ("patient-search", "/patients?q=dela", 1440),
    ("patient-overview", f"/patients/{PAT}?tab=overview", 1440),
    ("patient-treatments", f"/patients/{PAT}?tab=treatments", 1440),
    ("patient-consent", f"/patients/{PAT}?tab=consent", 1440),
    ("patient-appointments", f"/patients/{PAT}?tab=appointments", 1440),
    ("patient-edit", f"/patients/{PAT}?tab=edit", 1440),
    ("register", "/patients/new", 1440),
    ("appointments", "/appointments", 1440),
    ("staff", "/staff", 1440),
    ("audit", "/audit-log", 1440),
    ("backups", "/backups", 1440),
    ("book", f"/book?date={clinic_today()}", 1440),
]

# Things that are fine to find and must not be reported.
BENIGN = {"undefined", "null", "NaN", "false", "true", "0"}

SCRIPT = """
() => {
  const out = {leaks: [], unlabelled: [], smallTaps: [], overflow: null,
               dupIds: [], headings: [], emptyTables: 0, imgsNoAlt: 0,
               truncated: 0, text: document.body.innerText};
  const txt = document.body.innerText;

  // 1. Values that leaked from a broken render or a failed embed.
  for (const bad of ['undefined', 'NaN', '[object Object]', 'Invalid Date']) {
    if (txt.includes(bad)) {
      const i = txt.indexOf(bad);
      out.leaks.push({value: bad, context: txt.slice(Math.max(0,i-60), i+60).replace(/\\s+/g,' ')});
    }
  }

  // 2. Form controls with no programmatic label.
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (el.type === 'hidden') continue;
    const id = el.id;
    const lab = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (!lab && !el.getAttribute('aria-label') && !el.closest('label')) {
      out.unlabelled.push(el.tagName + (el.name ? '[' + el.name + ']' : ''));
    }
  }

  // 3. Tap targets smaller than the 44px guideline (mobile check only).
  for (const el of document.querySelectorAll('a, button, select, input[type=checkbox]')) {
    // A checkbox wrapped in a <label> is tapped via the label, so the label is
    // the real target -- measuring the raw 14px input box would be a false
    // positive.
    const target = (el.tagName === 'INPUT' && el.closest('label')) || el;
    const r = target.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).display === 'inline' && el.closest('p')) continue;
    if (r.height < 44 || r.width < 44) {
      out.smallTaps.push({tag: el.tagName, text: (el.innerText||'').trim().slice(0,28),
                          w: Math.round(r.width), h: Math.round(r.height)});
    }
  }

  // 4. Horizontal overflow — the classic mobile defect.
  const de = document.documentElement;
  out.overflow = de.scrollWidth > de.clientWidth + 1
    ? {scrollWidth: de.scrollWidth, clientWidth: de.clientWidth} : null;

  // 5. Duplicate DOM ids break label/for and aria references.
  const seen = {}, dups = [];
  for (const el of document.querySelectorAll('[id]')) {
    if (seen[el.id]) dups.push(el.id); else seen[el.id] = true;
  }
  out.dupIds = dups;

  // 6. Heading order, for screen-reader navigation.
  for (const h of document.querySelectorAll('h1,h2,h3,h4')) {
    out.headings.push({level: h.tagName, text: h.innerText.trim().slice(0,44)});
  }

  // 7. Empty tables (headers but no rows) usually mean a broken query.
  for (const t of document.querySelectorAll('table')) {
    if (t.querySelector('thead') && !t.querySelector('tbody tr')) out.emptyTables++;
  }

  // 8. Images with no alt attribute at all. alt="" is the correct way to mark
  //    a decorative image, so this checks for the attribute, not its content.
  out.imgsNoAlt = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length;

  // 9. Text visually clipped by overflow:hidden without an ellipsis.
  for (const el of document.querySelectorAll('td, p, span, h1, h2, h3')) {
    const cs = getComputedStyle(el);
    if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis'
        && el.scrollWidth > el.clientWidth + 2 && el.innerText.trim()) {
      out.truncated++;
    }
  }
  return out;
}
"""


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    report = {}
    with sync_playwright() as p:
        b = launch(p)
        pg = b.new_page(device_scale_factor=1)

        for name, path, width in PAGES:
            pg.set_viewport_size({"width": width, "height": 900})
            pg.goto(f"{BASE}{path}", wait_until="networkidle")
            pg.wait_for_timeout(600)
            d = pg.evaluate(SCRIPT)
            report[name] = d

            issues = []
            if d["leaks"]:
                issues.append(f"LEAK {len(d['leaks'])}")
            if d["overflow"]:
                issues.append(f"OVERFLOW {d['overflow']}")
            if d["unlabelled"]:
                issues.append(f"UNLABELLED {d['unlabelled']}")
            if d["dupIds"]:
                issues.append(f"DUP-IDS {d['dupIds'][:4]}")
            if d["emptyTables"]:
                issues.append(f"EMPTY-TABLE x{d['emptyTables']}")
            if d["imgsNoAlt"]:
                issues.append(f"IMG-NO-ALT x{d['imgsNoAlt']}")
            h1 = [h for h in d["headings"] if h["level"] == "H1"]
            if len(h1) != 1:
                issues.append(f"H1-COUNT {len(h1)}")
            flag = "OK  " if not issues else "!!  "
            print(f"{flag}{name:22} {'; '.join(issues) if issues else ''}")

        # Mobile pass for tap targets and overflow.
        print("\nMobile (390px):")
        for name, path, _ in PAGES:
            pg.set_viewport_size({"width": 390, "height": 844})
            pg.goto(f"{BASE}{path}", wait_until="networkidle")
            pg.wait_for_timeout(600)
            d = pg.evaluate(SCRIPT)
            report[f"mobile-{name}"] = d
            issues = []
            if d["overflow"]:
                issues.append(f"OVERFLOW {d['overflow']['scrollWidth']}>{d['overflow']['clientWidth']}")
            # WCAG 2.2 AA (2.5.8) sets 24x24 as the minimum target size and
            # exempts links inline in a sentence. 44x44 is the AAA/comfort
            # guideline, so below that we report a fail vs an advisory rather
            # than pretending every small inline link is a defect.
            fail = [t for t in d["smallTaps"] if t["h"] < 24 or t["w"] < 24]
            adv = [t for t in d["smallTaps"] if t not in fail]
            if fail:
                issues.append(f"TAP-FAIL x{len(fail)} e.g. {fail[0]}")
            if adv:
                issues.append(f"advisory x{len(adv)} (inline/wordmark, >=24px)")
            if d["leaks"]:
                issues.append(f"LEAK x{len(d['leaks'])}")
            flag = "OK  " if not issues else "!!  "
            print(f"{flag}{name:22} {'; '.join(issues) if issues else ''}")
        b.close()

    out = SHOTS / "audit.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"\nDetail -> {out}")


if __name__ == "__main__":
    main()
