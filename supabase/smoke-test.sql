-- =====================================================================
-- GDCMAS security + constraint smoke test.
-- Runs against a local Postgres that emulates Supabase's auth schema.
-- Not part of the deployment; kept so the guarantees can be re-verified.
-- =====================================================================

-- Each section that says "expect ERROR" deliberately continues past the
-- failure, so this script runs without ON_ERROR_STOP and the transcript is
-- reviewed afterwards. Every expected failure must appear as an ERROR.
\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------
-- Fixtures. Written to be re-runnable: the auth rows may already exist from a
-- previous run, in which case the on_auth_user_created trigger will not fire,
-- so the staff rows are upserted explicitly rather than relying on it.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'dentist@gdcmas.test',  '{}'),
  ('22222222-2222-2222-2222-222222222222', 'secretary@gdcmas.test','{}'),
  ('33333333-3333-3333-3333-333333333333', 'admin@gdcmas.test',    '{}'),
  ('44444444-4444-4444-4444-444444444444', 'pending@gdcmas.test',  '{}'),
  ('55555555-5555-5555-5555-555555555555', 'secretary2@gdcmas.test','{}'),
  ('66666666-6666-6666-6666-666666666666', 'unassigned@gdcmas.test','{}')
on conflict (id) do nothing;

\set MAIN_BRANCH '(select id from public.branches where code = ''MAIN'')'
\set SECOND_BRANCH '(select id from public.branches where code = ''SECOND'')'
\set DENTIST '11111111-1111-1111-1111-111111111111'
\set SECRETARY '22222222-2222-2222-2222-222222222222'
\set ADMIN '33333333-3333-3333-3333-333333333333'
\set PENDING '44444444-4444-4444-4444-444444444444'
\set SECRETARY2 '55555555-5555-5555-5555-555555555555'
\set UNASSIGNED '66666666-6666-6666-6666-666666666666'

-- One secretary per branch, which is how the clinic actually staffs the desks.
-- UNASSIGNED is deliberately active but has no branch: it must be locked out
-- rather than quietly given access to everything.
insert into public.staff (id, email, full_name, role, is_active, branch_id) values
  ('11111111-1111-1111-1111-111111111111', 'dentist@gdcmas.test',    'Dr. Dentist',   'dentist',   true, null),
  ('22222222-2222-2222-2222-222222222222', 'secretary@gdcmas.test',  'Sec Main',      'secretary', true, :MAIN_BRANCH),
  ('33333333-3333-3333-3333-333333333333', 'admin@gdcmas.test',      'Admin User',    'admin',     true, null),
  ('44444444-4444-4444-4444-444444444444', 'pending@gdcmas.test',    'Pending User',  'secretary', false, null),
  ('55555555-5555-5555-5555-555555555555', 'secretary2@gdcmas.test', 'Sec Second',    'secretary', true, :SECOND_BRANCH),
  ('66666666-6666-6666-6666-666666666666', 'unassigned@gdcmas.test', 'Sec No Branch', 'secretary', true, null)
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      is_active = excluded.is_active,
      branch_id = excluded.branch_id;

\echo '== 1. anon must see nothing =='
set role anon;
select count(*) as anon_patients from public.patients;            -- expect 0
select count(*) as anon_staff    from public.staff;               -- expect 0
select count(*) as anon_audit    from public.audit_logs;           -- expect 0
reset role;

\echo '== 2. unauthenticated authenticated-role must see nothing =='
set role authenticated;
set request.jwt.claim.sub = '';
select count(*) as no_jwt_patients from public.patients;           -- expect 0
reset role;

\echo '== 3. INACTIVE staff must be locked out (patient pending-activation) =='
set role authenticated;
set request.jwt.claim.sub = :'PENDING';
select count(*) as pending_patients from public.patients;          -- expect 0
reset role;

\echo '== 4. ACTIVE secretary: can register a patient =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
insert into public.patients (last_name, first_name, birthdate, contact_no, branch_id)
values ('Dela Cruz', 'Juan', '1988-04-12', '09170000001', :MAIN_BRANCH)
returning patient_no as generated_patient_no;
select count(*) as secretary_sees_patients from public.patients;   -- expect >= 1
reset role;

