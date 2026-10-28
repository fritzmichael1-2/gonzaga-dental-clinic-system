import "server-only";
import { z } from "zod";

/**
 * Format-validators only. Enumerating them in one module keeps the intake
 * form and the API route in sync, so a field can never be accepted by one and
 * rejected by the other.
 *
 * TODO(CLINIC): the plan flags required patient fields, consent wording and
 * appointment rules as unconfirmed. Anything marked TODO(CLINIC) below is a
 * sensible default, not a client requirement.
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const namesSchema = z
  .string()
  .trim()
  .min(2, "Name is too short")
  .max(80)
  .regex(/^[\p{L}\p{N}' .-]+$/u, "Name contains invalid characters");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+()\-\s]{7,20}$/, "Enter a valid contact number")
  .optional()
  .nullable()
  .or(z.literal(""));

export const emailSchema = z.string().trim().toLowerCase().email("Invalid email");

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72)
  .regex(/[A-Z]/, "Needs an uppercase letter")
  .regex(/[a-z]/, "Needs a lowercase letter")
  .regex(/[0-9]/, "Needs a number")
  .regex(/[^A-Za-z0-9]/, "Needs a special character");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(72),
});

// ---------------------------------------------------------------------
// Patient registration — the digital intake form
// ---------------------------------------------------------------------
export const patientSchema = z.object({
  last_name: namesSchema,
  first_name: namesSchema,
  middle_name: trimmed(80).optional().nullable(),
  suffix: trimmed(10).optional().nullable(),
  nickname: trimmed(60).optional().nullable(),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal(""))
    .refine((v) => {
      if (!v) return true;
      const d = new Date(v);
      // Reject future dates and anyone older than 120 — catches typos.
      return d < new Date() && d.getFullYear() > new Date().getFullYear() - 120;
    }, "Birthdate is not valid"),
  sex: z.enum(["male", "female", "other"]).optional().nullable().or(z.literal("")),
  civil_status: trimmed(40).optional().nullable(),
  contact_no: phoneSchema,
  email: z.union([emailSchema, z.literal("")]).optional().nullable(),
  address: trimmed(300).optional().nullable(),
  emergency_contact_name: trimmed(80).optional().nullable(),
  emergency_contact_no: phoneSchema,
  allergies: trimmed(1000).optional().nullable(),
  medical_history: trimmed(2000).optional().nullable(),
  medications: trimmed(1000).optional().nullable(),
  branch_id: z.string().uuid("Choose a branch").optional().nullable(),
});

export type PatientInput = z.infer<typeof patientSchema>;

// ---------------------------------------------------------------------
// Patient intake (Scope 1) — the paper intake form, digitised.
//
// The block answers (screening, allergies, conditions, women-only, physician)
// arrive as JSON strings in hidden inputs because they are built client-side
// by the yes/no toggles and the checkbox grids. Each one is re-validated here
// so a tampered payload degrades to the empty default instead of failing the
// whole registration — losing the free-text fields would be worse than losing
// one checkbox.
// ---------------------------------------------------------------------
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

const intakeAnswerSchema = z.object({
  answer: z.enum(["yes", "no"]).nullable().default(null),
  detail: trimmed(300).nullable().default(null),
});

const physicianSchema = z.object({
  name: trimmed(80).nullable().default(null),
  specialty: trimmed(80).nullable().default(null),
  office: trimmed(160).nullable().default(null),
  phone: trimmed(20).nullable().default(null),
});

const womenOnlySchema = z.object({
  pregnant: z.enum(["yes", "no"]).nullable().default(null),
  nursing: z.enum(["yes", "no"]).nullable().default(null),
  pills: z.enum(["yes", "no"]).nullable().default(null),
});

export const EMPTY_PHYSICIAN: z.infer<typeof physicianSchema> = {
  name: null,
  specialty: null,
  office: null,
  phone: null,
};

export const EMPTY_WOMEN_ONLY: z.infer<typeof womenOnlySchema> = {
  pregnant: null,
  nursing: null,
  pills: null,
};

/** Parse a JSON-encoded hidden input, falling back to `fallback` if unusable. */
function jsonField<T>(schema: z.ZodType<T>, fallback: T) {
  return z
    .string()
    .optional()
    .transform((raw): T => {
      if (!raw) return fallback;
      try {
        const out = schema.safeParse(JSON.parse(raw));
        return out.success ? out.data : fallback;
      } catch {
        return fallback;
      }
    });
}

const yesNo = z.enum(["yes", "no"]).optional().nullable().or(z.literal(""));

