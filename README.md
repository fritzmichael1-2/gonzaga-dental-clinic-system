# GDCMAS — Gonzaga Dental Clinic Management Automation System

Internal, staff-only system for a two-branch dental clinic. It replaces the
paper patient files, index cards, consent envelopes, and appointment book with
one centralised record set that both branches share.

> **Status:** development scaffold with placeholder clinic data. Nothing here has
> been reviewed by the clinic. See [Before going live](#before-going-live).

Built from the BPA-285 analysis in `GDCMAS-CHAPTER-1-3.pdf`. That document is a
planning study, not a validated specification — several decisions below are
marked `TODO(CLINIC)` and must be confirmed by the clinic itself.

## What it does

| Area | Capability |
| --- | --- |
| Patients | Digital intake form (the clinic's paper form, including medical screening and a drawn signature), duplicate detection before save, editable demographics, allergies alert |
| Consent | Versioned consent text captured per patient, with who recorded it |
| Treatment | FDI tooth chart, procedure codes, surfaces, who performed it and when |
| Appointments | Per-branch day view, slot generation from branch hours, live status changes, cross-branch pending guard |
| Patient booking | Public `/book` page: branch + date availability, self-booking captured as `requested` |
| Branches | Dentist/admin overview: each branch's counts, schedule, recent treatments, and open/closed status side by side |
| Staff | Roles (`dentist` / `secretary` / `admin`), activation, branch assignment |
| Governance | Append-only audit log, backup log |

Patients are **records, not logins.** Only clinic staff get accounts. A patient
can *request* an appointment from the public `/book` page (see
[Public patient booking](#public-patient-booking)), but that page has no account,
no session, and no read access to any patient record.

### The intake form

Registration is the clinic's paper intake form, digitised — the same sections in
the same order, including the seven medical-screening questions, the allergy
list, the 36-item condition checklist, the women-only block, and the signature
the patient draws on the tablet at the front desk.

The answers are stored in two places on purpose:

| Table | Holds | Why |
| --- | --- | --- |
| `patients` | Identity: name, birthdate, contact number, branch, plus an allergy / condition **summary** | Every list, search and duplicate check reads this row, so it stays small |
| `patient_intake` | The full form: religion, birthplace, insurance, guardian, physician, screening answers, checklist, signature | Read as a whole block when a clinician opens the record, never filtered on |

`patient_intake.filled_by` and `patient_intake.signed_at` are separate columns
because they are two different people: the secretary encodes the form, the
patient (or guardian) signs it. A row is constrained so a signature is either
complete — image and timestamp — or absent, never half of one.

The structured blocks are `jsonb`. They mirror the printed form exactly and are
read as a block, so a column per checkbox would only add migration work;
`TODO(CLINIC)` covers promoting one to its own column if the clinic ever reports
on it.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- Supabase (Postgres, GoTrue auth, RLS)
- Zod for server-action validation

## Deployment

For detailed setup and deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md). The guide covers prerequisites, environment configuration, Supabase database setup, authentication, building, and deployment to platforms like Vercel.

## Roles and permissions

Authorization is enforced in three independent layers, so a mistake in one does
not expose data:

1. **Proxy** (`proxy.ts`) — fast redirect if there is no auth session. This is
   a convenience check only, never the security boundary.
2. **Server** (`lib/security/session.ts`) — resolves the caller's `staff` row
   and reads `role` / `is_active` from the database. Never from user-editable
   auth metadata.
3. **Postgres RLS** — the real boundary. Every table has policies; the
   `authenticated` role cannot bypass them.

| | dentist | secretary | admin |
| --- | --- | --- | --- |
| Branches visible | both | own only | both |
| View patients | yes | own branch | yes |
| Create / edit patients | yes | own branch | yes |
| Book / update appointments | yes | own branch | yes |
| Record treatments, consents | yes | no | yes |
| Manage staff accounts | no | no | yes |
| Read audit log, backup log | no | no | yes |

A deactivated account (`is_active = false`) can sign in successfully but is
treated as signed out by layers 2 and 3, so it reaches no patient data. Every
new auth user starts inactive.

**Branch scoping** is enforced in the same RLS layer rather than in the UI.
`public.staff_branch_id()` reads the caller's own `staff.branch_id`,
`public.is_clinic_wide()` is true for dentists and admins, and
`public.can_access_branch()` / `public.can_access_patient()` gate rows on the
patients, appointments, treatment_records, and consent_records tables. A
secretary therefore cannot reach the other branch by guessing a URL or calling
PostgREST directly, and hiding the branch selector in a component would not have
been sufficient.

Two consequences worth knowing:

- A secretary can open a patient registered at the *other* branch only once that
  patient has an appointment at the secretary's own branch
  (`can_access_patient`). Creating that first cross-branch visit therefore needs a
  dentist or admin, because the secretary cannot discover the patient beforehand.
- A secretary with no `branch_id` assigned sees no clinical rows at all. An
  unassigned account is given no branch access rather than all of them, and the
  sidebar says so.

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase project

Create a project, then run `supabase/schema.sql` followed by
`supabase/seed.sql` in the SQL editor. Both files are **idempotent** — re-running
them is safe, which matters when iterating on the schema.

`seed.sql` inserts two placeholder branches and the clinic settings row. Branch
addresses and phones are `TODO(CLINIC)`.

### 3. Environment

```bash
cp .env.example .env.local
```

Fill in from Dashboard → Project Settings → API:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe for the browser)
- `SUPABASE_SERVICE_ROLE_KEY` (**server-only**; bypasses RLS — used solely for
  creating staff accounts)

### 4. First administrator

There is no self-signup by design, so the first account must be created by hand:

1. Dashboard → Authentication → Users → **Add user** (email + password). The
   `on_auth_user_created` trigger creates an inactive `staff` row.
2. Run the bootstrap function with that exact email:

   ```sql
   select public.promote_to_admin('you@example.com', 'admin');
   ```

   If the clinic decides not to appoint an administrator, promote the dentist
   instead (`'dentist'`).

Further accounts are created from the in-app **Staff** page.

## Preview mode

Preview mode renders every screen against fabricated sample data with **no
database and no Supabase project required**. It exists so the interface can be
reviewed, demoed and screenshotted before the clinic commits to a backend.

```bash
# .env.local
GDCMAS_PREVIEW=1
GDCMAS_PREVIEW_ROLE=admin          # admin | dentist | secretary
GDCMAS_PREVIEW_UNASSIGNED=0        # 1 = secretary with no branch assigned
```

Then `npm run dev`. A red banner reading *"PREVIEW MODE — all records shown are
fabricated sample data"* is shown on every authenticated screen, and the sidebar
reflects the chosen role so each role's navigation can be reviewed.

Each role is a distinct persona with its own name and navigation: `dentist` and
`admin` are clinic-wide, `secretary` is scoped to one branch. The mock also
applies that branch scoping (`scopeToBranch()` in `lib/preview/mock-supabase.ts`),
including the rule that a secretary may still reach a patient registered at
another branch once that patient has an appointment at theirs. Without it the
secretary preview showed every row in the clinic while the sidebar insisted they
saw one branch — the preview demonstrating the opposite of the security model it
exists to review.

Set `GDCMAS_PREVIEW_UNASSIGNED=1` to see a secretary with no branch at all: the
sidebar warning appears and every list renders empty, since an unassigned
secretary is granted no branch access rather than all of them. Note the preview
bypasses RLS by design, so these counts come from the mock rather than the
database; the real policies are covered by `scripts/pg-test.sh`.

The fabricated data is anchored to a **fixed instant** (`PREVIEW_ANCHOR_ISO` in
`lib/preview/clock.ts`, 2026-04-01 10:15 AM Manila) rather than `Date.now()`, so
screenshots and the walkthrough PDF are identical on every run. `clinicNow()`
reads that same anchor in preview mode — if it returned the real clock instead,
"today" would point at a day the fixtures never populated and every count and
schedule on the branch overview would render empty.

### Walkthrough artefacts

Three review artefacts are generated from the preview server, so none of them
need a database:

| Artefact | Command | Output |
| --- | --- | --- |
| Screenshot set | `npm run ui:shots` | 21 PNGs in `.ui-review/` |
| Layout audit | `npm run ui:audit` | `audit.json`, fails on overflow or page errors |
| PDF walkthrough | `npm run ui:pdf` | `docs/GDCMAS-UI-UX-Walkthrough.pdf` |
| Slide deck | `python3 scripts/ui-review/make_pptx.py` | `docs/GDCMAS-Project-Walkthrough.pptx` |
| Screen video | `python3 scripts/ui-review/record_walkthrough.py` | `docs/GDCMAS-Walkthrough-Video-<role>.mp4` |

Committed recordings: `-dentist.mp4` (includes the tap-to-chart interaction) and
`-secretary.mp4` (front-desk workflow, read-only chart). Both end on the public
`/book` page, the one surface with no account at all.

The video is Playwright's silent recording plus a caption overlay injected per
step, so it needs no narration. Run it with `--verify` to assert every caption
renders inside the recorded frame without producing a file. `make_pptx.py`
imports its screen content from `make_pdf.py`, so the deck and the PDF cannot
drift apart when a bullet is edited.

Both are persona-sensitive. The deck is built from the admin screenshot set. The
video records whichever role `GDCMAS_PREVIEW_ROLE` names and names the file
after it, because the tooth picker is dentist/admin-only (`canWrite` in
`app/(app)/patients/[id]/page.tsx`): a secretary recording shows the read-only
chart and says so, while a dentist recording performs the taps. A single
canonical filename would misrepresent whichever role was configured last.

Preview mode also skips `cookies()` on the authenticated routes, so a build made
with `GDCMAS_PREVIEW=1` prerenders them as static HTML. Never deploy such a
build: it must not reach a real Supabase project, and the prerendered markup
carries the preview identity.

**What preview mode is not:** sign-in, saving, and permission enforcement are not
exercised. Writes are rejected by the mock rather than stored, and RLS is never
consulted. It is for layout and copy review only — never for judging whether the
security model works.

To return to normal, delete both variables. Nothing else needs changing; the
preview seam is a single `createSupabaseServerClient()` branch, and the mock is
only constructed when the flag is set.

## UI/UX walkthrough

`docs/GDCMAS-UI-UX-Walkthrough.pdf` documents all 21 screens — one page per
screen with a screenshot and notes on what the screen does, who uses it and why
it is built the way it is, including the public `/book` page. It was generated
from preview mode, so every record in it is fabricated.

To regenerate it after changing the interface, start `npm run dev` with preview
mode enabled and run, in order:

```bash
npm run ui:shots   # screenshot every screen into .ui-review/ (gitignored)
npm run ui:audit   # headless UI checks: leaks, overflow, labels, tap targets
npm run ui:pdf     # rebuild docs/GDCMAS-UI-UX-Walkthrough.pdf
```

`ui:audit` is the one worth running in CI. It fails loudly on things that are
easy to miss by eye — a broken embed rendering as `undefined`, horizontal
overflow at phone width, an input with no label, or a tap target under the
WCAG 2.2 AA minimum of 24×24px (44×44px is treated as the comfort guideline, so
inline text links are reported as advisories rather than failures). It needs
`playwright` and `pillow` for Python.

Both scripts accept overrides via `GDCMAS_BASE_URL`, `GDCMAS_SHOTS_DIR` and
`GDCMAS_CHROME`.

## Form mockups

Four standalone HTML mockups of the clinic's paper forms, served from
`public/mockups/`. They are static files — no build step, no database
connection, placeholder data only — and every page is labelled `(DEMO)`.

| Mockup | URL | Who fills it |
| --- | --- | --- |
| Patient intake & medical history | `/mockups/intake-form.html` | Secretary encodes at the desk; patient or guardian signs |
| Informed consent | `/mockups/informed-consent.html` | Patient signs, secretary assists, dentist countersigns |
| Intraoral tooth chart (FDI) | `/mockups/index.html` | Dentist (a secretary may transcribe at dictation) |
| Treatment record | `/mockups/treatment-record.html` | Secretary and dentist both update; admin restores archived entries |

`/mockups` is listed in `PUBLIC_PATHS` in `proxy.ts`, so the pages open without
a staff session. See `docs/mockups/README.md` for the editing workflow.

## Verifying the security guarantees

```bash
bash scripts/pg-test.sh   # throwaway Postgres + schema + seed + smoke test
```

That script builds a disposable PostgreSQL cluster in `/tmp`, applies
`schema.sql` **twice** (the schema and seed are both idempotent and this proves
it), then runs `supabase/smoke-test.sql` and prints every intentional denial.
It needs a local `initdb`/`postgres` and no Supabase project. `scripts/pg-harness.sh`
underneath starts the cluster; `smoke-test.sql` is written against either that or
a Supabase SQL session.

The smoke test inserts deliberately conflicting rows, so it is only meaningful on
a fresh database — `pg-test.sh` always gives it one. Running it twice against the
same database makes the same guarantees fire a second time and the denial count
stops meaning anything.

It asserts, among other things:

- `anon` and unauthenticated requests are denied
- an inactive staff row sees zero patients
- a secretary cannot insert a treatment record
- a non-admin cannot modify the `staff` table (no self-promotion)
- a dentist cannot be double-booked, but back-to-back slots are allowed
- a patient cannot hold two overlapping live appointments
- a secretary sees only their own branch, and nothing at all when unassigned
- a dentist and an admin see both branches
- a patient registered at one branch is visible to the other branch's secretary
  once they have an appointment there
- cancelling an appointment frees the slot
- a patient with a pending appointment at one branch cannot be booked at the
  other branch until the first is settled
- `promote_to_admin` is not callable by clients at all
- deleting a patient with history is refused, not silently cascaded

Sections that expect a refusal continue past the failure on purpose, so read the
transcript rather than just the exit status.

## Scripts

```bash
npm run dev      # development server
npm run lint     # eslint
npm run build    # production build + type check
npm start        # serve the production build

bash scripts/pg-test.sh    # RLS + booking-constraint smoke test on throwaway Postgres
```

The screenshot, audit, and PDF commands (`ui:shots`, `ui:audit`, `ui:pdf`) are
documented under [UI/UX walkthrough](#uiux-walkthrough) above.

## Public patient booking

`/book` is the one unauthenticated surface. It is whitelisted in `proxy.ts` and
talks **only** to three anon-callable `SECURITY DEFINER` functions in
`schema.sql` — `public_branches()`, `public_branch_availability()` and
`public_request_appointment()`. The `anon` role has no table grants, so the page
can never read a patient row: it shows branch names and which slots are
occupied, then submits name + birthdate + contact and receives only an
accepted/refused verdict.

A self-booking is inserted as status `requested` for the clinic to confirm. The
database matches an existing record on name + birthdate, or creates one
("open self-registration"); two matches are refused rather than guessed.

### Cross-branch pending guard

A patient may hold only one live appointment across the clinic at a time. The
trigger `appointments_cross_branch_pending` (via
`public.enforce_cross_branch_pending()`) rejects a new appointment when the same
patient already has a `requested` / `scheduled` / `confirmed` appointment at a
**different** branch, until that one is settled (`completed`, `cancelled`, or
`no_show`). It is enforced in the database so the staff form and the public RPC
are covered by the same rule; the staff action also pre-checks it to name the
other branch in the message. `scripts/pg-test.sh` covers it.

## Theme

The palette is a set of CSS custom properties in `app/globals.css` (`:root`),
exposed to Tailwind via `@theme inline`, so every component uses semantic tokens
(`bg-brand`, `text-brand`, `ring-brand`). The brand is a gentle sage green
(`--brand #4a7a5c`) chosen to keep body text and button labels at WCAG AA
contrast on the near-white ground.

## Before going live

The following are deliberately unresolved and must not be treated as settled:

- **Clinic sign-off on scope.** The source document is an analysis, not an
  approved specification. Confirm what is actually wanted.
- **Consent wording and versioning** (`TODO(CLINIC)`), including whether
  signatures are drawn or typed.
- **Intake fields** — the form carries allergy, medical history, and medication
  fields that the clinic may not currently collect.
- **Real branch addresses, phones, and hours**, currently placeholders. The
  branch overview reads each branch's own `opens_at`/`closes_at`; the booking flow
  still uses the single clinic-wide `clinic_settings.opening_hours` map, so
  per-branch trading hours are not yet enforced when a slot is booked
  (`TODO(CLINIC)`).
- **Cross-branch booking workflow.** Because a secretary cannot see a patient
  registered at the other branch, the first visit for such a patient has to be
  created by a dentist or admin. Decide whether that is acceptable, or add an
  admin-mediated transfer/lookup path.
- **Duplicate-detection reach.** `find_potential_duplicates` runs as
  `SECURITY DEFINER` for any active staff member and matches on name/contact
  across the whole clinic, so it can surface that an identically-named patient
  exists at the other branch even though the record itself is not readable.
  Confirm that is acceptable, or scope it.
- **Clinic timezone.** Bookings are stored as `timestamptz` and every clinic-day
  calculation ("today", the 09:00 opening slot, the range a day is queried over,
  and the times shown in the UI) is anchored to `CLINIC_UTC_OFFSET_MINUTES` /
  `CLINIC_TIME_ZONE` in `lib/clinical/schedule.ts` and `lib/utils.ts`, both
  defaulting to Asia/Manila. This is deliberately **not** the server's
  timezone — on a UTC host that would book 9:00 AM as 5:00 PM. Confirm the
  clinic is in the Philippines and update the two constants if not; they must
  be changed together.
- **Backup strategy.** `backup_logs` is an audit trail of exports; it does not
  perform or schedule backups. Supabase PITR and an export policy still need to
  be agreed.
- **Retention and breach-notification policy** for patient records.
- **Public booking abuse controls.** `/book` is unauthenticated: `public_request_appointment` needs rate limiting and bot protection (and probably a captcha) before it is exposed to the internet, or it can be used to spam `requested` rows and create patient records.
- **Self-booking patient matching.** Matching on name + birthdate can attach a request to the wrong existing record; confirm with the clinic whether that is acceptable or a stronger identifier (patient_no, contact number, clinic-staff review) is required.
- **Public availability disclosure.** `/book` publishes per-branch occupancy. Confirm the clinic is comfortable exposing how full each branch is, or restrict the page to authenticated staff only.
- **Password rotation.** Staff accounts created from the Staff page are given an
  administrator-supplied password with no forced change.
- **Philippine Data Privacy Act** obligations. Out of scope for this scaffold.