-- ---------------------------------------------------------------------------
-- RECORDING ON THE DENTIST'S BEHALF  (secretary transcription)
--
-- The clinic runs with an "old school" dentist who charts on paper, so the
-- secretary has to be able to type the visit into the system. The clinical
-- author must still be the dentist: a secretary can transcribe a diagnosis or a
-- treatment, never author one.
--
-- Two columns appear on each table, matching the split `consent_records` already
-- uses (`signed_by_name` + `recorded_by`):
--
--   examined_by / performed_by  who examined or did the work  (the dentist)
--   recorded_by                 who typed the row                (any staff)
--   recorded_role               that person's role at the time
--
-- `created_by` keeps its audit meaning (the auth user that inserted the row);
-- `recorded_by` is the staff row, which is what the UI can join back to a name.
--
-- A secretary may also correct her own typing, but only on the same clinic day
-- (measured from `created_at`) and only for her own branch. After that the
-- snapshot is frozen and a correction needs the dentist or an admin. That is
-- enough to fix a mistyped tooth without letting a saved visit be rewritten
-- weeks later.
-- ---------------------------------------------------------------------------

alter table public.chart_examinations
  add column if not exists recorded_by   uuid references public.staff(id) on delete set null,
  add column if not exists recorded_role text
    check (recorded_role in ('dentist', 'secretary', 'admin'));

alter table public.treatment_records
  add column if not exists recorded_by   uuid references public.staff(id) on delete set null,
  add column if not exists recorded_role text
    check (recorded_role in ('dentist', 'secretary', 'admin'));

create index if not exists chart_examinations_recorded_idx
  on public.chart_examinations (recorded_by);
create index if not exists treatments_recorded_idx
  on public.treatment_records (recorded_by);

-- Rows written before this migration have no transcriber. `created_by` is the
-- auth user id, and `staff.id` mirrors it, so the answer is recoverable where a
-- staff row exists. Both tables are empty in practice; this is for safety.
update public.chart_examinations e
   set recorded_by = e.created_by,
       recorded_role = s.role
  from public.staff s
 where s.id = e.created_by and e.recorded_by is null;
update public.treatment_records t
   set recorded_by = t.created_by,
       recorded_role = s.role
  from public.staff s
 where s.id = t.created_by and t.recorded_by is null;

-- ---------------------------------------------------------------------------
-- Who may be named as the clinical author for a given branch.
--
-- The contract: an active dentist assigned to that branch, or an active
-- clinic-wide dentist (`branch_id is null`). A dentist tied to another branch is
-- never eligible, so a secretary cannot attribute work to a colleague who was
-- not there.
-- ---------------------------------------------------------------------------
create or replace function public.can_record_for_dentist(p_dentist uuid, p_branch uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
    where s.id = p_dentist
      and s.role = 'dentist'
      and s.is_active is true
      and (s.branch_id is null or s.branch_id = p_branch)
  );
$$;