\echo '== 5. patient_no is sequential and unique =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
insert into public.patients (last_name, first_name, branch_id)
values ('Reyes', 'Maria', :MAIN_BRANCH)
returning patient_no as second_patient_no;
reset role;

\echo '== 6a. SECRETARY cannot record a treatment without naming a dentist =='
-- The clinical author is never inferred from whoever is signed in: an entry
-- with no `performed_by` has no dentist behind it and must be refused.
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
insert into public.treatment_records (patient_id, branch_id, procedure_name)
select id, branch_id, 'Unauthorized fill' from public.patients limit 1;
-- expect ERROR: new row violates row-level security policy
reset role;

\echo '== 6b. SECRETARY CAN transcribe a treatment on the dentist''s behalf =='
-- The clinic's dentist charts on paper, so the desk types it in. `performed_by`
-- stays the dentist; `recorded_by` is the person who typed it.
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
insert into public.treatment_records
  (patient_id, branch_id, procedure_name, tooth_fdi, performed_by, recorded_by, recorded_role)
select p.id, p.branch_id, 'Composite (dictated)', '16', :'DENTIST', :'SECRETARY', 'secretary'
from public.patients p order by p.created_at limit 1
returning performed_by as dentist, recorded_by as transcriber, recorded_role;
reset role;

\echo '== 6c. SECRETARY CAN transcribe a chart, but cannot rewrite who examined =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
insert into public.chart_examinations
  (patient_id, branch_id, examined_by, recorded_by, recorded_role, notes)
select p.id, p.branch_id, :'DENTIST', :'SECRETARY', 'secretary', 'Dictated from the paper chart'
from public.patients p order by p.created_at limit 1
returning examined_by as dentist, recorded_by as transcriber;   -- expect dentist / secretary
-- "Fix the typo" must not become "change who diagnosed it": the guard trigger
-- refuses any change to the attribution, even on the day it was entered.
update public.chart_examinations set examined_by = :'SECRETARY'
where recorded_role = 'secretary';
-- expect ERROR: the examining dentist and the entry date cannot be changed
reset role;

\echo '== 7. DENTIST CAN record a treatment =='
set role authenticated;
set request.jwt.claim.sub = :'DENTIST';
insert into public.treatment_records (patient_id, branch_id, procedure_name, tooth_fdi, performed_by)
select id, branch_id, 'Composite restoration', '16', :'DENTIST' from public.patients limit 1;
select count(*) as dentist_treatments from public.treatment_records; -- expect >= 1
reset role;

\echo '== 8. BRANCH ISOLATION: a secretary sees only their own branch =='
-- The secretary is posted to MAIN, so SECOND must come back with no patients
-- at all rather than a filtered subset they could infer from.
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
select b.name as visible_branch, count(p.id) as patients
from public.branches b
left join public.patients p on p.branch_id = b.id
group by b.name order by b.name;
select count(*) as second_branch_patients
from public.patients p
where p.branch_id = :SECOND_BRANCH;                          -- expect 0
reset role;

-- The mirror image: the second secretary must not see MAIN.
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY2';
select count(*) as main_branch_patients
from public.patients p
where p.branch_id = :MAIN_BRANCH;                            -- expect 0
reset role;

-- Dentist and admin are clinic-wide and must still see both.
set role authenticated;
set request.jwt.claim.sub = :'DENTIST';
select count(*) as dentist_sees_main from public.patients where branch_id = :MAIN_BRANCH;   -- expect >= 1
reset role;
set role authenticated;
set request.jwt.claim.sub = :'ADMIN';
select count(*) as admin_sees_main from public.patients where branch_id = :MAIN_BRANCH;     -- expect >= 1
reset role;

-- An active secretary with no branch assigned must be locked out entirely,
-- never treated as clinic-wide.
set role authenticated;
set request.jwt.claim.sub = :'UNASSIGNED';
select count(*) as unassigned_sees_patients from public.patients;   -- expect 0
select count(*) as unassigned_sees_appointments from public.appointments; -- expect 0
reset role;

