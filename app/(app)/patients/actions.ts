"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog, AUDIT } from "@/lib/security/audit";
import { requireStaff } from "@/lib/security/session";
import {
  appointmentSchema,
  consentSchema,
  patientSchema,
  treatmentSchema,
} from "@/lib/security/validators";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localIso, validateBooking } from "@/lib/clinical/schedule";
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

  const parsed = patientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const p = parsed.data;

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
      allergies: nullable(p.allergies),
      medical_history: nullable(p.medical_history),
      medications: nullable(p.medications),
      branch_id: nullable(p.branch_id) ?? session.branchId,
      created_by: session.userId,
    })
    .select("id, patient_no")
    .single();

  if (error) {
    return { ok: false, message: `Could not save: ${error.message}` };
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
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const c = parsed.data;

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
  });

  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  await auditLog({
    action: AUDIT.consentRecorded,
    userId: session.userId,
    email: session.email,
    entityType: "consent",
    entityId: c.patient_id,
    details: { consent_type: c.consent_type, version: c.version },
  });

  revalidatePath(`/patients/${c.patient_id}`);
  return { ok: true, message: "Consent recorded." };
}

// =====================================================================
// Treatment history  (Scope 4 — dentist only, enforced by RLS as well)
// =====================================================================
export async function recordTreatment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();
  if (session.role !== "dentist" && session.role !== "admin") {
    return {
      ok: false,
      message: "Only the dentist can record a treatment entry.",
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
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const t = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("treatment_records").insert({
    patient_id: t.patient_id,
    appointment_id: nullable(t.appointment_id),
    branch_id: t.branch_id,
    tooth_fdi: nullable(t.tooth_fdi)?.toUpperCase() ?? null,
    tooth_surfaces: nullable(t.tooth_surfaces),
    procedure_code: nullable(t.procedure_code),
    procedure_name: t.procedure_name,
    notes: nullable(t.notes),
    // A backdated chart entry is normal in dentistry, but only the dentist
    // reaches this action at all.
    performed_at: t.performed_at
      ? new Date(`${t.performed_at}T00:00:00`).toISOString()
      : new Date().toISOString(),
    performed_by: session.userId,
    created_by: session.userId,
  });

  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  await auditLog({
    action: AUDIT.treatmentRecorded,
    userId: session.userId,
    email: session.email,
    entityType: "treatment",
    entityId: t.patient_id,
    details: { procedure_code: t.procedure_code ?? null },
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