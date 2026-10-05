/**
 * Row types mirroring supabase/schema.sql. Kept hand-written (no codegen yet)
 * because the schema is still being validated with the clinic — run
 * `npx supabase gen types typescript` once the schema is signed off.
 */

export type StaffRole = "dentist" | "secretary" | "admin";

export type Branch = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  opens_at: string | null;
  closes_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Staff = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PatientStatus = "active" | "archived";

export type Patient = {
  id: string;
  patient_no: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  suffix: string | null;
  nickname: string | null;
  birthdate: string | null;
  sex: "male" | "female" | "other" | null;
  civil_status: string | null;
  contact_no: string | null;
  email: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_no: string | null;
  allergies: string | null;
  medical_history: string | null;
  medications: string | null;
  branch_id: string | null;
  status: PatientStatus;
  archived_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

export type ConsentType =
  | "treatment"
  | "privacy"
  | "surgery"
  | "orthodontic"
  | "other";

export type ConsentRecord = {
  id: string;
  patient_id: string;
  consent_type: ConsentType;
  version: string;
  body: string;
  signed_by_name: string;
  signed_by_relation: string | null;
  signed_at: string;
  branch_id: string;
  recorded_by: string | null;
  created_at: string;
};

export type TreatmentRecord = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  branch_id: string;
  tooth_fdi: string | null;
  tooth_surfaces: string | null;
  procedure_code: string | null;
  procedure_name: string;
  notes: string | null;
  performed_by: string | null;
  performed_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentStatus =
  | "requested"
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type Appointment = {
  id: string;
  patient_id: string;
  branch_id: string;
  dentist_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClinicSettings = {
  id: boolean;
  clinic_name: string;
  default_slot_min: number;
  opening_hours: Record<string, [string, string] | null>;
  consent_template: string;
  updated_at: string;
};

export type BackupLog = {
  id: string;
  performed_by: string | null;
  performed_at: string;
  kind: "manual_export" | "restore_drill" | "pitr_note";
  reference: string | null;
  outcome: "ok" | "failed" | "partial";
  notes: string | null;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
};

/** Appointment statuses that still occupy a slot. Mirrors the SQL predicate. */
export const LIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "requested",
  "scheduled",
  "confirmed",
];