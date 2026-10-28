import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isPreviewMode } from "@/lib/preview";

/**
 * Writes an audit entry using the service-role key, so the record survives
 * even when RLS would reject the change being audited.
 *
 * Actions that touch PHI use `entity_id` but NEVER pass patient name, birth
 * date, or treatment detail in `details` — the audit table is a separate
 * exposure surface and should stay free of clinical content.
 */
/** Warn once per process, not once per audited write. */
let warnedMissingKey = false;

export async function auditLog(opts: {
  action: string;
  userId?: string | null;
  email?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  // Preview mode has no database; the insert always fails. Skipping it keeps
  // the browser console clean so real errors stand out during a design review.
  if (isPreviewMode()) return;

  // A missing service-role key used to fail inside the try below, so every
  // audited action logged the same "supabaseKey is required" stack trace and
  // the trail silently ran empty — consent recordings included. Say what is
  // actually wrong, once, instead of burying it in stack traces.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "[audit] SUPABASE_SERVICE_ROLE_KEY is not set: audit entries are being DROPPED. " +
          "Add it to .env.local, and to the host's environment (Vercel > Settings > " +
          "Environment Variables) for every deployment."
      );
    }
    return;
  }

  try {
    await getSupabaseAdmin().from("audit_logs").insert({
      actor_id: opts.userId ?? null,
      actor_email: opts.email ?? null,
      action: opts.action,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      details: opts.details ?? {},
      ip: opts.ip ?? null,
    });
  } catch (err) {
    // Logging must never break the request it is auditing.
    console.error("[audit] failed to write log:", err);
  }
}

/** Named actions, kept in one place so the audit log stays greppable. */
export const AUDIT = {
  patientRegistered: "patient.register",
  patientUpdated: "patient.updated",
  patientArchived: "patient.archived",
  patientViewed: "patient.viewed",
  duplicateWarningShown: "patient.duplicate_warning",
  consentRecorded: "consent.recorded",
  chartSaved: "chart.saved",
  treatmentRecorded: "treatment.recorded",
  treatmentUpdated: "treatment.updated",
  appointmentCreated: "appointment.created",
  appointmentUpdated: "appointment.updated",
  appointmentCancelled: "appointment.cancelled",
  publicAppointmentRequested: "appointment.public_requested",
  bookingRejected: "appointment.booking_rejected",
  scheduleViewed: "schedule.viewed",
  staffInvited: "staff.invited",
  staffUpdated: "staff.updated",
  staffDeactivated: "staff.deactivated",
  loginSucceeded: "auth.login_succeeded",
  loginFailed: "auth.login_failed",
  loginBlockedPending: "auth.login_blocked_pending",
  backupLogged: "backup.logged",
} as const;