-- "This chart is the caller's own entry and still editable today." Used by the
-- policies below and by nothing else; returns a boolean, so definer rights are
-- harmless.
create or replace function public.can_amend_own_chart(p_examination uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.chart_examinations e
    where e.id = p_examination
      and e.recorded_by = auth.uid()
      and e.recorded_role = 'secretary'
      and public.can_access_branch(e.branch_id)
      and (e.created_at at time zone 'Asia/Manila')::date
          = (now() at time zone 'Asia/Manila')::date
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: insert may name a dentist instead of being one. Update and delete stay
-- clinical, plus the narrow same-day self-correction above.
-- ---------------------------------------------------------------------------
drop policy if exists chart_examinations_insert_clinical on public.chart_examinations;
create policy "chart_examinations_insert_clinical" on public.chart_examinations
  for insert with check (
    public.can_access_branch(branch_id)
    and (
      public.can_write_clinical()
      or (
        public.current_role() = 'secretary'
        and public.can_record_for_dentist(examined_by, branch_id)
      )
    )
  );

drop policy if exists chart_examinations_update_clinical on public.chart_examinations;
create policy "chart_examinations_update_clinical" on public.chart_examinations
  for update
  using (
    (public.can_write_clinical() and public.can_access_branch(branch_id))
    or public.can_amend_own_chart(id)
  )
  with check (
    (public.can_write_clinical() and public.can_access_branch(branch_id))
    or public.can_amend_own_chart(id)
  );

drop policy if exists chart_examinations_delete_clinical on public.chart_examinations;
create policy "chart_examinations_delete_clinical" on public.chart_examinations
  for delete using (
    public.can_write_clinical() or public.can_amend_own_chart(id)
  );

-- A secretary may correct her own typing, but not the attribution: the dentist
-- named on the saved chart, the transcriber, the branch and the entry day are
-- all frozen. Otherwise "fix the typo" could quietly reassign who diagnosed it
-- or restart the same-day window.
create or replace function public.guard_secretary_chart_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.recorded_role = 'secretary' then
    if new.examined_by  is distinct from old.examined_by
       or new.recorded_by is distinct from old.recorded_by
       or new.recorded_role is distinct from old.recorded_role
       or new.branch_id is distinct from old.branch_id
       or new.created_at is distinct from old.created_at then
      raise exception
        'A transcription can be corrected, but the examining dentist and the entry date cannot be changed.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists chart_examinations_guard_secretary on public.chart_examinations;
create trigger chart_examinations_guard_secretary
  before update on public.chart_examinations
  for each row execute procedure public.guard_secretary_chart_update();

-- Findings follow their parent: the dentist keeps the blanket policy, a
-- secretary only touches findings inside a chart she entered today. She can
-- therefore never append findings to the dentist's own examination.
drop policy if exists chart_findings_insert_clinical on public.chart_findings;
create policy "chart_findings_insert_clinical" on public.chart_findings
  for insert with check (
    exists (
      select 1 from public.chart_examinations e
      where e.id = examination_id and public.can_access_branch(e.branch_id)
    )
    and (public.can_write_clinical() or public.can_amend_own_chart(examination_id))
  );

drop policy if exists chart_findings_update_clinical on public.chart_findings;
create policy "chart_findings_update_clinical" on public.chart_findings
  for update
  using (public.can_write_clinical() or public.can_amend_own_chart(examination_id))
  with check (
    exists (
      select 1 from public.chart_examinations e
      where e.id = examination_id and public.can_access_branch(e.branch_id)
    )
    and (public.can_write_clinical() or public.can_amend_own_chart(examination_id))
  );

drop policy if exists chart_findings_delete_clinical on public.chart_findings;
create policy "chart_findings_delete_clinical" on public.chart_findings
  for delete using (
    public.can_write_clinical() or public.can_amend_own_chart(examination_id)
  );

-- Treatments: same insert exception, same clinical-only update/delete.
drop policy if exists treatments_insert_clinical on public.treatment_records;
create policy "treatments_insert_clinical" on public.treatment_records
  for insert with check (
    public.can_access_branch(branch_id)
    and (
      public.can_write_clinical()
      or (
        public.current_role() = 'secretary'
        and public.can_record_for_dentist(performed_by, branch_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Writing a chart: the caller now supplies the dentist ("Examined by") and the
-- visit date ("Examined on"). The date is a clinic day stored at 12:00 clinic
-- time so it neither displays as midnight nor drifts to the previous day in
-- UTC. `created_at` remains the moment it was typed — the honest difference
-- between the visit and the late entry.
--
-- The old 5-argument signature is dropped so there is exactly one function and
-- no ambiguity about which overload PostgREST resolves.
-- ---------------------------------------------------------------------------
drop function if exists public.save_chart_examination(uuid, uuid, uuid, jsonb, jsonb);

create or replace function public.save_chart_examination(
  p_patient     uuid,
  p_appointment uuid,
  p_branch      uuid,
  p_exam        jsonb,
  p_findings    jsonb,
  p_examined_by uuid,
  p_examined_at timestamptz
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

  -- A visit that has not happened yet is a plan, not a record.
  if p_examined_at is not null
     and (p_examined_at at time zone 'Asia/Manila')::date
         > (now() at time zone 'Asia/Manila')::date then
    raise exception 'The examination date cannot be in the future.'
      using errcode = '23514';
  end if;

  insert into public.chart_examinations (
    patient_id, appointment_id, branch_id,
    periodontal_screening, occlusion_class, overjet_mm, overbite,
    midline_deviation, crossbite, appliances, tmd, notes,
    examined_by, examined_at, created_by, recorded_by, recorded_role
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
    coalesce(p_examined_by, auth.uid()),
    coalesce(p_examined_at, now()),
    auth.uid(), auth.uid(), public.current_role()
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

revoke execute on function public.save_chart_examination(uuid, uuid, uuid, jsonb, jsonb, uuid, timestamptz)
  from public, anon;
grant execute on function public.save_chart_examination(uuid, uuid, uuid, jsonb, jsonb, uuid, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Correcting a chart that was entered earlier the same day.
--
-- The whole snapshot is rewritten in one transaction: the examination fields
-- are updated and its findings replaced. RLS still applies to every row, and
-- the guard trigger above refuses any change to the attribution. A dentist or
-- admin may call the same function on any chart at any time (their existing
-- policies still allow it).
-- ---------------------------------------------------------------------------
create or replace function public.update_chart_examination(
  p_examination uuid,
  p_exam        jsonb,
  p_findings    jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  f jsonb;
begin
  update public.chart_examinations set
    periodontal_screening = nullif(p_exam ->> 'periodontal_screening', ''),
    occlusion_class       = nullif(p_exam ->> 'occlusion_class', ''),
    overjet_mm            = nullif(p_exam ->> 'overjet_mm', ''),
    overbite              = nullif(p_exam ->> 'overbite', ''),
    midline_deviation     = coalesce((p_exam ->> 'midline_deviation')::boolean, false),
    crossbite             = coalesce((p_exam ->> 'crossbite')::boolean, false),
    appliances            = coalesce(p_exam -> 'appliances',
                                '{"braces":false,"stayplate":false,"other":null}'::jsonb),
    tmd                   = coalesce(p_exam -> 'tmd',
                                '{"clenching":false,"clicking":false,"trismus":false,"muscle_spasm":false}'::jsonb),
    notes                 = nullif(p_exam ->> 'notes', '')
  where id = p_examination;

  if not found then
    raise exception 'That examination can no longer be corrected.'
      using errcode = '42501';
  end if;

  delete from public.chart_findings where examination_id = p_examination;

  for f in select * from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb))
  loop
    insert into public.chart_findings (
      examination_id, tooth_fdi, condition_code, surfaces, comment
    ) values (
      p_examination,
      f ->> 'tooth_fdi',
      f ->> 'condition_code',
      coalesce(f ->> 'surfaces', ''),
      nullif(f ->> 'comment', '')
    );
  end loop;

  return p_examination;
end;
$$;

revoke execute on function public.update_chart_examination(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_chart_examination(uuid, jsonb, jsonb) to authenticated;

comment on column public.chart_examinations.recorded_by is
  'Staff member who typed the examination. `examined_by` is the dentist who authored it.';
comment on column public.chart_examinations.recorded_role is
  'Role of the transcriber at entry time; a secretary may self-correct only on the same clinic day.';
comment on column public.treatment_records.recorded_by is
  'Staff member who typed the treatment entry. `performed_by` is the dentist who did the work.';
comment on column public.treatment_records.recorded_role is
  'Role of the transcriber at entry time.';
