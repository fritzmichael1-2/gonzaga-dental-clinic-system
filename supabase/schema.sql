-- =====================================================================
-- GONZAGA DENTAL CLINIC MANAGEMENT AUTOMATION SYSTEM (GDCMAS)
-- Supabase / Postgres schema
--
-- Run this whole file in the Supabase SQL editor (Dashboard > SQL > New query).
-- Seed data lives in seed.sql (run after this file).
--
-- Derived from the BAM-285 automation plan. Each block notes which
-- Statement-of-the-Problem item or Scope item it satisfies so the clinic can
-- verify the build against their own analysis.
--
-- NOTE: the plan states requirements are "subject to validation by the
-- clinic". Anything marked TODO(CLINIC) must be confirmed with Dr. Gonzaga
-- before this is treated as final.
-- =====================================================================

-- gen_random_uuid() + case-insensitive text + fuzzy name search
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;
-- Range types, needed for the double-booking exclusion constraint
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Shared helpers (updated_at)
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- BRANCHES  (Scope 2: centralized access across both branches)
-- Two rows seeded: Main Branch and Second Branch. Staff are assigned to a
-- home branch but the record itself is shared clinic-wide.
-- =====================================================================
create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  address     text,
  phone       text,
  -- TODO(CLINIC): confirm opening hours per branch.
  opens_at    time,
  closes_at   time,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists branches_touch on public.branches;
create trigger branches_touch before update on public.branches
  for each row execute procedure public.touch_updated_at();

-- =====================================================================
-- STAFF  (Scope 6: user and role management)
-- Patients are NOT users in this version: the plan keeps patient-facing
-- access out of the initial scope ("Any patient-facing access or digital
-- consent feature will depend on the clinic's final requirements").
--
-- Roles come straight from the stakeholder analysis matrix:
--   dentist   = Clinic Owner / Dentist  (Dr. Lezly S. Gonzaga)
--   secretary = Secretary / Clinic Staff (intake, consent, appointments)
--   admin     = System Administrator (proposed, if the clinic assigns one)
-- =====================================================================
create table if not exists public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       citext not null,
  full_name   text not null,
  role        text not null default 'secretary'
              check (role in ('dentist', 'secretary', 'admin')),
  branch_id   uuid references public.branches(id) on delete set null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (email)
);

create index if not exists staff_role_idx on public.staff (role);
create index if not exists staff_branch_idx on public.staff (branch_id);

drop trigger if exists staff_touch on public.staff;
create trigger staff_touch before update on public.staff
  for each row execute procedure public.touch_updated_at();

-- New auth users start INACTIVE with no clinical write access. An admin must
-- activate the account and assign the role (Scope 6). Bootstrapping the very
-- first admin is documented in seed.sql.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'secretary',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- This is a SECURITY DEFINER trigger that inserts into staff. PostgreSQL grants
-- EXECUTE to PUBLIC by default, so without this revoke any signed-in client
-- could call it directly and fabricate a staff row for themselves.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Role helpers. SECURITY DEFINER so they do not recurse through the staff RLS.
-- They return false unless the caller is an ACTIVE staff member.
create or replace function public.is_active_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active is true
  );
$$;

create or replace function public.current_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select s.role from public.staff s
  where s.id = auth.uid() and s.is_active is true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active is true and s.role = 'admin'
  );
$$;

-- Only the dentist records clinical treatment. Mirrors the SIPOC row where
-- the Dentist is the supplier who "reviews patient history and manually
-- updates treatment".
create or replace function public.can_write_clinical()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active is true and s.role in ('dentist', 'admin')
  );
$$;

-- ---------------------------------------------------------------------
-- BRANCH SCOPE
--
-- The clinic runs two branches with a secretary at each, so a secretary sees
-- only their own branch. The dentist treats at both branches and the admin
-- governs both, so those roles are clinic-wide.
--
-- SECURITY DEFINER because these read public.staff, whose own RLS would
-- otherwise recurse back into the policy being evaluated. Like the helpers
-- above they return false for anyone who is not active staff, so a missing
-- grant can never widen access.
-- ---------------------------------------------------------------------

-- The branch the caller is assigned to, or null when unassigned.
create or replace function public.staff_branch_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select s.branch_id
  from public.staff s
  where s.id = auth.uid() and s.is_active is true
$$;

-- True for roles that legitimately see the whole clinic.
create or replace function public.is_clinic_wide()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active is true
      and s.role in ('dentist', 'admin')
  )
$$;

