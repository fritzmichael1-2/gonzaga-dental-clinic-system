"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog, AUDIT } from "@/lib/security/audit";
import { requireStaff } from "@/lib/security/session";
import {
  appointmentSchema,
  chartExaminationSchema,
  consentSchema,
  intakeSchema,
  patientSchema,
  treatmentSchema,
} from "@/lib/security/validators";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clinicTodayKey, localIso, validateBooking } from "@/lib/clinical/schedule";
import { LIVE_APPOINTMENT_STATUSES, type AppointmentStatus } from "@/lib/types";

/**
 * Shape returned by every mutation for `useActionState`.
 * `fieldErrors` maps a field name to its first message.
 */
export type ActionState =
  | { ok: true; message?: string }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string>;
    }
  | null;

function firstErrors(
  error: { flatten: () => { fieldErrors: Record<string, string[]> } }
): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  const out: Record<string, string> = {};
  for (const [key, msgs] of Object.entries(flat)) {
    if (msgs?.length) out[key] = msgs[0];
  }
  return out;
}

/** Empty strings from the form become null so optional columns stay NULL. */
function nullable(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// =====================================================================
// Patient registration  (Scope 1)
// =====================================================================
export async function createPatient(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();

  const raw = {
    last_name: String(formData.get("last_name") ?? ""),
    first_name: String(formData.get("first_name") ?? ""),
    middle_name: String(formData.get("middle_name") ?? ""),
    suffix: String(formData.get("suffix") ?? ""),
    nickname: String(formData.get("nickname") ?? ""),
    birthdate: String(formData.get("birthdate") ?? ""),
    sex: String(formData.get("sex") ?? ""),
    civil_status: String(formData.get("civil_status") ?? ""),
    contact_no: String(formData.get("contact_no") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    emergency_contact_name: String(formData.get("emergency_contact_name") ?? ""),
    emergency_contact_no: String(formData.get("emergency_contact_no") ?? ""),
    allergies: String(formData.get("allergies") ?? ""),
    medical_history: String(formData.get("medical_history") ?? ""),
    medications: String(formData.get("medications") ?? ""),
    branch_id: String(formData.get("branch_id") ?? ""),
  };

  // The rest of the paper intake form. Kept separate from `raw` because it is
  // validated by its own schema and stored in `patient_intake`, not `patients`.
  const rawIntake = {
    religion: String(formData.get("religion") ?? ""),
    nationality: String(formData.get("nationality") ?? ""),
    birthplace: String(formData.get("birthplace") ?? ""),
    occupation: String(formData.get("occupation") ?? ""),
    home_no: String(formData.get("home_no") ?? ""),
    office_no: String(formData.get("office_no") ?? ""),
    fax_no: String(formData.get("fax_no") ?? ""),
    dental_insurance: String(formData.get("dental_insurance") ?? ""),
    insurance_effective: String(formData.get("insurance_effective") ?? ""),
    guardian_name: String(formData.get("guardian_name") ?? ""),
    guardian_occupation: String(formData.get("guardian_occupation") ?? ""),
    guardian_email: String(formData.get("guardian_email") ?? ""),
    referred_by: String(formData.get("referred_by") ?? ""),
    consultation_reason: String(formData.get("consultation_reason") ?? ""),
    previous_dentist: String(formData.get("previous_dentist") ?? ""),
    previous_dentist_office: String(formData.get("previous_dentist_office") ?? ""),
    last_dental_visit: String(formData.get("last_dental_visit") ?? ""),
    physician: String(formData.get("physician") ?? ""),
    screening: String(formData.get("screening") ?? ""),
    allergies: String(formData.get("allergies_json") ?? ""),
    allergy_other: String(formData.get("allergy_other") ?? ""),
    bleeding_problems: String(formData.get("bleeding_problems") ?? ""),
    bleeding_time: String(formData.get("bleeding_time") ?? ""),
    women_only: String(formData.get("women_only") ?? ""),
    blood_type: String(formData.get("blood_type") ?? ""),
    blood_pressure: String(formData.get("blood_pressure") ?? ""),
    conditions: String(formData.get("conditions") ?? ""),
    condition_other: String(formData.get("condition_other") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    signature_png: String(formData.get("signature_png") ?? ""),
  };

  const parsed = patientSchema.safeParse(raw);
  const parsedIntake = intakeSchema.safeParse(rawIntake);
  if (!parsed.success || !parsedIntake.success) {
    const fieldErrors = {
      ...(parsed.success ? {} : firstErrors(parsed.error)),
      ...(parsedIntake.success ? {} : firstErrors(parsedIntake.error)),
    };
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors,
    };
  }
  const p = parsed.data;
  const i = parsedIntake.data;

  // The duplicate guard: the plan lists duplicate records as a real risk, so
  // a staff member explicitly confirms instead of silently creating a second
  // file for the same person.
  const acknowledged = formData.get("duplicate_ack") === "yes";
  if (!acknowledged) {
    const supabase = await createSupabaseServerClient();
    const { data: dupes } = await supabase.rpc("find_potential_duplicates", {
      p_last_name: p.last_name,
      p_first_name: p.first_name,
      p_birthdate: p.birthdate || null,
      p_limit: 5,
    });

    if (dupes && dupes.length > 0) {
      await auditLog({
        action: AUDIT.duplicateWarningShown,
        userId: session.userId,
        email: session.email,
        entityType: "patient",
        details: { matches: dupes.length },
      });
      return {
        ok: false,
        message:
          "A similar patient already exists. Open the existing record if this is the same person.",
      };
    }
  }

  const branchId = nullable(p.branch_id) ?? session.branchId;

  // The patient list shows an allergies alert and a one-line history read from
  // the `patients` row, so those two columns are a *summary* derived from the
  // structured answers — not a second source of truth. The full form lives in
  // `patient_intake`.
  const allergySummary =
    [...i.allergies, i.allergy_other].filter(Boolean).join(", ") ||
    nullable(p.allergies);
  const conditionSummary =
    [...i.conditions, i.condition_other].filter(Boolean).join(", ") || null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({
      last_name: p.last_name,
      first_name: p.first_name,
      middle_name: nullable(p.middle_name),
      suffix: nullable(p.suffix),
      nickname: nullable(p.nickname),
      birthdate: p.birthdate || null,
      sex: p.sex || null,
      civil_status: nullable(p.civil_status),
      contact_no: nullable(p.contact_no),
      email: nullable(p.email),
      address: nullable(p.address),
      emergency_contact_name: nullable(p.emergency_contact_name),
      emergency_contact_no: nullable(p.emergency_contact_no),
      allergies: allergySummary,
      medical_history: nullable(p.medical_history) ?? conditionSummary,
      medications: nullable(p.medications),
      branch_id: branchId,
      created_by: session.userId,
    })
    .select("id, patient_no")
    .single();

  if (error) {
    return { ok: false, message: `Could not save: ${error.message}` };
  }

  const { error: intakeError } = await supabase.from("patient_intake").insert({
    patient_id: data.id,
    branch_id: branchId,
    religion: nullable(i.religion),
    nationality: nullable(i.nationality),
    birthplace: nullable(i.birthplace),
    occupation: nullable(i.occupation),
    home_no: nullable(i.home_no),
    office_no: nullable(i.office_no),
    fax_no: nullable(i.fax_no),
    dental_insurance: nullable(i.dental_insurance),
    insurance_effective: i.insurance_effective || null,
    guardian_name: nullable(i.guardian_name),
    guardian_occupation: nullable(i.guardian_occupation),
    guardian_email: nullable(i.guardian_email),
    referred_by: nullable(i.referred_by),
    consultation_reason: nullable(i.consultation_reason),
    previous_dentist: nullable(i.previous_dentist),
    previous_dentist_office: nullable(i.previous_dentist_office),
    last_dental_visit: i.last_dental_visit || null,
    physician: i.physician,
    screening: i.screening,
    allergies: i.allergies,
    allergy_other: nullable(i.allergy_other),
    bleeding_problems: i.bleeding_problems || null,
    bleeding_time: nullable(i.bleeding_time),
    women_only: i.women_only,
    blood_type: nullable(i.blood_type),
    blood_pressure: nullable(i.blood_pressure),
    conditions: i.conditions,
    condition_other: nullable(i.condition_other),
    notes: nullable(i.notes),
    signature_png: i.signature_png || null,
    // The pair is constrained together in the schema: either both are set or
    // neither is.
    signed_at: i.signature_png ? new Date().toISOString() : null,
    // Who encoded the form. The signature above is the patient's.
    filled_by: session.userId,
  });

  if (intakeError) {
    // A patient row with no medical history is worse than no row at all —
    // staff would read a blank allergy list as "no allergies". Drop the
    // half-made record so the registration can be retried cleanly.
    await supabase.from("patients").delete().eq("id", data.id);
    await auditLog({
      action: AUDIT.patientRegistered,
      userId: session.userId,
      email: session.email,
      entityType: "patient",
      entityId: data.id,
      details: { intake_failed: intakeError.message },
    });
    return {
      ok: false,
      message: `Could not save the intake answers: ${intakeError.message}`,
    };
  }

  // patient_no is not PHI; the id lets staff jump straight to the new record.
  await auditLog({
    action: AUDIT.patientRegistered,
    userId: session.userId,
    email: session.email,
    entityType: "patient",
    entityId: data.id,
    details: { patient_no: data.patient_no },
  });

  revalidatePath("/patients");
  redirect(`/patients/${data.id}?created=1`);
}

// =====================================================================
// Patient edit
// =====================================================================
export async function updatePatient(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing patient reference." };

  const raw = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, String(v)])
  );
  const parsed = patientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("patients")
    .update({
      last_name: p.last_name,
      first_name: p.first_name,
      middle_name: nullable(p.middle_name),
      suffix: nullable(p.suffix),
      nickname: nullable(p.nickname),
      birthdate: p.birthdate || null,
      sex: p.sex || null,
      civil_status: nullable(p.civil_status),
      contact_no: nullable(p.contact_no),
      email: nullable(p.email),
      address: nullable(p.address),
      emergency_contact_name: nullable(p.emergency_contact_name),
      emergency_contact_no: nullable(p.emergency_contact_no),
      allergies: nullable(p.allergies),
      medical_history: nullable(p.medical_history),
      medications: nullable(p.medications),
      branch_id: nullable(p.branch_id),
      updated_by: session.userId,
    })
    .eq("id", id);

  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  await auditLog({
    action: AUDIT.patientUpdated,
    userId: session.userId,
    email: session.email,
    entityType: "patient",
    entityId: id,
  });

  revalidatePath(`/patients/${id}`);
  revalidatePath("/patients");
  return { ok: true, message: "Patient details saved." };
}

