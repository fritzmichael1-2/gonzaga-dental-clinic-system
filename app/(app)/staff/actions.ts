"use server";

import { revalidatePath } from "next/cache";
import { auditLog, AUDIT } from "@/lib/security/audit";
import { requireStaff } from "@/lib/security/session";
import { staffInviteSchema, staffUpdateSchema } from "@/lib/security/validators";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ActionState } from "@/app/(app)/patients/actions";

/**
 * Staff administration (Scope 6).
 *
 * Account creation needs the service-role key because Supabase Auth does not
 * let a session create other users. Every mutation re-checks that the caller is
 * an active admin first — the service role bypasses RLS, so this server-side
 * check is the only thing preventing privilege escalation.
 */

async function requireAdmin() {
  const session = await requireStaff();
  if (session.role !== "admin") return null;
  return session;
}

function firstErrors(error: {
  flatten: () => { fieldErrors: Record<string, string[]> };
}): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  const out: Record<string, string> = {};
  for (const [key, msgs] of Object.entries(flat)) {
    if (msgs?.length) out[key] = msgs[0];
  }
  return out;
}

export async function inviteStaff(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdmin();
  if (!session) return { ok: false, message: "Not permitted." };

  const parsed = staffInviteSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    full_name: String(formData.get("full_name") ?? ""),
    role: String(formData.get("role") ?? "secretary"),
    branch_id: String(formData.get("branch_id") ?? "") || null,
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }
  const input = parsed.data;

  const admin = getSupabaseAdmin();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
  });

  if (createError) {
    return { ok: false, message: `Could not create account: ${createError.message}` };
  }

  // The trigger creates the staff row inactive with a default role; set the
  // real values here. Invited accounts become active immediately because an
  // admin chose to create them.
  const { error: updateError } = await admin
    .from("staff")
    .update({
      full_name: input.full_name,
      role: input.role,
      branch_id: input.branch_id,
      is_active: true,
    })
    .eq("id", created.user.id);

  if (updateError) {
    // Don't leave an orphaned auth user behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: `Could not set role: ${updateError.message}` };
  }

  await auditLog({
    action: AUDIT.staffInvited,
    userId: session.userId,
    email: session.email,
    entityType: "staff",
    entityId: created.user.id,
    details: { role: input.role },
  });

  revalidatePath("/staff");
  return { ok: true, message: `Account created for ${input.email}.` };
}

export async function updateStaff(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdmin();
  if (!session) return { ok: false, message: "Not permitted." };

  const id = String(formData.get("id") ?? "");
  const parsed = staffUpdateSchema.safeParse({
    full_name: String(formData.get("full_name") ?? ""),
    role: String(formData.get("role") ?? "secretary"),
    branch_id: String(formData.get("branch_id") ?? "") || null,
    is_active: formData.get("is_active") === "yes",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: firstErrors(parsed.error),
    };
  }

  // Guard against an admin removing the last active admin and locking everyone
  // out of staff management.
  if (id === session.userId && !parsed.data.is_active) {
    return { ok: false, message: "You cannot deactivate your own account." };
  }

  const admin = getSupabaseAdmin();

  if (id === session.userId && parsed.data.role !== "admin") {
    const { count } = await admin
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        message: "This is the last active administrator. Promote someone else first.",
      };
    }
  }

  const { error } = await admin
    .from("staff")
    .update({
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      branch_id: parsed.data.branch_id,
      is_active: parsed.data.is_active,
    })
    .eq("id", id);

  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  // No token revocation needed: every server read goes through
  // getSession() -> staff.is_active, and every RLS policy calls
  // is_active_staff(), so a deactivated account is cut off on its very next
  // request even though its JWT is still valid.
  await auditLog({
    action: parsed.data.is_active ? AUDIT.staffUpdated : AUDIT.staffDeactivated,
    userId: session.userId,
    email: session.email,
    entityType: "staff",
    entityId: id,
    details: { role: parsed.data.role, is_active: parsed.data.is_active },
  });

  revalidatePath("/staff");
  return { ok: true, message: "Staff record saved." };
}