\echo '== 9. duplicate-record detection =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
select count(*) as dupes_found from public.find_potential_duplicates('Dela Cruz', 'Juan', '1988-04-12');
select count(*) as dupes_for_unrelated_person from public.find_potential_duplicates('Santos', 'Pedro', null);
reset role;

\echo '== 10. DOUBLE-BOOKING: same dentist, DIFFERENT patients, overlapping time =='
-- Uses two distinct patients so only the dentist constraint can be the cause.
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
insert into public.appointments (patient_id, branch_id, dentist_id, starts_at, ends_at, status)
select id, branch_id, :'DENTIST', '2026-03-02 09:00:00+00', '2026-03-02 09:30:00+00', 'scheduled'
from public.patients order by created_at limit 1;

insert into public.appointments (patient_id, branch_id, dentist_id, starts_at, ends_at, status)
select id, branch_id, :'DENTIST', '2026-03-02 09:15:00+00', '2026-03-02 09:45:00+00', 'scheduled'
from public.patients order by created_at desc limit 1;
-- expect ERROR: violates exclusion constraint "appointments_no_dentist_overlap"
reset role;

\echo '== 11. back-to-back booking IS allowed (half-open ranges) =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
insert into public.appointments (patient_id, branch_id, dentist_id, starts_at, ends_at, status)
select id, branch_id, :'DENTIST', '2026-03-02 09:30:00+00', '2026-03-02 10:00:00+00', 'scheduled'
from public.patients order by created_at desc limit 1;
select count(*) as adjacent_ok from public.appointments;
reset role;

\echo '== 12. cancelling frees the slot =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
update public.appointments set status='cancelled'
where starts_at = '2026-03-02 09:00:00+00';
insert into public.appointments (patient_id, branch_id, dentist_id, starts_at, ends_at, status)
select id, branch_id, :'DENTIST', '2026-03-02 09:00:00+00', '2026-03-02 09:30:00+00', 'scheduled'
from public.patients order by created_at limit 1;
select count(*) as refreed_slot_booked from public.appointments
where starts_at = '2026-03-02 09:00:00+00';
reset role;

\echo '== 13. one patient cannot hold two OVERLAPPING live appointments =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
insert into public.appointments (patient_id, branch_id, starts_at, ends_at, status)
select patient_id, branch_id, '2026-03-05 10:00:00+00', '2026-03-05 10:30:00+00', 'scheduled'
from public.appointments where starts_at='2026-03-02 09:00:00+00' limit 1;

-- Partial overlap (10:15-10:45) must also be refused; this is the case a plain
-- unique index on (patient_id, starts_at) would have silently allowed.
insert into public.appointments (patient_id, branch_id, starts_at, ends_at, status)
select patient_id, branch_id, '2026-03-02 09:15:00+00', '2026-03-02 09:45:00+00', 'scheduled'
from public.appointments where starts_at='2026-03-02 09:00:00+00' limit 1;
-- expect ERROR: violates exclusion constraint "appointments_no_patient_overlap"

-- A genuinely later visit for the same patient is fine.
insert into public.appointments (patient_id, branch_id, starts_at, ends_at, status)
select patient_id, branch_id, '2026-03-09 09:00:00+00', '2026-03-09 09:30:00+00', 'scheduled'
from public.appointments where starts_at='2026-03-02 09:00:00+00' limit 1;
reset role;

\echo '== 13b. CROSS-BRANCH PATIENT: registered at MAIN, booked in at SECOND =='
-- The exception that keeps the front desk working. A patient whose home branch
-- is MAIN books an appointment at SECOND; the SECOND secretary must be able to
-- open that record to check them in, while still not being able to browse MAIN.
-- Book them into SECOND as the SECOND secretary. The insert copies the
-- patient's home branch, which the SECOND secretary cannot write to, so the
-- appointment is created by the dentist (clinic-wide) instead.
set role authenticated;
set request.jwt.claim.sub = :'DENTIST';
-- The cross-branch guard (section 22) refuses a SECOND booking while the
-- patient still has a live appointment at MAIN, so settle that patient's MAIN
-- rows first. This section is about record *visibility*, not timing.
update public.appointments set status = 'completed'
where patient_id = (
        select id from public.patients
        where branch_id = :MAIN_BRANCH order by created_at limit 1
      )
  and status in ('requested', 'scheduled', 'confirmed');

