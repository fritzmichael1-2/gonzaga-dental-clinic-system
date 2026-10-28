-- ---------------------------------------------------------------------------
-- Consent records gain the evidence the e-signature form has been collecting
-- all along: the patient's initials, the patient/guardian signature and the
-- dentist's countersignature.
--
-- Why initials are ONE image plus one timestamp, not ten: the paper form has an
-- "Initial:" line under each of ten clauses. Auto-copying a signature into all
-- ten would make the record claim ten separate acknowledgements that never
-- happened — exactly the defect a reviewer looks for when consent is disputed.
-- The digitised form therefore asks the patient to initial once and applies it
-- to the page; `initialed_clause_count` records how many clauses were on screen
-- and `initialed_all_at` when they did it, so the record can be read honestly
-- as "initialled as a block".
--
-- Existing rows stay valid: they were recorded before drawn signatures existed,
-- so every new column is nullable and the paired constraints below only bite
-- when a column is actually filled in.
-- ---------------------------------------------------------------------------

alter table public.consent_records
  add column if not exists signature_patient_png  text,
  add column if not exists signature_dentist_png  text,
  add column if not exists initials_png           text,
  add column if not exists initialed_all_at       timestamptz,
  add column if not exists initialed_clause_count smallint,
  add column if not exists consent_meta           jsonb;

-- Same ceiling as patient_intake.signature_png: the client downsizes the canvas
-- before encoding, so a value approaching this is a bug rather than a signature.
alter table public.consent_records drop constraint if exists consent_signature_size;
alter table public.consent_records add constraint consent_signature_size check (
  (signature_patient_png is null or length(signature_patient_png) <= 1000000)
  and (signature_dentist_png is null or length(signature_dentist_png) <= 1000000)
  and (initials_png is null or length(initials_png) <= 300000)
);

-- The patient and the dentist sign the same sheet: one without the other is an
-- incomplete record. Both-null stays legal so pre-existing rows survive.
alter table public.consent_records drop constraint if exists consent_signatures_paired;
alter table public.consent_records add constraint consent_signatures_paired check (
  (signature_patient_png is null) = (signature_dentist_png is null)
);

-- An initials image with no time, or a time with no image, is a bug.
alter table public.consent_records drop constraint if exists consent_initials_paired;
alter table public.consent_records add constraint consent_initials_paired check (
  (initials_png is null) = (initialed_all_at is null)
);

comment on column public.consent_records.initialed_all_at is
  'When the patient initialled the whole clause list once (block initial).';
