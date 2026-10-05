"use server";

import { revalidatePath } from "next/cache";
import { auditLog, AUDIT } from "@/lib/security/audit";
import { requireStaff } from "@/lib/security/session";
import { backupLogSchema } from "@/lib/security/validators";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionState } from "@/app/(app)/patients/actions";

/**
 * Backup log (Scope 7).
 *
 * The plan lists "no reported backup copy of the records" as a real risk, so
 * this records that a backup or restore drill was carried out. It is a log, not
 * a backup engine — actual protection comes from the database provider's
 * point-in-time recovery. TODO(CLINIC): confirm hosting tier and the retention
 * and recovery targets the clinic expects.
 */
export async function logBackup(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireStaff();
  if (session.role !== "admin") {
    return { ok: false, message: "Only an administrator can log backups." };
  }

  const parsed = backupLogSchema.safeParse({
    kind: String(formData.get("kind") ?? "manual_export"),
    reference: String(formData.get("reference") ?? ""),
    outcome: String(formData.get("outcome") ?? "ok"),
    notes: String(formData.get("notes") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the entered values." };
  }
  const b = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("backup_logs").insert({
    performed_by: session.userId,
    kind: b.kind,
    reference: b.reference?.trim() || null,
    outcome: b.outcome,
    notes: b.notes?.trim() || null,
  });

  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  await auditLog({
    action: AUDIT.backupLogged,
    userId: session.userId,
    email: session.email,
    entityType: "backup",
    details: { kind: b.kind, outcome: b.outcome },
  });

  revalidatePath("/backups");
  return { ok: true, message: "Backup entry logged." };
}