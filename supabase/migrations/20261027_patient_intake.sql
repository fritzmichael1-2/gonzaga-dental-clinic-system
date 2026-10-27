-- =====================================================================
-- Patient intake — the digital replacement for the paper intake form.
--
-- The paper form asks for far more than `patients` carries (religion,
-- birthplace, insurance, guardian, referring party, physician, the 7-question
-- medical screening, the 36-condition checklist, and a signature). Keeping
-- that in `patients` would bloat the row every query touches and make
-- `find_potential_duplicates()` slower for no benefit, so the intake answers
-- live here: one row per patient, created with the record.
--
-- Split of responsibility:
--   patients       — identity the app searches, sorts and links on
--   patient_intake — the form the patient actually fills in
--
-- `filled_by` and `signed_at` are deliberately separate: the secretary encodes
-- the form at the front desk, the patient (or guardian) signs it. Those are
-- two different people and the audit trail needs to say so.
--
-- The structured answers (screening, conditions, allergies, women-only) are
-- jsonb rather than columns because they mirror the printed form exactly and
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

-- The intake is readable and writable by exactly the staff who can see the
-- patient record it belongs to. No separate rule: if you cannot open the
-- patient, you cannot read their medical history either.
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

-- No delete grant: the row goes away with the patient (on delete cascade).
grant select, insert, update on public.patient_intake to authenticated;
