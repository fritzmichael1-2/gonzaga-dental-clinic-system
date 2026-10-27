-- =====================================================================
-- Treatment ledger amounts.
--
-- `components/treatment-ledger.tsx` draws a running balance from each
-- treatment row, but the columns never existed, so the patient record failed
-- to type-check and the balance bar had nothing to read. They default to zero
-- rather than being nullable so the ledger never has to special-case a missing
-- amount.
--
-- TODO(CLINIC): confirm how the clinic actually bills (per procedure, per
-- visit, or not at all) before staff start entering figures.
-- =====================================================================
alter table public.treatment_records
  add column if not exists amount_charged numeric(10,2) not null default 0,
  add column if not exists amount_paid    numeric(10,2) not null default 0;

alter table public.treatment_records
  drop constraint if exists treatment_amounts_non_negative;

alter table public.treatment_records
  add constraint treatment_amounts_non_negative
  check (amount_charged >= 0 and amount_paid >= 0);