/**
 * Archive instead of delete. The plan notes paper records may still need
 * manual encoding, so records are never hard-deleted — archiving keeps the
 * audit trail intact.
 */
export async function archivePatient(
  id: string,
  reason: string
): Promise<ActionState> {
  const session = await requireStaff();
  if (session.role !== "admin") {
    return { ok: false, message: "Only an administrator can archive a record." };
  }
  if (!id) return { ok: false, message: "Missing patient reference." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("patients")
    .update({
      status: "archived",
      archived_reason: reason.trim() || null,
      updated_by: session.userId,
    })
    .eq("id", id);

  if (error) return { ok: false, message: `Could not archive: ${error.message}` };

  await auditLog({
    action: AUDIT.patientArchived,
    userId: session.userId,
    email: session.email,
    entityType: "patient",
    entityId: id,
    details: { reason: reason.trim() || null },
  });

  revalidatePath(`/patients/${id}`);
  revalidatePath("/patients");
  return { ok: true, message: "Patient archived." };
}

export async function restorePatient(id: string): Promise<ActionState> {
  const session = await requireStaff();
  if (session.role !== "admin") {
    return { ok: false, message: "Only an administrator can restore a record." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("patients")
    .update({ status: "active", archived_reason: null, updated_by: session.userId })
    .eq("id", id);

  if (error) return { ok: false, message: `Could not restore: ${error.message}` };

  await auditLog({
    action: AUDIT.patientUpdated,
    userId: session.userId,
    email: session.email,
    entityType: "patient",
    entityId: id,
    details: { restored: true },
  });

  revalidatePath(`/patients/${id}`);
  revalidatePath("/patients");
  return { ok: true, message: "Patient restored." };
}

// =====================================================================
// Consent  (Scope 3)
// =====================================================================
export async function recordConsent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();
  const parsed = consentSchema.safeParse({
    patient_id: String(formData.get("patient_id") ?? ""),
    consent_type: String(formData.get("consent_type") ?? "treatment"),
    version: String(formData.get("version") ?? "1.0"),
    body: String(formData.get("body") ?? ""),
    signed_by_name: String(formData.get("signed_by_name") ?? ""),
    signed_by_relation: String(formData.get("signed_by_relation") ?? ""),
    branch_id: String(formData.get("branch_id") ?? ""),
    signature_patient_png: String(formData.get("signature_patient_png") ?? ""),
    signature_dentist_png: String(formData.get("signature_dentist_png") ?? ""),
    initials_png: String(formData.get("initials_png") ?? ""),
    initialed_clause_count: String(formData.get("initialed_clause_count") ?? ""),
    consent_meta: String(formData.get("consent_meta") ?? ""),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const c = parsed.data;

  const hasSignatures = Boolean(c.signature_patient_png);
  const hasInitials = Boolean(c.initials_png);

  const meta = (() => {
    if (!c.consent_meta) return null;
    try {
      return JSON.parse(c.consent_meta) as Record<string, unknown>;
    } catch {
      // A malformed snapshot is not worth losing the consent over.
      return { raw: c.consent_meta };
    }
  })();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("consent_records").insert({
    patient_id: c.patient_id,
    consent_type: c.consent_type,
    version: c.version,
    body: c.body,
    signed_by_name: c.signed_by_name,
    signed_by_relation: nullable(c.signed_by_relation),
    branch_id: c.branch_id,
    recorded_by: session.userId,
    signature_patient_png: nullable(c.signature_patient_png),
    signature_dentist_png: nullable(c.signature_dentist_png),
    initials_png: nullable(c.initials_png),
    // Stamped here rather than trusted from the browser: the paired constraint
    // needs a server-side time, and `consent_meta` keeps the client clock.
    initialed_all_at: hasInitials ? new Date().toISOString() : null,
    initialed_clause_count: hasInitials ? c.initialed_clause_count ?? null : null,
    consent_meta: meta,
  });

  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  await auditLog({
    action: AUDIT.consentRecorded,
    userId: session.userId,
    email: session.email,
    entityType: "consent",
    entityId: c.patient_id,
    details: {
      consent_type: c.consent_type,
      version: c.version,
      signatures: hasSignatures,
      block_initialled: hasInitials,
      clause_count: c.initialed_clause_count ?? null,
    },
  });

  revalidatePath(`/patients/${c.patient_id}`);
  return { ok: true, message: "Consent recorded." };
}

// =====================================================================
// Treatment history
//
// A dentist records their own work; a secretary may transcribe a treatment on
// a named dentist's behalf. Either way `performed_by` is the dentist and
// `recorded_by` is whoever typed it, so the ledger never credits the typist
// with the procedure. RLS enforces the same rule.
// =====================================================================
async function dentistForBranch(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dentistId: string,
  branchId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("staff")
    .select("id, role, branch_id, is_active")
    .eq("id", dentistId)
    .maybeSingle();
  return Boolean(
    data &&
      data.role === "dentist" &&
      data.is_active === true &&
      (!data.branch_id || data.branch_id === branchId)
  );
}

export async function recordTreatment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();
  const clinical = session.role === "dentist" || session.role === "admin";
  if (!clinical && session.role !== "secretary") {
    return {
      ok: false,
      message: "Only clinic staff can record a treatment entry.",
    };
  }

  const parsed = treatmentSchema.safeParse({
    patient_id: String(formData.get("patient_id") ?? ""),
    appointment_id: String(formData.get("appointment_id") ?? "") || null,
    branch_id: String(formData.get("branch_id") ?? ""),
    tooth_fdi: String(formData.get("tooth_fdi") ?? ""),
    tooth_surfaces: formData.getAll("tooth_surfaces").join(""),
    procedure_code: String(formData.get("procedure_code") ?? ""),
    procedure_name: String(formData.get("procedure_name") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    performed_at: String(formData.get("performed_at") ?? ""),
    performed_by: String(formData.get("performed_by") ?? "") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const t = parsed.data;

  // The clinical author is always named, never inferred from whoever is
  // signed in. A dentist defaults to themselves; a secretary must choose.
  const performedBy = t.performed_by ?? (clinical ? session.userId : null);
  if (!performedBy) {
    return {
      ok: false,
      message: "Choose the dentist who performed this treatment.",
      fieldErrors: { performed_by: "Choose a dentist" },
    };
  }

  if (session.role === "secretary" && session.branchId !== t.branch_id) {
    return {
      ok: false,
      message: "You can only record treatments for your own branch.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!(await dentistForBranch(supabase, performedBy, t.branch_id))) {
    return {
      ok: false,
      message: "Choose an active dentist who works at that branch.",
      fieldErrors: { performed_by: "Dentist not available at this branch" },
    };
  }

  const today = clinicTodayKey();
  const performedOn = t.performed_at || today;
  if (performedOn > today) {
    return {
      ok: false,
      message: "The date performed cannot be in the future.",
      fieldErrors: { performed_at: "Use today or an earlier date" },
    };
  }

  const { error } = await supabase.from("treatment_records").insert({
    patient_id: t.patient_id,
    appointment_id: nullable(t.appointment_id),
    branch_id: t.branch_id,
    tooth_fdi: nullable(t.tooth_fdi)?.toUpperCase() ?? null,
    tooth_surfaces: nullable(t.tooth_surfaces),
    procedure_code: nullable(t.procedure_code),
    procedure_name: t.procedure_name,
    notes: nullable(t.notes),
    // A date-only entry is stored at noon clinic time: midnight would display
    // as the previous day in UTC and as 12:00 AM to the clinic.
    performed_at: localIso(performedOn, "12:00"),
    performed_by: performedBy,
    recorded_by: session.userId,
    recorded_role: session.role,
    created_by: session.userId,
  });

  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  await auditLog({
    action: AUDIT.treatmentRecorded,
    userId: session.userId,
    email: session.email,
    entityType: "treatment",
    entityId: t.patient_id,
    details: {
      procedure_code: t.procedure_code ?? null,
      performed_by: performedBy,
      recorded_role: session.role,
      backdated: performedOn !== today,
    },
  });

  revalidatePath(`/patients/${t.patient_id}`);
  return { ok: true, message: "Treatment entry saved." };
}

export async function deleteTreatment(id: string): Promise<ActionState> {
  const session = await requireStaff();
  if (session.role !== "dentist" && session.role !== "admin") {
    return { ok: false, message: "Only the dentist can remove an entry." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("treatment_records")
    .delete()
    .eq("id", id)
    .select("patient_id")
    .single();

  if (error) return { ok: false, message: `Could not remove: ${error.message}` };

  await auditLog({
    action: AUDIT.treatmentUpdated,
    userId: session.userId,
    email: session.email,
    entityType: "treatment",
    entityId: id,
    details: { deleted: true },
  });

  if (data?.patient_id) revalidatePath(`/patients/${data.patient_id}`);
  return { ok: true, message: "Entry removed." };
}

// =====================================================================
// Dental record chart
//
// The dentist authors the examination; a secretary may type it in — including
// from a paper chart — and may correct her own typing until the clinic day
// ends. The date is the visit's date ("examined on"), not the moment it was
// typed; `created_at` keeps that distinction visible.
// =====================================================================
export async function saveChartExamination(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();
  const clinical = session.role === "dentist" || session.role === "admin";
  if (!clinical && session.role !== "secretary") {
    return {
      ok: false,
      message: "Only clinic staff can record a dental chart.",
    };
  }

  // The chart posts one JSON payload because findings are a list. A malformed
  // payload is a browser bug or a hand-crafted request, never something to
  // guess at.
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return {
      ok: false,
      message: "The chart could not be read. Reload the page and chart it again.",
    };
  }

  const parsed = chartExaminationSchema.safeParse({
    patient_id: String(formData.get("patient_id") ?? ""),
    branch_id: String(formData.get("branch_id") ?? ""),
    appointment_id: String(formData.get("appointment_id") ?? "") || null,
    examined_by: String(formData.get("examined_by") ?? "") || null,
    examined_on: String(formData.get("examined_on") ?? ""),
    exam: (raw as { exam?: unknown } | null)?.exam,
    findings: (raw as { findings?: unknown } | null)?.findings,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the chart and try again.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const d = parsed.data;

  // Present only when correcting an entry, never when saving a new visit.
  const correctionId = nullable(String(formData.get("examination_id") ?? ""));

  // The clinical author is always named. A dentist defaults to themselves; a
  // secretary must pick one, and the database rejects an unnamed examiner too.
  const examinedBy = d.examined_by ?? (clinical ? session.userId : null);
  if (!examinedBy) {
    return {
      ok: false,
      message: "Choose the dentist who examined this patient.",
      fieldErrors: { examined_by: "Choose a dentist" },
    };
  }

  if (!clinical && session.branchId !== d.branch_id) {
    return {
      ok: false,
      message: "You can only chart for the branch you are assigned to.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!(await dentistForBranch(supabase, examinedBy, d.branch_id))) {
    return {
      ok: false,
      message: "Choose an active dentist who works at that branch.",
      fieldErrors: { examined_by: "Dentist not available at this branch" },
    };
  }

  const today = clinicTodayKey();
  const examinedOn = d.examined_on || today;
  if (examinedOn > today) {
    return {
      ok: false,
      message: "The examination date cannot be in the future.",
      fieldErrors: { examined_on: "Use today or an earlier date" },
    };
  }

  const findings = d.findings.map((f) => ({
    tooth_fdi: f.tooth_fdi,
    condition_code: f.condition_code,
    // Stored canonically (B, M, O, D, L) by the validator.
    surfaces: f.surfaces,
    comment: f.comment ?? null,
  }));

  // Correcting a transcription: rewrite the same snapshot. The RPC and the RLS
  // policies decide whether this caller may do so (a secretary only on her own
  // entry, same clinic day); the visit date and the dentist stay frozen.
  if (correctionId) {
    const { data: priorRows } = await supabase
      .from("chart_findings")
      .select("id")
      .eq("examination_id", correctionId);

    const { error } = await supabase.rpc("update_chart_examination", {
      p_examination: correctionId,
      p_exam: d.exam,
      p_findings: findings,
    });

    if (error) {
      return {
        ok: false,
        message: `Could not save the correction: ${error.message}`,
      };
    }

    await auditLog({
      action: AUDIT.chartCorrected,
      userId: session.userId,
      email: session.email,
      entityType: "chart",
      entityId: d.patient_id,
      details: {
        examination_id: correctionId,
        finding_count: findings.length,
        previous_finding_count: priorRows?.length ?? null,
        examined_by: examinedBy,
        recorded_role: session.role,
      },
    });

    revalidatePath(`/patients/${d.patient_id}`);
    redirect(
      `/patients/${d.patient_id}?tab=chart&exam=${correctionId}&corrected=1`
    );
  }

  // One transaction: an examination without its findings would read as
  // "nothing wrong with this patient", which is the worst way to fail.
  const { data, error } = await supabase.rpc("save_chart_examination", {
    p_patient: d.patient_id,
    p_appointment: d.appointment_id ?? null,
    p_branch: d.branch_id,
    p_exam: d.exam,
    p_findings: findings,
    p_examined_by: examinedBy,
    // Noon clinic time keeps a date-only entry on the day it happened in every
    // timezone the record might be read from.
    p_examined_at: localIso(examinedOn, "12:00"),
  });

  if (error) {
    return { ok: false, message: `Could not save the chart: ${error.message}` };
  }

  const examinationId = typeof data === "string" ? data : null;

  // Counts only. The audit log is a separate exposure surface and must never
  // carry which tooth was decayed.
  await auditLog({
    action: AUDIT.chartSaved,
    userId: session.userId,
    email: session.email,
    entityType: "chart",
    entityId: d.patient_id,
    details: {
      examination_id: examinationId,
      finding_count: findings.length,
      teeth_charted: new Set(findings.map((f) => f.tooth_fdi)).size,
      appointment_linked: Boolean(d.appointment_id),
      examined_by: examinedBy,
      recorded_role: session.role,
      backdated: examinedOn !== today,
    },
  });

  revalidatePath(`/patients/${d.patient_id}`);
  redirect(
    `/patients/${d.patient_id}?tab=chart${examinationId ? `&exam=${examinationId}` : ""}&saved=1`
  );
}

/**
 * Removes a chart snapshot. The UI only offers this for a secretary's own
 * same-day entry; RLS is what actually enforces it, so a dentist/admin request
 * still works and anyone else gets a refusal from the database.
 */
export async function deleteChartExamination(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();

  const examinationId = String(formData.get("examination_id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");
  if (!examinationId || !patientId) {
    return { ok: false, message: "That entry could not be identified." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("chart_examinations")
    .delete()
    .eq("id", examinationId)
    .select("id, recorded_by, recorded_role")
    .maybeSingle();

  if (error) {
    return { ok: false, message: `Could not remove the entry: ${error.message}` };
  }
  if (!data) {
    return {
      ok: false,
      message:
        "That entry can no longer be removed. Ask the dentist or an administrator.",
    };
  }

  await auditLog({
    action: AUDIT.chartDeleted,
    userId: session.userId,
    email: session.email,
    entityType: "chart",
    entityId: patientId,
    details: {
      examination_id: examinationId,
      recorded_role: data.recorded_role ?? null,
    },
  });

  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}?tab=chart`);
}

// =====================================================================
// Appointments  (Scope 5)
// =====================================================================
export async function createAppointment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();

  const parsed = appointmentSchema.safeParse({
    patient_id: String(formData.get("patient_id") ?? ""),
    branch_id: String(formData.get("branch_id") ?? ""),
    dentist_id: String(formData.get("dentist_id") ?? "") || null,
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
    duration_min: String(formData.get("duration_min") ?? ""),
    status: String(formData.get("status") ?? "scheduled"),
    reason: String(formData.get("reason") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const a = parsed.data;

  // Re-check server-side before insert. The DB exclusion constraint is still
  // the final authority — this only produces a readable message.
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase
    .from("clinic_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const dayStart = localIso(a.date, "00:00:00");
  const dayEnd = localIso(a.date, "23:59:59");
  const { data: sameDay } = await supabase
    .from("appointments")
    .select("id, patient_id, dentist_id, starts_at, ends_at, status")
    .gte("starts_at", dayStart)
    .lte("starts_at", dayEnd);

  const verdict = validateBooking({
    date: a.date,
    time: a.time,
    durationMin: a.duration_min,
    openingHours: settings?.opening_hours ?? {},
    slotMin: settings?.default_slot_min ?? 30,
    appointments: (sameDay ?? []) as never,
    branchId: a.branch_id,
    patientId: a.patient_id,
    dentistId: a.dentist_id ?? null,
  });

  if (!verdict.ok) {
    await auditLog({
      action: AUDIT.bookingRejected,
      userId: session.userId,
      email: session.email,
      entityType: "appointment",
      details: { reason: verdict.reason },
    });
    return { ok: false, message: verdict.reason };
  }

  // Cross-branch rule: a patient holding a live appointment at another branch
  // must settle that one first. The database trigger
  // (appointments_cross_branch_pending) is the guarantee; this query exists so
  // the user gets a message that names the other branch rather than a raw
  // Postgres error.
  const { data: otherPending } = await supabase
    .from("appointments")
    .select("id, branches ( name )")
    .eq("patient_id", a.patient_id)
    .neq("branch_id", a.branch_id)
    .in("status", LIVE_APPOINTMENT_STATUSES)
    .limit(1);

  if (otherPending && otherPending.length > 0) {
    const embed = otherPending[0].branches;
    const otherName =
      (Array.isArray(embed) ? embed[0] : embed)?.name ?? "another branch";
    const message = `This patient has a pending appointment at ${otherName} that must be settled first.`;
    await auditLog({
      action: AUDIT.bookingRejected,
      userId: session.userId,
      email: session.email,
      entityType: "appointment",
      details: { reason: "cross_branch_pending" },
    });
    return { ok: false, message };
  }

  const startsAt = localIso(a.date, a.time);
  const endsAt = new Date(
    new Date(startsAt).getTime() + a.duration_min * 60_000
  ).toISOString();

  const { error } = await supabase.from("appointments").insert({
    patient_id: a.patient_id,
    branch_id: a.branch_id,
    dentist_id: nullable(a.dentist_id),
    starts_at: startsAt,
    ends_at: endsAt,
    status: a.status,
    reason: nullable(a.reason),
    notes: nullable(a.notes),
    created_by: session.userId,
  });

  if (error) {
    // 23P01 = exclusion_violation, i.e. someone booked the dentist first.
    if (error.code === "23P01") {
      return {
        ok: false,
        message:
          "That slot was just taken by someone else. Pick another time.",
      };
    }
    if (error.code === "23505") {
      return {
        ok: false,
        message: "This patient already has an appointment at that time.",
      };
    }
    // P0001 = our cross-branch pending guard raised from the trigger. Its
    // message already names the other branch, so pass it straight through.
    if (error.code === "P0001") {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: `Could not book: ${error.message}` };
  }

  await auditLog({
    action: AUDIT.appointmentCreated,
    userId: session.userId,
    email: session.email,
    entityType: "appointment",
    details: { date: a.date, time: a.time, status: a.status },
  });

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  return { ok: true, message: "Appointment booked." };
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus
): Promise<ActionState> {
  const session = await requireStaff();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id);

  if (error) return { ok: false, message: `Could not update: ${error.message}` };

  await auditLog({
    action:
      status === "cancelled"
        ? AUDIT.appointmentCancelled
        : AUDIT.appointmentUpdated,
    userId: session.userId,
    email: session.email,
    entityType: "appointment",
    entityId: id,
    details: { status },
  });

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  return { ok: true, message: `Appointment marked ${status.replace("_", " ")}.` };
}