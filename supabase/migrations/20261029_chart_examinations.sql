-- ---------------------------------------------------------------------------
-- DENTAL RECORD CHART  (Scope 4: the intraoral chart was never saved)
--
-- Until now `components/odontogram.tsx` kept every finding in React state and
-- rendered the same blank grid for every patient, so a charted examination
-- vanished on refresh and nothing carried into the next visit. This adds the
-- two tables the mockup's "What would be saved" panel always described:
--
--   chart_examinations  one row per visit (a dated snapshot)
--   chart_findings      one row per tooth + condition inside that snapshot
--
-- A snapshot per visit, rather than one mutable chart per patient, is what
-- lets the next visit open pre-filled from the last one while keeping every
-- earlier examination readable as it was recorded. Treatment records are not
-- copied in here: a finding is a diagnosis, a treatment is work performed, and
-- mixing them would rewrite history every time a restoration is completed.
-- ---------------------------------------------------------------------------

create table if not exists public.chart_examinations (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references public.patients(id) on delete cascade,
  -- The visit this chart belongs to. Nullable because a dentist may chart a
  -- walk-in that was never booked; validated against the patient in the RPC.
  appointment_id        uuid references public.appointments(id) on delete set null,
  branch_id             uuid not null references public.branches(id) on delete restrict,

  -- Clinical assessment fields. Codes are short labels, not free text, so the
  -- clinic can report on them later; the dropdowns in the UI supply them.
  periodontal_screening text,
  occlusion_class       text,
  overjet_mm            text,
  overbite              text,
  midline_deviation     boolean not null default false,
  crossbite             boolean not null default false,
  -- Fixed-shape jsonb so one migration does not have to precede every new
  -- appliance/TMD question the clinic asks.
  appliances            jsonb not null default
    '{"braces":false,"stayplate":false,"other":null}'::jsonb,
  tmd                   jsonb not null default
    '{"clenching":false,"clicking":false,"trismus":false,"muscle_spasm":false}'::jsonb,
  notes                 text,

  examined_by           uuid references public.staff(id) on delete set null,
  examined_at           timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists chart_examinations_patient_idx
  on public.chart_examinations (patient_id, examined_at desc);
create index if not exists chart_examinations_branch_idx
  on public.chart_examinations (branch_id);
create index if not exists chart_examinations_appointment_idx
  on public.chart_examinations (appointment_id);

drop trigger if exists chart_examinations_touch on public.chart_examinations;
create trigger chart_examinations_touch before update on public.chart_examinations
  for each row execute procedure public.touch_updated_at();

create table if not exists public.chart_findings (
  id             uuid primary key default gen_random_uuid(),
  examination_id uuid not null references public.chart_examinations(id) on delete cascade,
  -- FDI two-digit notation, restricted to teeth that actually exist:
  -- 11-18/21-28/31-38/41-48 permanent, 51-55/61-65/71-75/81-85 primary.
  tooth_fdi      text not null check (tooth_fdi ~
    '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'),
  -- Derived rather than trusted from the browser, so a miscoded tooth cannot
  -- claim to be permanent while sitting in the primary arch.
  tooth_type     text generated always as (
                   case when left(tooth_fdi, 1) in ('5', '6', '7', '8')
                     then 'primary' else 'permanent' end
                 ) stored,
  condition_code text not null check (condition_code in (
    'D', 'M', 'F', 'I', 'RF', 'MO', 'Im',                      -- condition
    'J', 'A', 'AB', 'P', 'In', 'Fx', 'S', 'Rm',                -- restoration
    'X', 'XO', 'Cm', 'Sp'                                      -- surgery
  )),
  -- Canonical order (B, M, O, D, L) is enforced by the validator; the check
  -- here only rejects anything that is not a surface letter.
  surfaces       text not null default '' check (surfaces ~ '^[BDLMO]{0,5}$'),
  comment        text,
  created_at     timestamptz not null default now(),
  -- One condition per tooth per visit: recording "D" twice is always a bug,
  -- and two rows would make the chart list the same decayed surface twice.
  unique (examination_id, tooth_fdi, condition_code)
);

create index if not exists chart_findings_examination_idx
  on public.chart_findings (examination_id);

-- ---------------------------------------------------------------------------
-- RLS: read at your branch, write only as dentist/admin. A secretary therefore
-- gets a read-only chart, which is what README and the SIPOC already promise.
-- ---------------------------------------------------------------------------
alter table public.chart_examinations enable row level security;
alter table public.chart_findings     enable row level security;

drop policy if exists chart_examinations_select_staff on public.chart_examinations;
create policy "chart_examinations_select_staff" on public.chart_examinations
  for select using (public.can_access_branch(branch_id));
drop policy if exists chart_examinations_insert_clinical on public.chart_examinations;
create policy "chart_examinations_insert_clinical" on public.chart_examinations
  for insert with check (public.can_write_clinical() and public.can_access_branch(branch_id));
drop policy if exists chart_examinations_update_clinical on public.chart_examinations;
create policy "chart_examinations_update_clinical" on public.chart_examinations
  for update using (public.can_write_clinical() and public.can_access_branch(branch_id))
  with check (public.can_write_clinical() and public.can_access_branch(branch_id));
drop policy if exists chart_examinations_delete_clinical on public.chart_examinations;
create policy "chart_examinations_delete_clinical" on public.chart_examinations
  for delete using (public.can_write_clinical());

-- Findings inherit their scope from the parent examination: they carry no
-- branch of their own, so an orphan finding can never be reachable.
drop policy if exists chart_findings_select_staff on public.chart_findings;
create policy "chart_findings_select_staff" on public.chart_findings
  for select using (exists (
    select 1 from public.chart_examinations e
    where e.id = examination_id and public.can_access_branch(e.branch_id)
  ));
drop policy if exists chart_findings_insert_clinical on public.chart_findings;
create policy "chart_findings_insert_clinical" on public.chart_findings
  for insert with check (
    public.can_write_clinical() and exists (
      select 1 from public.chart_examinations e
      where e.id = examination_id and public.can_access_branch(e.branch_id)
    )
  );
drop policy if exists chart_findings_update_clinical on public.chart_findings;
create policy "chart_findings_update_clinical" on public.chart_findings
  for update using (public.can_write_clinical())
  with check (
    public.can_write_clinical() and exists (
      select 1 from public.chart_examinations e
      where e.id = examination_id and public.can_access_branch(e.branch_id)
    )
  );
drop policy if exists chart_findings_delete_clinical on public.chart_findings;
create policy "chart_findings_delete_clinical" on public.chart_findings
  for delete using (public.can_write_clinical());

-- ---------------------------------------------------------------------------
-- One call writes the examination and its findings together.
--
-- Two separate inserts from supabase-js are two requests: if the second fails
-- the visit is left behind with no findings, and the chart then reads as "this
-- patient had nothing wrong" — the worst possible way to fail. SECURITY
-- INVOKER (the default) means RLS above still applies to every row this
-- function touches; it buys atomicity, not privilege.
-- ---------------------------------------------------------------------------
create or replace function public.save_chart_examination(
  p_patient     uuid,
  p_appointment uuid,
  p_branch      uuid,
  p_exam        jsonb,
  p_findings    jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
  f      jsonb;
begin
  -- An appointment id from the browser must belong to this patient, otherwise
  -- a chart could be attached to someone else's visit.
  if p_appointment is not null and not exists (
    select 1 from public.appointments a
    where a.id = p_appointment and a.patient_id = p_patient
  ) then
    raise exception 'That appointment does not belong to this patient.'
      using errcode = '23514';
  end if;

  insert into public.chart_examinations (
    patient_id, appointment_id, branch_id,
    periodontal_screening, occlusion_class, overjet_mm, overbite,
    midline_deviation, crossbite, appliances, tmd, notes,
    examined_by, created_by
  ) values (
    p_patient, p_appointment, p_branch,
    nullif(p_exam ->> 'periodontal_screening', ''),
    nullif(p_exam ->> 'occlusion_class', ''),
    nullif(p_exam ->> 'overjet_mm', ''),
    nullif(p_exam ->> 'overbite', ''),
    coalesce((p_exam ->> 'midline_deviation')::boolean, false),
    coalesce((p_exam ->> 'crossbite')::boolean, false),
    coalesce(p_exam -> 'appliances',
             '{"braces":false,"stayplate":false,"other":null}'::jsonb),
    coalesce(p_exam -> 'tmd',
             '{"clenching":false,"clicking":false,"trismus":false,"muscle_spasm":false}'::jsonb),
    nullif(p_exam ->> 'notes', ''),
    auth.uid(), auth.uid()
  ) returning id into new_id;

  for f in select * from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb))
  loop
    insert into public.chart_findings (
      examination_id, tooth_fdi, condition_code, surfaces, comment
    ) values (
      new_id,
      f ->> 'tooth_fdi',
      f ->> 'condition_code',
      coalesce(f ->> 'surfaces', ''),
      nullif(f ->> 'comment', '')
    );
  end loop;

  return new_id;
end;
$$;

revoke execute on function public.save_chart_examination(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_chart_examination(uuid, uuid, uuid, jsonb, jsonb)
  to authenticated;

comment on table public.chart_examinations is
  'One dated dental-chart snapshot per visit; the next visit opens pre-filled from the latest one.';
comment on table public.chart_findings is
  'Diagnoses charted on a tooth for one examination. Treatments live in treatment_records.';