export const intakeSchema = z.object({
  // 1. Patient information record
  religion: trimmed(60).optional().nullable(),
  nationality: trimmed(60).optional().nullable(),
  birthplace: trimmed(120).optional().nullable(),
  occupation: trimmed(80).optional().nullable(),
  home_no: phoneSchema,
  office_no: phoneSchema,
  fax_no: phoneSchema,
  dental_insurance: trimmed(120).optional().nullable(),
  insurance_effective: optionalDate,
  guardian_name: trimmed(80).optional().nullable(),
  guardian_occupation: trimmed(80).optional().nullable(),
  guardian_email: z.union([emailSchema, z.literal("")]).optional().nullable(),
  referred_by: trimmed(120).optional().nullable(),
  consultation_reason: trimmed(200).optional().nullable(),

  // 2. Dental history
  previous_dentist: trimmed(80).optional().nullable(),
  previous_dentist_office: trimmed(160).optional().nullable(),
  last_dental_visit: optionalDate,

  // 3. Medical history
  physician: jsonField(physicianSchema, EMPTY_PHYSICIAN),
  screening: jsonField(
    z.record(z.string(), intakeAnswerSchema),
    {} as Record<string, z.infer<typeof intakeAnswerSchema>>
  ),
  allergies: jsonField(z.array(trimmed(60)).max(20), [] as string[]),
  allergy_other: trimmed(120).optional().nullable(),
  bleeding_problems: yesNo,
  bleeding_time: trimmed(120).optional().nullable(),
  women_only: jsonField(womenOnlySchema, EMPTY_WOMEN_ONLY),
  blood_type: trimmed(10).optional().nullable(),
  blood_pressure: trimmed(20).optional().nullable(),
  conditions: jsonField(z.array(trimmed(80)).max(50), [] as string[]),
  condition_other: trimmed(120).optional().nullable(),
  notes: trimmed(1000).optional().nullable(),

  // Signature — a PNG data URL drawn on the tablet at the front desk.
  signature_png: z
    .string()
    .max(1_000_000, "Signature image is too large")
    .refine(
      (v) => v === "" || v.startsWith("data:image/png;base64,"),
      "Signature must be a PNG image"
    )
    .optional(),
});

export type IntakeInput = z.infer<typeof intakeSchema>;


// ---------------------------------------------------------------------
// Consent (Scope 3)
// ---------------------------------------------------------------------
/** A PNG data URL drawn on the tablet, or absent — never an arbitrary string. */
const pngDataUrl = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} image is too large`)
    .refine(
      (v) => v === "" || v.startsWith("data:image/png;base64,"),
      `${label} must be a PNG image`
    )
    .optional();

export const consentSchema = z.object({
  patient_id: z.string().uuid(),
  consent_type: z.enum(["treatment", "privacy", "surgery", "orthodontic", "other"]),
  version: trimmed(20).default("1.0"),
  body: z.string().trim().min(20, "Consent text is missing").max(20_000),
  signed_by_name: namesSchema,
  signed_by_relation: trimmed(60).optional().nullable(),
  branch_id: z.string().uuid(),

  // E-signature evidence, captured with components/signature-pad.tsx.
  signature_patient_png: pngDataUrl(1_000_000, "Patient signature"),
  signature_dentist_png: pngDataUrl(1_000_000, "Dentist signature"),
  // One mark for the whole clause list — see the migration comment: ten copies
  // of one signature would claim ten acknowledgements that never happened.
  initials_png: pngDataUrl(300_000, "Initials"),
  initialed_clause_count: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .nullable(),

  // Browser/device context, stored verbatim for the audit trail.
  consent_meta: trimmed(2_000).optional().nullable(),
});

// ---------------------------------------------------------------------
// Treatment chart entry (Scope 4)
// tooth_fdi is validated against real FDI notation so a typo cannot silently
// create an unsearchable record.
// ---------------------------------------------------------------------
export const treatmentSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().optional().nullable(),
  branch_id: z.string().uuid(),
  tooth_fdi: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^(?:[1-8][1-8]|[1-8][A-E])(?:-(?:[1-8][1-8]|[1-8][A-E]))?$/,
      "Use FDI notation, e.g. 16, 21 or 11-18"
    )
    .optional()
    .or(z.literal("")),
  tooth_surfaces: trimmed(10).optional().nullable(),
  procedure_code: trimmed(20).optional().nullable(),
  procedure_name: z
    .string()
    .trim()
    .min(2, "Describe the procedure")
    .max(160),
  notes: trimmed(2000).optional().nullable(),
  performed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
});

// ---------------------------------------------------------------------
// Appointments (Scope 5)
// ---------------------------------------------------------------------
export const appointmentSchema = z.object({
  patient_id: z.string().uuid("Choose a patient"),
  branch_id: z.string().uuid("Choose a branch"),
  dentist_id: z.string().uuid().optional().nullable(),
  // Local wall-clock date + time, no timezone: the clinic books in its own
  // time and the branch has one timezone. Converted to timestamptz server-side.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  duration_min: z.coerce
    .number()
    .int()
    .min(5, "Minimum 5 minutes")
    .max(480, "Maximum 8 hours"),
  status: z
    .enum(["requested", "scheduled", "confirmed", "completed", "cancelled", "no_show"])
    .default("scheduled"),
  reason: trimmed(300).optional().nullable(),
  notes: trimmed(1000).optional().nullable(),
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;

export const appointmentStatusSchema = z.object({
  status: z.enum([
    "requested",
    "scheduled",
    "confirmed",
    "completed",
    "cancelled",
    "no_show",
  ]),
});

// ---------------------------------------------------------------------
// Staff management (Scope 6)
// ---------------------------------------------------------------------
export const staffUpdateSchema = z.object({
  full_name: namesSchema,
  role: z.enum(["dentist", "secretary", "admin"]),
  branch_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean(),
});

export const staffInviteSchema = z.object({
  email: emailSchema,
  full_name: namesSchema,
  role: z.enum(["dentist", "secretary", "admin"]),
  branch_id: z.string().uuid().optional().nullable(),
  password: passwordSchema,
});

export const backupLogSchema = z.object({
  kind: z.enum(["manual_export", "restore_drill", "pitr_note"]),
  reference: trimmed(200).optional().nullable(),
  outcome: z.enum(["ok", "failed", "partial"]),
  notes: trimmed(1000).optional().nullable(),
});