insert into public.appointments (patient_id, branch_id, dentist_id, starts_at, ends_at, status)
select id, :SECOND_BRANCH, :'DENTIST', '2026-03-11 09:00:00+00', '2026-03-11 09:30:00+00', 'scheduled'
from public.patients where branch_id = :MAIN_BRANCH order by created_at limit 1;
reset role;

set role authenticated;
set request.jwt.claim.sub = :'SECRETARY2';
-- The appointment itself is visible (it is at their branch)...
select count(*) as second_sees_visit
from public.appointments where branch_id = :SECOND_BRANCH;    -- expect >= 1
-- ...and the embedded patient resolves instead of coming back null.
select p.last_name as second_sees_patient
from public.appointments a join public.patients p on p.id = a.patient_id
where a.branch_id = :SECOND_BRANCH limit 1;
-- ...but MAIN's patients with no SECOND visit stay hidden.
select count(*) as second_still_cannot_browse_main
from public.patients p
where p.branch_id = :MAIN_BRANCH
  and not exists (select 1 from public.appointments a
                  where a.patient_id = p.id and a.branch_id = :SECOND_BRANCH);
reset role;

\echo '== 14. SECRETARY must NOT read the audit log or backups =='
-- Seed one audit row as service_role (the service key), so "sees nothing"
-- below proves RLS filtering rather than an empty table.
insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
values (:'DENTIST', 'patient.view', 'patient', gen_random_uuid(), '{}'::jsonb);

set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
select count(*) as secretary_audit from public.audit_logs;   -- expect 0
select count(*) as secretary_backups from public.backup_logs; -- expect 0
reset role;

\echo '== 15. SECRETARY must NOT modify the staff table (no self-promotion) =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
update public.staff set role='admin' where id = :'SECRETARY';
-- expect ERROR: violates row-level security policy
reset role;

\echo '== 16. ADMIN can read audit log and manage staff =='
set role authenticated;
set request.jwt.claim.sub = :'ADMIN';
select count(*) as admin_audit_visible from public.audit_logs; -- expect 1
update public.staff set full_name = 'Renamed Admin' where id = :'ADMIN';
select full_name as admin_renamed from public.staff where id = :'ADMIN';
reset role;

\echo '== 15b. staff table has no UPDATE policy for non-admins (silent 0 rows) =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
update public.staff set full_name = 'Hacked' where id = :'SECRETARY';
select full_name as secretary_name_unchanged from public.staff where id = :'SECRETARY';
reset role;

\echo '== 17. deleted patient cascades are RESTRICTed, not silent =='
set role authenticated;
set request.jwt.claim.sub = :'ADMIN';
delete from public.patients where first_name = 'Juan';
-- expect ERROR: update or delete on table violates foreign key constraint
select count(*) as juan_still_present from public.patients where first_name = 'Juan';
reset role;

\echo '== 18. promote_to_admin refuses once an admin exists =='
select public.promote_to_admin('pending@gdcmas.test', 'admin');
-- expect ERROR: An active admin already exists

\echo '== 19. bootstrap RPC is NOT callable by clients =='
set role authenticated;
set request.jwt.claim.sub = :'PENDING';
select public.promote_to_admin('pending@gdcmas.test', 'admin');
-- expect ERROR: permission denied for function promote_to_admin
reset role;

set role anon;
select public.promote_to_admin('pending@gdcmas.test', 'admin');
-- expect ERROR: permission denied for function promote_to_admin
reset role;