-- The gate used by every branch-scoped policy.
create or replace function public.can_access_branch(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_clinic_wide()
      or (target is not null and target = public.staff_branch_id())
$$;

-- Staff, branches and settings stay clinic-wide on purpose: they are not
-- patient data, and the staff directory is needed by the "performed by"
-- picker and the branch filter on both of which branches legitimately appear.

-- =====================================================================
-- PATIENTS  (Scope 1: registration + searchable directory)
-- Scope 4 problem 4: duplicate records were created when staff could not
-- find an existing file. Mitigations here:
--   * patient_no is unique and sequential (replaces the labelled envelope)
--   * citext + pg_trgm indexes make "find that file" a search box, not a
--     cabinet browse
--   * find_potential_duplicates() warns at registration time
-- =====================================================================
create sequence if not exists public.patient_no_seq;

create table if not exists public.patients (
  id            uuid primary key default gen_random_uuid(),
  patient_no    text not null unique
                default 'GDC-' || to_char(now(), 'YYYY') || '-'
                         || lpad(nextval('public.patient_no_seq')::text, 4, '0'),
  last_name     citext not null,
  first_name    citext not null,
  middle_name   citext,
  suffix        text,
  nickname      text,
  birthdate     date,
  sex           text check (sex in ('male', 'female', 'other')),
  civil_status  text,
  contact_no    text,
  email         citext,
  address       text,
  emergency_contact_name text,
  emergency_contact_no   text,
  -- Intake / medical history from the paper intake form. Plain text on
  -- purpose: this is free-form clinical history, not a structured record.
  -- TODO(CLINIC): confirm which intake fields the clinic actually collects.
  allergies     text,
  medical_history text,
  medications   text,
  -- Home branch. Visits can still be recorded at either branch.
  branch_id     uuid references public.branches(id) on delete set null,
  status        text not null default 'active'
                check (status in ('active', 'archived')),
  archived_reason text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create index if not exists patients_last_name_idx  on public.patients (last_name);
create index if not exists patients_first_name_idx on public.patients (first_name);
create index if not exists patients_patient_no_idx on public.patients (patient_no);
create index if not exists patients_branch_idx     on public.patients (branch_id);
create index if not exists patients_status_idx     on public.patients (status);
-- Fuzzy surname match so staff can still find "Gonzlez" -> "Gonzales".
create index if not exists patients_last_name_trgm
  on public.patients using gin (last_name gin_trgm_ops);
create index if not exists patients_first_name_trgm
  on public.patients using gin (first_name gin_trgm_ops);

drop trigger if exists patients_touch on public.patients;
create trigger patients_touch before update on public.patients
  for each row execute procedure public.touch_updated_at();

-- Problem 4 guard: near-duplicate detection at registration. Case-insensitive
-- name match, birthdate only compared when the caller supplies one.
create or replace function public.find_potential_duplicates(
  p_last_name  text,
  p_first_name text,
  p_birthdate  date default null,
  p_limit      integer default 5
)
returns table (
  id          uuid,
  patient_no  text,
  last_name   text,
  first_name  text,
  middle_name text,
  birthdate   date,
  status      text
)
language sql
security definer
set search_path = public
stable
as $$
  -- SECURITY DEFINER bypasses RLS, so the active-staff check has to happen
  -- explicitly here. Without it, any signed-in-but-deactivated account could
  -- call this RPC and read back patient identifiers.
  select p.id, p.patient_no, p.last_name, p.first_name,
         p.middle_name, p.birthdate, p.status
  from public.patients p
  where public.is_active_staff()
    and p.last_name = p_last_name
    and p.first_name = p_first_name
    -- DOB is optional input. `p.birthdate = p_birthdate` is NULL (not true)
    -- when the caller supplies no birthdate, which would silently filter out
    -- every patient that *does* have one and defeat the duplicate warning.
    -- A stored record with no birthdate likewise cannot be ruled out.
    and (p_birthdate is null
         or p.birthdate is null
         or p.birthdate = p_birthdate)
  order by
    (case when p.birthdate is not null and p.birthdate = p_birthdate then 0 else 1 end),
    p.created_at desc
  limit greatest(p_limit, 1);
$$;

-- =====================================================================
-- PATIENT INTAKE  (Scope 1: the paper intake form, digitised)
-- One row per patient. Holds the answers the paper form asks for that are not
-- identity data (`patients`): religion, birthplace, insurance, guardian,
-- referring party, physician, the medical screening, the 36-condition
-- checklist, and the drawn signature.
--
-- Split of responsibility:
--   patients       — identity the app searches, sorts and links on
--   patient_intake — the form the patient actually fills in
--
-- `filled_by` and `signed_at` are deliberately separate: the secretary encodes
-- the form at the front desk, the patient (or guardian) signs it.
--
-- The block answers are jsonb because they mirror the printed form exactly and
-- are read as a block, never filtered on. TODO(CLINIC): if the clinic ever
-- reports on a single condition, promote it to its own column.
-- =====================================================================
create table if not exists public.patient_intake (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null unique
                      references public.patients(id) on delete cascade,
  branch_id           uuid references public.branches(id) on delete set null,

  -- 1. Patient information record (beyond what `patients` stores)
  religion            text,
  nationality         text,
  birthplace          text,
  occupation          text,
  home_no             text,
  office_no           text,
  fax_no              text,
  dental_insurance    text,
  insurance_effective date,

  -- For patients below 18
  guardian_name       text,
  guardian_occupation text,
  guardian_email      citext,

  referred_by         text,
  consultation_reason text,

  -- 2. Dental history
  previous_dentist        text,
  previous_dentist_office text,
  last_dental_visit       date,

  -- 3. Medical history
  physician         jsonb not null default '{}'::jsonb, -- name, specialty, office, phone
  screening         jsonb not null default '{}'::jsonb, -- q1..q7: answer + detail
  allergies         jsonb not null default '[]'::jsonb, -- checkboxes from the paper form
  allergy_other     text,
  bleeding_problems text check (bleeding_problems in ('yes', 'no')),
  bleeding_time     text,
  women_only        jsonb not null default '{}'::jsonb, -- pregnant, nursing, birth_control_pills
  blood_type        text,
  blood_pressure    text,
  conditions        jsonb not null default '[]'::jsonb, -- the 36-item checklist
  condition_other   text,
  notes             text,

  -- Signature. A drawn PNG as a data URL, capped so a misbehaving client
  -- cannot push a multi-megabyte row into the table. The client downsizes to
  -- a 600px-wide canvas before encoding, which lands around 20-60 KB.
  signature_png     text
                    check (signature_png is null or length(signature_png) <= 1000000),
  signed_at         timestamptz,
  filled_by         uuid references auth.users(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A signature is either complete (image + timestamp) or absent. Half a
  -- signature — an image with no time, or a time with no image — is a bug.
  constraint patient_intake_signature_complete check (
    (signature_png is null and signed_at is null)
    or (signature_png is not null and signed_at is not null)
  )
);

create index if not exists patient_intake_branch_idx
  on public.patient_intake (branch_id);

drop trigger if exists patient_intake_touch on public.patient_intake;
create trigger patient_intake_touch before update on public.patient_intake
  for each row execute procedure public.touch_updated_at();

-- =====================================================================
-- CONSENT RECORDS  (Scope 3: digital consent documentation)
-- Replaces the physically signed paper form inside the brown envelope.
-- The wording is stored per record (version) so the clinic can update the
-- consent text later without rewriting history.
-- =====================================================================
create table if not exists public.consent_records (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients(id) on delete restrict,
  consent_type      text not null default 'treatment'
                    check (consent_type in
                      ('treatment', 'privacy', 'surgery', 'orthodontic', 'other')),
  version           text not null default '1.0',
  body              text not null,
  -- TODO(CLINIC): confirm the exact consent wording and the version scheme.
  -- Signature capture (drawn signature vs typed name) is UNDECIDED in the
  -- plan; signed_by_name below is the typed-name minimum.
  signed_by_name    text not null,
  signed_by_relation text,
  signed_at         timestamptz not null default now(),
  branch_id         uuid not null references public.branches(id) on delete restrict,
  recorded_by       uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists consent_patient_idx on public.consent_records (patient_id, signed_at desc);
create index if not exists consent_branch_idx  on public.consent_records (branch_id);

-- =====================================================================
-- APPOINTMENTS  (Scope 5: scheduling + availability)
-- Replaces the paper logbook. Problem 5 in the plan is a risk of
-- double-booking, missed appointments and difficulty checking availability.
-- Double-booking is prevented in the DATABASE, not just the UI: see the
-- exclusion constraint below.
--
-- Declared before treatment_records because that table points back at it.
-- =====================================================================
create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete restrict,
  branch_id    uuid not null references public.branches(id) on delete restrict,
  -- References public.staff (not auth.users) so PostgREST can resolve the
  -- `staff (...)` embed in lib/queries.ts. staff.id itself cascades from
  -- auth.users, so auth integrity is still enforced transitively.
  dentist_id   uuid references public.staff(id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'scheduled'
               check (status in ('requested', 'scheduled', 'confirmed',
                                 'completed', 'cancelled', 'no_show')),
  reason       text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint appointments_time_valid check (ends_at > starts_at)
);

create index if not exists appointments_patient_idx on public.appointments (patient_id, starts_at desc);
create index if not exists appointments_branch_idx  on public.appointments (branch_id, starts_at);
create index if not exists appointments_starts_idx  on public.appointments (starts_at);
create index if not exists appointments_status_idx  on public.appointments (status);

drop trigger if exists appointments_touch on public.appointments;
create trigger appointments_touch before update on public.appointments
  for each row execute procedure public.touch_updated_at();

-- Problem 5 guard: one patient cannot hold two live appointments that overlap
-- in time. This is an exclusion constraint rather than a unique index on
-- (patient_id, starts_at) because a plain unique index would still allow
-- 10:00-10:30 and 10:15-10:45 to coexist. Cancelled/no-show rows are excluded
-- so the slot frees up, and '[)' ranges let consecutive visits abut.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_no_patient_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_patient_overlap
      exclude using gist (
        patient_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status in ('requested', 'scheduled', 'confirmed'));
  end if;
end;
$$;

-- Problem 5 guard: a dentist cannot be double-booked. Half-open ranges
-- ('[)') let a 10:00-10:30 slot be followed immediately by 10:30-11:00.
-- Wrapped in a DO block so the file stays re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_no_dentist_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_dentist_overlap
      exclude using gist (
        dentist_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (dentist_id is not null
             and status in ('requested', 'scheduled', 'confirmed'));
  end if;
end;
$$;

-- =====================================================================
-- CROSS-BRANCH PENDING GUARD
--
-- A patient may only hold live appointments at one branch at a time. If a
-- patient already has a pending (requested/scheduled/confirmed) appointment at
-- another branch, a new appointment for them is refused until that one is
-- settled (completed, cancelled, or marked no-show). This stops a patient
-- being booked into both desks at once and leaving one slot stranded.
--
-- Enforced in the database rather than the UI so every writer — the staff
-- booking form and the public self-booking RPC — is covered by the same rule.
--
-- SECURITY DEFINER: the check has to see the patient's appointments at the
-- other branch even when the caller is a branch-scoped secretary (or anon
-- through the public RPC) whom RLS would hide them from. Mirrors the reasoning
-- behind public.can_access_patient() below.
-- =====================================================================
create or replace function public.enforce_cross_branch_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflicting_branch text;
begin
  -- Only live rows block. A row moving to completed/cancelled/no_show must
  -- always pass so the pending appointment can actually be settled.
  if new.status not in ('requested', 'scheduled', 'confirmed') then
    return new;
  end if;

  select b.name
    into conflicting_branch
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.patient_id = new.patient_id
    and a.branch_id <> new.branch_id
    and a.status in ('requested', 'scheduled', 'confirmed')
    and a.id <> new.id
  limit 1;

  if conflicting_branch is not null then
    raise exception
      'This patient has a pending appointment at % that must be settled first.',
      conflicting_branch
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_cross_branch_pending on public.appointments;
create trigger appointments_cross_branch_pending
  before insert or update of patient_id, branch_id on public.appointments
  for each row execute procedure public.enforce_cross_branch_pending();

-- =====================================================================
-- TREATMENT RECORDS  (Scope 4: dental treatment history)
-- Replaces the index cards patients used to photograph for their own copy.
-- Scope 4 problem 6 is closed by giving each visit a structured row that is
-- printable/exportable instead of a handwritten card.
--
-- TODO(CLINIC): confirm the treatment-chart format and the procedure code
-- set (ADA/CDT or the clinic's own). procedure_code is nullable until then.
-- =====================================================================
create table if not exists public.treatment_records (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete restrict,
  appointment_id  uuid references public.appointments(id) on delete set null,
  branch_id       uuid not null references public.branches(id) on delete restrict,
  -- FDI two-digit notation: 11-18 adult upper right, 21-28 adult upper
  -- left, 31-38 lower left, 41-48 lower right, 51-85 primary.
  tooth_fdi       text,
  tooth_surfaces  text,
  procedure_code  text,
  procedure_name  text not null,
  notes           text,
  performed_by    uuid references public.staff(id) on delete set null,
  performed_at    timestamptz not null default now(),
  -- Ledger amounts. The balance bar on the treatment record reads these; until
  -- the clinic confirms how it bills (TODO(CLINIC)) they stay at zero rather
  -- than being absent, so the ledger never has to special-case a missing column.
  amount_charged  numeric(10,2) not null default 0
                  check (amount_charged >= 0),
  amount_paid     numeric(10,2) not null default 0
                  check (amount_paid >= 0),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists treatments_patient_idx
  on public.treatment_records (patient_id, performed_at desc);
create index if not exists treatments_branch_idx  on public.treatment_records (branch_id);
create index if not exists treatments_perf_at_idx on public.treatment_records (performed_at desc);

drop trigger if exists treatments_touch on public.treatment_records;
create trigger treatments_touch before update on public.treatment_records
  for each row execute procedure public.touch_updated_at();

-- =====================================================================
-- CLINIC SETTINGS  (single row)
-- Business hours drive the appointment grid; consent_template is the default
-- wording offered when staff record a new consent.
-- TODO(CLINIC): confirm hours, slot length, and the consent template text.
-- =====================================================================
create table if not exists public.clinic_settings (
  id                boolean primary key default true check (id),
  clinic_name       text not null default 'Gonzaga Dental Clinic',
  default_slot_min  integer not null default 30 check (default_slot_min between 5 and 480),
  -- One weekly opening-hours row per day: 0 = Sunday .. 6 = Saturday.
  opening_hours     jsonb not null default
    '{"0":null,"1":["09:00","18:00"],"2":["09:00","18:00"],"3":["09:00","18:00"],
      "4":["09:00","18:00"],"5":["09:00","18:00"],"6":["09:00","13:00"]}'::jsonb,
  consent_template  text not null default
    'I hereby consent to the dental examination and treatment described above, '
    || 'and acknowledge that the risks, alternatives, and expected costs have '
    || 'been explained to me.',
  updated_at        timestamptz not null default now()
);

insert into public.clinic_settings (id) values (true) on conflict (id) do nothing;

-- =====================================================================
-- BACKUP LOG  (Scope 7: backup planning)
-- Problem 3 in the plan: "no reported backup copy of the records". Supabase
-- gives continuous PITR on paid tiers; this table is the clinic-facing
-- record that a backup/restore drill actually happened, and who did it.
-- =====================================================================
create table if not exists public.backup_logs (
  id           uuid primary key default gen_random_uuid(),
  performed_by uuid references public.staff(id) on delete set null,
  performed_at timestamptz not null default now(),
  kind         text not null default 'manual_export'
               check (kind in ('manual_export', 'restore_drill', 'pitr_note')),
  -- Never store patient data in this column. Path or restore-point label only.
  reference    text,
  outcome      text not null default 'ok'
               check (outcome in ('ok', 'failed', 'partial')),
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists backup_logs_performed_idx on public.backup_logs (performed_at desc);

-- =====================================================================
-- AUDIT LOG  (Scope 7: basic audit logging)
-- Accountability for who viewed or changed a patient record. Written with the
-- service-role key from lib/security/audit.ts so an entry survives even when
-- RLS would reject the originating change.
-- =====================================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email citext,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx   on public.audit_logs (actor_id, created_at desc);

-- Defined down here rather than with the other helpers because it reads
-- public.appointments, which does not exist yet at that point in the file and
-- Postgres validates SQL function bodies on create.
--
-- The home branch is passed in rather than looked up, and that is deliberate.
-- An earlier version did `where p.id = target` against public.patients, which
-- silently broke INSERT ... RETURNING: returning makes Postgres apply the
-- SELECT policy as well as the INSERT one, and a row being inserted is not yet
-- visible to a nested read of its own table in the same statement. Every
-- patient registration would have failed. Taking branch_id from the row the
-- policy is already evaluating keeps this a pure predicate over that row plus
-- the appointment history, so it is true for a row mid-insert.
--
-- The appointment half is served by appointments_patient_idx.
create or replace function public.can_access_patient(target uuid, home_branch uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.can_access_branch(home_branch)
      or exists (
        select 1 from public.appointments a
        where a.patient_id = target and public.can_access_branch(a.branch_id)
      )
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
--
-- The plan's requirement is "centralized access to patient records for the
-- Main Branch and the Second Branch, with access restricted to authorized
-- users", and the clinic has since settled how "restricted" reads in practice:
-- one secretary per branch, each responsible for their own branch's desk.
--
-- So branch IS a visibility filter, with one deliberate exception:
--
--   * secretary -> only their assigned branch
--   * dentist    -> both branches (treats at both)
--   * admin      -> both branches (governs both)
--
-- The exception that matters is the patient. Someone registered at Main can
-- perfectly well book in at Second, and the secretary at Second has to be able
-- to open that record, so a patient is readable when their home branch is
-- accessible OR they have an appointment at an accessible branch
-- (public.can_access_patient). Without that, check-in would show an unknown
-- patient for a real, registered person.
--
-- staff, branches and clinic_settings stay clinic-wide on purpose: they are not
-- patient data, and the directory is needed by the "performed by" picker.
-- =====================================================================
alter table public.branches          enable row level security;
alter table public.staff             enable row level security;
alter table public.patients          enable row level security;
alter table public.consent_records   enable row level security;
alter table public.treatment_records enable row level security;
alter table public.appointments      enable row level security;
alter table public.clinic_settings   enable row level security;
alter table public.backup_logs       enable row level security;
alter table public.audit_logs        enable row level security;

-- branches: readable by active staff, managed by admin
drop policy if exists branches_select_staff on public.branches;
create policy "branches_select_staff" on public.branches
  for select using (public.is_active_staff());
drop policy if exists branches_write_admin on public.branches;
create policy "branches_write_admin" on public.branches
  for all using (public.is_admin()) with check (public.is_admin());

-- staff: read the directory (needed for the dentist picker); self-update is
-- deliberately NOT allowed -- an admin controls roles (Scope 6).
drop policy if exists staff_select_staff on public.staff;
create policy "staff_select_staff" on public.staff
  for select using (public.is_active_staff());
drop policy if exists staff_write_admin on public.staff;
create policy "staff_write_admin" on public.staff
  for all using (public.is_admin()) with check (public.is_admin());

-- patients: secretary and dentist both register and search. Archiving is
-- restricted to admin because it affects record integrity.
--
-- Branch-scoped: a secretary sees their own branch's patients, plus any patient
-- with an appointment at their branch (see can_access_patient).
drop policy if exists patients_select_staff on public.patients;
create policy "patients_select_staff" on public.patients
  for select using (public.can_access_patient(id, branch_id));
drop policy if exists patients_insert_staff on public.patients;
create policy "patients_insert_staff" on public.patients
  for insert with check (public.can_access_branch(branch_id));
drop policy if exists patients_update_staff on public.patients;
create policy "patients_update_staff" on public.patients
  for update using (public.can_access_patient(id, branch_id))
  with check (public.can_access_patient(id, branch_id));
drop policy if exists patients_archive_admin on public.patients;
create policy "patients_archive_admin" on public.patients
  for delete using (public.is_admin());

-- intake: readable and writable by exactly the staff who can see the patient
-- record it belongs to. No separate rule: if you cannot open the patient, you
-- cannot read their medical history either.
drop policy if exists patient_intake_select_staff on public.patient_intake;
create policy "patient_intake_select_staff" on public.patient_intake
  for select using (public.can_access_patient(patient_id, branch_id));
drop policy if exists patient_intake_insert_staff on public.patient_intake;
create policy "patient_intake_insert_staff" on public.patient_intake
  for insert with check (public.can_access_branch(branch_id));
drop policy if exists patient_intake_update_staff on public.patient_intake;
create policy "patient_intake_update_staff" on public.patient_intake
  for update using (public.can_access_patient(patient_id, branch_id))
  with check (public.can_access_patient(patient_id, branch_id));

-- consent: recorded by secretary or dentist, readable by active staff at that
-- branch. Scoped on the consent's own branch, which is where it was signed.
drop policy if exists consent_select_staff on public.consent_records;
create policy "consent_select_staff" on public.consent_records
  for select using (public.can_access_branch(branch_id));
drop policy if exists consent_write_staff on public.consent_records;
create policy "consent_write_staff" on public.consent_records
  for insert with check (public.can_access_branch(branch_id));
drop policy if exists consent_update_clinical on public.consent_records;
create policy "consent_update_clinical" on public.consent_records
  for update using (public.can_write_clinical())
  with check (public.can_write_clinical() and public.can_access_branch(branch_id));
drop policy if exists consent_delete_clinical on public.consent_records;
create policy "consent_delete_clinical" on public.consent_records
  for delete using (public.can_write_clinical());

-- treatments: readable at that branch, but only the dentist records or amends
-- clinical entries
drop policy if exists treatments_select_staff on public.treatment_records;
create policy "treatments_select_staff" on public.treatment_records
  for select using (public.can_access_branch(branch_id));
drop policy if exists treatments_insert_clinical on public.treatment_records;
create policy "treatments_insert_clinical" on public.treatment_records
  for insert with check (public.can_write_clinical() and public.can_access_branch(branch_id));
drop policy if exists treatments_update_clinical on public.treatment_records;
create policy "treatments_update_clinical" on public.treatment_records
  for update using (public.can_write_clinical() and public.can_access_branch(branch_id))
  with check (public.can_write_clinical() and public.can_access_branch(branch_id));
drop policy if exists treatments_delete_clinical on public.treatment_records;
create policy "treatments_delete_clinical" on public.treatment_records
  for delete using (public.can_write_clinical());

-- appointments: both roles manage the schedule, scoped to their branch. The
-- branch a secretarial role can book into is decided by the slot grid, which
-- is built from each branch's own hours, so this needs no extra UI.
drop policy if exists appointments_select_staff on public.appointments;
create policy "appointments_select_staff" on public.appointments
  for select using (public.can_access_branch(branch_id));
drop policy if exists appointments_insert_staff on public.appointments;
create policy "appointments_insert_staff" on public.appointments
  for insert with check (public.can_access_branch(branch_id));
drop policy if exists appointments_update_staff on public.appointments;
create policy "appointments_update_staff" on public.appointments
  for update using (public.can_access_branch(branch_id))
  with check (public.can_access_branch(branch_id));
drop policy if exists appointments_delete_staff on public.appointments;
create policy "appointments_delete_staff" on public.appointments
  for delete using (public.can_access_branch(branch_id));

-- settings: readable by staff so the slot grid and consent template work;
-- only admin changes them
drop policy if exists settings_select_staff on public.clinic_settings;
create policy "settings_select_staff" on public.clinic_settings
  for select using (public.is_active_staff());
drop policy if exists settings_write_admin on public.clinic_settings;
create policy "settings_write_admin" on public.clinic_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- backups and audit log: admin only (defense in depth)
drop policy if exists backups_select_admin on public.backup_logs;
create policy "backups_select_admin" on public.backup_logs
  for select using (public.is_admin());
drop policy if exists backups_write_admin on public.backup_logs;
create policy "backups_write_admin" on public.backup_logs
  for insert with check (public.is_admin());
drop policy if exists backups_update_admin on public.backup_logs;
create policy "backups_update_admin" on public.backup_logs
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists backups_delete_admin on public.backup_logs;
create policy "backups_delete_admin" on public.backup_logs
  for delete using (public.is_admin());

drop policy if exists audit_select_admin on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs
  for select using (public.is_admin());

-- =====================================================================
-- PUBLIC (PATIENT-FACING) RPCs
--
-- The patient booking page is unauthenticated. Rather than grant anon any
-- access to the tables, the whole public surface is these three SECURITY
-- DEFINER functions. They expose only what a walk-in patient already knows —
-- which branches exist, which times are free, and whether their own booking
-- was accepted — and never return a patient name, contact, or reason.
--
-- TODO(CLINIC): confirm that publishing per-branch availability is acceptable,
-- and add rate limiting / bot protection before going live. Self-booking
-- matches an existing patient on name + birthdate; that match is deliberately
-- conservative (more than one hit is refused rather than guessed).
-- =====================================================================
create or replace function public.public_branches()
returns table (id uuid, name text)
language sql
security definer
set search_path = public
stable
as $$
  select b.id, b.name
  from public.branches b
  where b.is_active
  order by b.name
$$;

create or replace function public.public_branch_availability(p_branch uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_branch   record;
  v_hours    jsonb;
  v_slot     integer;
  v_day_end  timestamptz;
  v_busy     jsonb;
begin
  select b.id, b.name, b.is_active into v_branch
  from public.branches b where b.id = p_branch;
  if not found or not v_branch.is_active then
    return jsonb_build_object('ok', false, 'message', 'Unknown branch.');
  end if;

  select cs.opening_hours, cs.default_slot_min into v_hours, v_slot
  from public.clinic_settings cs where cs.id = true;
  v_hours := v_hours -> (extract(dow from p_date))::int::text;
  v_slot  := coalesce(v_slot, 30);

  v_day_end := (p_date::timestamp at time zone 'Asia/Manila') + interval '1 day';

  -- Occupancy only: the shape of the free/occupied grid, never who is booked.
  select coalesce(jsonb_agg(jsonb_build_object(
           'start', to_char(a.starts_at at time zone 'Asia/Manila', 'HH24:MI'),
           'end',   to_char(a.ends_at   at time zone 'Asia/Manila', 'HH24:MI')
         ) order by a.starts_at), '[]'::jsonb)
    into v_busy
  from public.appointments a
  where a.branch_id = p_branch
    and a.status in ('requested', 'scheduled', 'confirmed')
    and a.starts_at < v_day_end
    and a.ends_at   > (p_date::timestamp at time zone 'Asia/Manila');

  return jsonb_build_object(
    'ok', true,
    'branch', jsonb_build_object('id', v_branch.id, 'name', v_branch.name),
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'open', v_hours is not null,
    'opensAt', case when v_hours is not null then v_hours ->> 0 end,
    'closesAt', case when v_hours is not null then v_hours ->> 1 end,
    'slotMin', v_slot,
    'busy', v_busy
  );
end;
$$;

create or replace function public.public_request_appointment(
  p_last_name  text,
  p_first_name text,
  p_birthdate  date,
  p_contact    text,
  p_branch     uuid,
  p_date       date,
  p_time       text,
  p_duration   integer default 30,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch    record;
  v_hours     jsonb;
  v_slot      integer := 30;
  v_start     timestamptz;
  v_patient   uuid;
  v_matches   integer;
  v_new       boolean := false;
begin
  if coalesce(btrim(p_last_name), '') = ''
     or coalesce(btrim(p_first_name), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Please enter your first and last name.');
  end if;
  if p_birthdate is null then
    return jsonb_build_object('ok', false, 'message', 'Please enter your date of birth.');
  end if;
  if coalesce(btrim(p_contact), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Please enter a contact number.');
  end if;
  if p_time !~ '^\d{2}:\d{2}$' then
    return jsonb_build_object('ok', false, 'message', 'Choose a time slot.');
  end if;

  select b.id, b.name, b.is_active into v_branch
  from public.branches b where b.id = p_branch;
  if not found or not v_branch.is_active then
    return jsonb_build_object('ok', false, 'message', 'Unknown branch.');
  end if;

  select cs.opening_hours, cs.default_slot_min into v_hours, v_slot
  from public.clinic_settings cs where cs.id = true;
  v_slot  := coalesce(v_slot, 30);
  v_hours := v_hours -> (extract(dow from p_date))::int::text;

  if v_hours is null then
    return jsonb_build_object('ok', false, 'message', 'The clinic is closed on that day.');
  end if;
  if p_time::time < (v_hours ->> 0)::time
     or (p_time::time + make_interval(mins => p_duration)) > (v_hours ->> 1)::time then
    return jsonb_build_object('ok', false, 'message', 'That time is outside the clinic hours.');
  end if;
  if ((extract(epoch from (p_time::time - (v_hours ->> 0)::time)) / 60)::int % v_slot) <> 0 then
    return jsonb_build_object('ok', false, 'message', 'Choose one of the listed time slots.');
  end if;

  v_start := (p_date::timestamp + p_time::time) at time zone 'Asia/Manila';
  if v_start <= now() then
    return jsonb_build_object('ok', false, 'message', 'That time has already passed.');
  end if;

  -- Resolve an existing record (open self-registration: create one if none).
  -- Two matches are ambiguous, so the request is refused rather than guessed.
  select count(*) into v_matches
  from public.patients p
  where lower(p.last_name)  = lower(btrim(p_last_name))
    and lower(p.first_name) = lower(btrim(p_first_name))
    and p.birthdate = p_birthdate
    and p.status = 'active';

  if v_matches > 1 then
    return jsonb_build_object('ok', false,
      'message', 'More than one record matches those details. Please contact the clinic to book.');
  elsif v_matches = 1 then
    select p.id into v_patient
    from public.patients p
    where lower(p.last_name)  = lower(btrim(p_last_name))
      and lower(p.first_name) = lower(btrim(p_first_name))
      and p.birthdate = p_birthdate
      and p.status = 'active'
    limit 1;
  else
    insert into public.patients (last_name, first_name, birthdate, contact_no, branch_id)
    values (btrim(p_last_name), btrim(p_first_name), p_birthdate, btrim(p_contact), p_branch)
    returning id into v_patient;
    v_new := true;
  end if;

  insert into public.appointments (patient_id, branch_id, starts_at, ends_at, status, reason)
  values (v_patient, p_branch, v_start,
          v_start + make_interval(mins => p_duration), 'requested', nullif(btrim(p_reason), ''));

  return jsonb_build_object(
    'ok', true,
    'message', 'Request received. The clinic will confirm your appointment.',
    'newPatient', v_new
  );

exception
  -- Slot taken by someone else between render and submit.
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'message', 'That slot was just taken. Please choose another time.');
  -- Same patient, same time.
  when unique_violation then
    return jsonb_build_object('ok', false, 'message', 'There is already an appointment at that time.');
  -- The cross-branch pending guard (and any other deliberate raise_exception).
  when raise_exception then
    return jsonb_build_object('ok', false, 'message', SQLERRM);
  when others then
    return jsonb_build_object('ok', false, 'message', 'Could not book that appointment. Please try again or call the clinic.');
end;
$$;

-- =====================================================================
-- GRANTS
-- anon gets no table access: the only public surface is the three
-- public_* functions above, which are SECURITY DEFINER.
-- =====================================================================
grant usage on schema public to authenticated;

grant select                              on public.branches          to authenticated;
grant select, insert, update              on public.branches          to authenticated;
grant delete                              on public.branches          to authenticated;

grant select                              on public.staff             to authenticated;
grant insert, update, delete              on public.staff             to authenticated;

grant select, insert, update              on public.patients          to authenticated;
grant delete                              on public.patients          to authenticated;

-- No delete grant on the intake: the row goes away with the patient.
grant select, insert, update              on public.patient_intake    to authenticated;

grant select, insert                      on public.consent_records   to authenticated;
grant update, delete                      on public.consent_records   to authenticated;

grant select                              on public.treatment_records to authenticated;
grant insert, update, delete              on public.treatment_records to authenticated;

grant select, insert, update, delete      on public.appointments      to authenticated;

grant select                              on public.clinic_settings   to authenticated;
grant insert, update                      on public.clinic_settings   to authenticated;

grant select, insert, update, delete      on public.backup_logs       to authenticated;

grant select                              on public.audit_logs        to authenticated;

grant execute on function public.is_active_staff()    to authenticated;
grant execute on function public.current_role()       to authenticated;
grant execute on function public.is_admin()           to authenticated;
grant execute on function public.can_write_clinical() to authenticated;
grant execute on function public.find_potential_duplicates(text, text, date, integer)
  to authenticated;

-- Branch-scope helpers are called from inside RLS policies, which are evaluated
-- for every request role. Postgres grants execute to PUBLIC by default, and
-- revoking it without regranting anon would turn "anon sees no rows" into
-- "anon gets a permission error", so the surface is spelled out: both request
-- roles may call these, and every one of them returns false for a caller who
-- is not active staff.
revoke execute on function public.staff_branch_id()    from public;
revoke execute on function public.is_clinic_wide()     from public;
revoke execute on function public.can_access_branch(uuid)  from public;
revoke execute on function public.can_access_patient(uuid, uuid) from public;
grant execute on function public.staff_branch_id()    to anon, authenticated;
grant execute on function public.is_clinic_wide()     to anon, authenticated;
grant execute on function public.can_access_branch(uuid)  to anon, authenticated;
grant execute on function public.can_access_patient(uuid, uuid) to anon, authenticated;

-- The public booking surface. Execute is revoked from PUBLIC first (Postgres
-- grants it by default) and then given only to anon, since the point is that a
-- signed-out patient may call exactly these three functions and nothing else.
-- The cross-branch trigger function is NOT callable directly.
revoke execute on function public.enforce_cross_branch_pending() from public;
revoke execute on function public.public_branches() from public;
revoke execute on function public.public_branch_availability(uuid, date) from public;
revoke execute on function public.public_request_appointment(text, text, date, text, uuid, date, text, integer, text) from public;
grant execute on function public.public_branches() to anon, authenticated;
grant execute on function public.public_branch_availability(uuid, date) to anon, authenticated;
grant execute on function public.public_request_appointment(text, text, date, text, uuid, date, text, integer, text) to anon, authenticated;

-- Keep the patient_no sequence moving and expose next-value to the DB only.
grant usage, select on sequence public.patient_no_seq to authenticated;