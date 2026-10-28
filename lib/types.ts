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

/** One of the 7 "yes/no" screening questions on the paper intake form. */
export type IntakeAnswer = { answer: "yes" | "no" | null; detail: string | null };

export type IntakeScreening = Record<string, IntakeAnswer>;

export type IntakePhysician = {
  name: string | null;
  specialty: string | null;
  office: string | null;
  phone: string | null;
};

export type IntakeWomenOnly = {
  pregnant: "yes" | "no" | null;
  nursing: "yes" | "no" | null;
  pills: "yes" | "no" | null;
};

/**
 * The paper intake form, digitised. One row per patient, created with the
 * record. Mirrors `public.patient_intake` in supabase/schema.sql.
 */
export type PatientIntake = {
  id: string;
  patient_id: string;
  branch_id: string | null;

  religion: string | null;
  nationality: string | null;
  birthplace: string | null;
  occupation: string | null;
  home_no: string | null;
  office_no: string | null;
  fax_no: string | null;
  dental_insurance: string | null;
  insurance_effective: string | null;

  guardian_name: string | null;
  guardian_occupation: string | null;
  guardian_email: string | null;

  referred_by: string | null;
  consultation_reason: string | null;

  previous_dentist: string | null;
  previous_dentist_office: string | null;
  last_dental_visit: string | null;

  physician: IntakePhysician;
  screening: IntakeScreening;
  allergies: string[];
  allergy_other: string | null;
  bleeding_problems: "yes" | "no" | null;
  bleeding_time: string | null;
  women_only: IntakeWomenOnly;
  blood_type: string | null;
  blood_pressure: string | null;
  conditions: string[];
  condition_other: string | null;
  notes: string | null;

  signature_png: string | null;
  signed_at: string | null;
  filled_by: string | null;

  created_at: string;
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
  /** Drawn on the tablet; null on records made before the pads existed. */
  signature_patient_png: string | null;
  signature_dentist_png: string | null;
  /** One mark covering the whole clause list, not one per clause. */
  initials_png: string | null;
  initialed_all_at: string | null;
  initialed_clause_count: number | null;
  consent_meta: Record<string, unknown> | null;
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
  /** Staff member who typed the entry; `performed_by` is who did the work. */
  recorded_by: string | null;
  recorded_role: "dentist" | "secretary" | "admin" | null;
  amount_charged: number;
  amount_paid: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** One diagnosed tooth condition inside a chart examination. */
export type ChartFinding = {
  id: string;
  examination_id: string;
  tooth_fdi: string;
  /** Derived by the database from the FDI number, not sent by the browser. */
  tooth_type: "primary" | "permanent";
  condition_code: string;
  /** Canonical surface letters (B, M, O, D, L); empty means the whole tooth. */
  surfaces: string;
  comment: string | null;
  created_at: string;
};

export type ChartAppliances = {
  braces: boolean;
  stayplate: boolean;
  other: string | null;
};

export type ChartTmd = {
  clenching: boolean;
  clicking: boolean;
  trismus: boolean;
  muscle_spasm: boolean;
};

/** One dated dental-chart snapshot, recorded at a visit. */
export type ChartExamination = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  branch_id: string;
  periodontal_screening: string | null;
  occlusion_class: string | null;
  overjet_mm: string | null;
  overbite: string | null;
  midline_deviation: boolean;
  crossbite: boolean;
  appliances: ChartAppliances;
  tmd: ChartTmd;
  notes: string | null;
  examined_by: string | null;
  examined_at: string;
  /** Staff member who typed the chart; `examined_by` is the dentist. */
  recorded_by: string | null;
  recorded_role: "dentist" | "secretary" | "admin" | null;
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