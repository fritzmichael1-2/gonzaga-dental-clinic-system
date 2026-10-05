-- =====================================================================
-- GONZAGA DENTAL CLINIC MANAGEMENT AUTOMATION SYSTEM (GDCMAS)
-- Seed data. Run AFTER schema.sql.
--
-- Branches and the clinic settings row are safe to run any time (idempotent).
--
-- BOOTSTRAPPING THE FIRST ADMIN
-- The on_auth_user_created trigger creates every staff row INACTIVE, and no
-- staff row is an admin yet, so nobody can manage accounts. Do this once:
--
--   1. Dashboard > Authentication > Users > Add user (email + password).
--      Every auth user gets an INACTIVE staff row via the trigger.
--   2. Run the promote function below with that exact email.
--
-- If the clinic decides NOT to appoint an administrator (the plan calls the
-- admin role "proposed, if assigned"), promote the dentist instead:
--
--   select public.promote_to_admin('dr.gonzaga@example.com', 'dentist');
--
-- TODO(CLINIC): confirm the dentist's real sign-in email and the secretary's.
-- The branch addresses/phones below are placeholders.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Branches — the plan states the clinic has exactly two
-- ---------------------------------------------------------------------
insert into public.branches (code, name, address, phone, opens_at, closes_at)
values
  ('MAIN', 'Main Branch',   'TODO(CLINIC): main branch address',   'TODO(CLINIC)', '09:00', '18:00'),
  ('SECOND', 'Second Branch','TODO(CLINIC): second branch address', 'TODO(CLINIC)', '09:00', '18:00')
on conflict (code) do update
  set name  = excluded.name,
      address = excluded.address,
      phone = excluded.phone;

-- ---------------------------------------------------------------------
-- Clinic settings — business hours + default consent wording
-- ---------------------------------------------------------------------
update public.clinic_settings set
  default_slot_min = 30,
  opening_hours = '{"0":null,"1":["09:00","18:00"],"2":["09:00","18:00"],
                    "3":["09:00","18:00"],"4":["09:00","18:00"],
                    "5":["09:00","18:00"],"6":["09:00","13:00"]}'::jsonb,
  consent_template =
    'I hereby consent to the dental examination and treatment described above, '
    'and acknowledge that the risks, alternatives, and expected costs have been '
    'explained to me. I authorize Gonzaga Dental Clinic to maintain my clinical '
    'record electronically and to share it between the Main Branch and the Second '
    'Branch for the purpose of continuity of care.'
where id = true;

-- ---------------------------------------------------------------------
-- First-admin bootstrap
-- Creates the function if it is missing. It refuses to run once any active
-- admin exists, so it cannot be used to escalate privileges later.
-- ---------------------------------------------------------------------
create or replace function public.promote_to_admin(p_email text, p_role text default 'admin')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if exists (
    select 1 from public.staff
    where role = 'admin' and is_active is true
  ) then
    raise exception 'An active admin already exists. Promote further accounts from the Staff page instead.';
  end if;

  if p_role not in ('admin', 'dentist') then
    raise exception 'p_role must be admin or dentist';
  end if;

  update public.staff
     set role = p_role, is_active = true, updated_at = now()
   where email = p_email
  returning id into v_id;

  if v_id is null then
    raise exception 'No staff row for %. Add the user in the Supabase Dashboard first (Authentication -> Users), then re-run this.', p_email;
  end if;

  return 'Promoted ' || p_email || ' to ' || p_role;
end;
$$;

-- CRITICAL: this is SECURITY DEFINER and PostgreSQL grants EXECUTE to PUBLIC by
-- default. Without the revoke below, any client that can reach PostgREST
-- (including an unauthenticated one) could call this RPC. It is safe only
-- while no admin exists, so a signed-up-but-inactive account could otherwise
-- promote itself before the clinic finishes bootstrapping.
--
-- Running it is therefore restricted to the SQL editor / service_role, by
-- which time the "an admin already exists" guard also blocks reuse.
revoke execute on function public.promote_to_admin(text, text)
  from public, anon, authenticated;

-- =====================================================================
-- OPTIONAL: demo patients + treatments, for local development only.
-- Run this block ONLY against a throwaway local database -- it inserts
-- fabricated patient identities.
-- =====================================================================
-- insert into public.patients
--   (last_name, first_name, birthdate, sex, contact_no, branch_id, allergies)
-- values
--   ('Dela Cruz', 'Juan', '1988-04-12', 'male',   '0917 000 0001',
--    (select id from public.branches where code = 'MAIN'), 'Penicillin'),
--   ('Reyes',     'Maria', '1995-09-03', 'female', '0917 000 0002',
--    (select id from public.branches where code = 'SECOND'), null);