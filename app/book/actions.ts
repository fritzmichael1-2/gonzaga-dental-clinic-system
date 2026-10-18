"use server";

import { auditLog, AUDIT } from "@/lib/security/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Public self-booking. The whole rule set — opening hours, slot alignment,
 * the dentist/patient overlap constraints, and the cross-branch pending guard
 * — lives in `public_request_appointment()` in supabase/schema.sql, so this
 * action only forwards the form and relays the function's verdict.
 */

export type BookingState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function requestAppointment(
  _prev: BookingState,
  formData: FormData
): Promise<BookingState> {
  const date = str(formData, "date");
  const time = str(formData, "time");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_request_appointment", {
    p_last_name: str(formData, "last_name"),
    p_first_name: str(formData, "first_name"),
    p_birthdate: str(formData, "birthdate") || null,
    p_contact: str(formData, "contact_no"),
    p_branch: str(formData, "branch_id"),
    p_date: date || null,
    p_time: time || null,
    p_duration: Number(formData.get("duration_min") ?? 30) || 30,
    p_reason: str(formData, "reason"),
  });

  if (error) {
    return {
      ok: false,
      message:
        "Could not submit your request. Please try again or call the clinic.",
    };
  }

  const result = (data ?? {}) as { ok?: boolean; message?: string };

  if (result.ok) {
    // entity_id is intentionally omitted: the public request has no patient id
    // the caller is entitled to, and the audit table must stay free of the
    // name/birthdate the patient just typed.
    await auditLog({
      action: AUDIT.publicAppointmentRequested,
      entityType: "appointment",
      details: { date, time, via: "public" },
    });
    return {
      ok: true,
      message: result.message ?? "Request received.",
    };
  }

  await auditLog({
    action: AUDIT.bookingRejected,
    entityType: "appointment",
    details: { via: "public", date, time },
  });
  return {
    ok: false,
    message: result.message ?? "Could not complete that booking.",
  };
}
