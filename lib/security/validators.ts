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
// Consent (Scope 3)
// ---------------------------------------------------------------------
export const consentSchema = z.object({
  patient_id: z.string().uuid(),
  consent_type: z.enum(["treatment", "privacy", "surgery", "orthodontic", "other"]),
  version: trimmed(20).default("1.0"),
  body: z.string().trim().min(20, "Consent text is missing").max(20_000),
  signed_by_name: namesSchema,
  signed_by_relation: trimmed(60).optional().nullable(),
  branch_id: z.string().uuid(),
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