\echo '== 20. inactive staff cannot enumerate patients via the duplicate RPC =='
set role authenticated;
set request.jwt.claim.sub = :'PENDING';
select count(*) as pending_rpc_leak from public.find_potential_duplicates('Dela Cruz', 'Juan', null);
-- expect 0 even though a matching patient exists
reset role;

\echo '== 21. active staff still can, and the guard is not over-broad =='
set role authenticated;
set request.jwt.claim.sub = :'SECRETARY';
select count(*) as secretary_rpc_ok from public.find_potential_duplicates('Dela Cruz', 'Juan', null);
reset role;

\echo ''
\echo '== 22. CROSS-BRANCH: a pending appointment elsewhere blocks a new booking =='
-- A fresh patient (no history) so the guard, not an overlap constraint, is
-- what fires below.
set role authenticated;
set request.jwt.claim.sub = :'DENTIST';
insert into public.patients (last_name, first_name, birthdate, branch_id)
values ('Cruz', 'Lina', '1990-01-05', :MAIN_BRANCH)
returning id as xbranch_patient \gset

-- A live appointment at MAIN.
insert into public.appointments (patient_id, branch_id, starts_at, ends_at, status)
values (:'xbranch_patient', :MAIN_BRANCH, '2026-04-01 09:00:00+08', '2026-04-01 09:30:00+08', 'scheduled');

-- Booking at the OTHER branch must be refused by the trigger.
insert into public.appointments (patient_id, branch_id, starts_at, ends_at, status)
values (:'xbranch_patient', :SECOND_BRANCH, '2026-04-02 09:00:00+08', '2026-04-02 09:30:00+08', 'scheduled');
-- expect ERROR: has a pending appointment at Main Branch that must be settled first

-- Settling the MAIN appointment (completed) frees cross-branch booking.
update public.appointments set status = 'completed'
where patient_id = :'xbranch_patient' and branch_id = :MAIN_BRANCH;

insert into public.appointments (patient_id, branch_id, starts_at, ends_at, status)
values (:'xbranch_patient', :SECOND_BRANCH, '2026-04-02 09:00:00+08', '2026-04-02 09:30:00+08', 'scheduled');

select count(*) as cross_branch_after_settle
from public.appointments where patient_id = :'xbranch_patient';   -- expect 2
reset role;

\echo ''
\echo '== 23. PUBLIC RPCs: anon can view occupancy and self-book, but read no tables =='
-- Next Monday: in the future (so the function's "already passed" guard passes)
-- and a day the clinic is open.
select to_char((date_trunc('week', now()) + interval '7 days')::date, 'YYYY-MM-DD') as pub_date \gset
-- Resolve the branch id as a literal: under `anon`, RLS hides the branches
-- table, so passing the `(select id ...)` subquery would send null.
select id as main_id from public.branches where code = 'MAIN' \gset
set role anon;
set request.jwt.claim.sub = '';   -- clear any claim left by an earlier section
select count(*) as anon_public_branches from public.public_branches();   -- expect 2
select (public.public_branch_availability(:'main_id'::uuid, :'pub_date'::date) ->> 'ok') as avail_ok;      -- expect true
select (public.public_branch_availability(:'main_id'::uuid, :'pub_date'::date) ->> 'open') as avail_open;  -- expect true
select public.public_request_appointment(
         'Bautista', 'Ana', date '1994-02-02', '09170000009',
         :'main_id'::uuid, :'pub_date'::date, '10:00', 30, 'Consultation'
       ) ->> 'ok' as public_booking_ok;                                  -- expect true
-- The whole point: anon still cannot read the tables it just wrote through.
select count(*) as anon_still_no_patients from public.patients;          -- expect 0
reset role;

-- The request landed, as staff can see.
set role authenticated;
set request.jwt.claim.sub = :'DENTIST';
select a.status as request_status, a.reason as request_reason
from public.appointments a
where a.branch_id = :'main_id'::uuid
  and a.starts_at = (:'pub_date'::date + time '10:00') at time zone 'Asia/Manila';  -- expect requested / Consultation
reset role;
set request.jwt.claim.sub = '';

\echo ''
\echo '== RESULT: reached the end of the script =='