import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPreviewMode } from "@/lib/preview";
import type { Staff, StaffRole } from "@/lib/types";

export type Session = {
  userId: string;
  email: string;
  fullName: string;
  role: StaffRole;
  branchId: string | null;
};

const PREVIEW_ROLES: StaffRole[] = ["admin", "dentist", "secretary"];

/**
 * Branch ids match the two rows in `lib/preview/fixtures.ts`.
 * `GDCMAS_PREVIEW_UNASSIGNED=1` gives a secretary no branch at all, which is
 * the state that makes the sidebar show its "no branch assigned" warning.
 */
const MAIN_BRANCH = "b0000000-0000-4000-8000-000000000001";

function previewPersona(): Session {
  const wanted = process.env.GDCMAS_PREVIEW_ROLE;
  const role: StaffRole = PREVIEW_ROLES.includes(wanted as StaffRole)
    ? (wanted as StaffRole)
    : "dentist";

  const unassigned = role === "secretary" && process.env.GDCMAS_PREVIEW_UNASSIGNED === "1";

  // The name and email change with the role so it is obvious whose navigation
  // and permissions are on screen; the sidebar shows them on every page.
  const identity = {
    admin: { fullName: "Dr. Maria Gonzaga", email: "admin@gdcmas.test" },
    dentist: { fullName: "Dr. Maria Gonzaga", email: "dr.gonzaga@gdcmas.test" },
    secretary: { fullName: "Ana Reyes", email: "ana.reyes@gdcmas.test" },
  }[role];

  return {
    userId: "11111111-1111-4111-8111-111111111111",
    email: identity.email,
    fullName: identity.fullName,
    role,
    branchId: unassigned ? null : MAIN_BRANCH,
  };
}

/**
 * Resolves the current staff session, or null.
 *
 * Role and active flag come from the `staff` table, NOT from auth metadata —
 * metadata is user-editable and would be a privilege-escalation hole.
 *
 * `cache` dedupes the lookup across a single render pass so a layout and a
 * page can both call it without a second query.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  // Preview mode has no auth provider, so the reviewer picks a persona instead
  // of signing in. Every role is reachable, not just the two clinical ones:
  // the previous `role === "admin" ? "admin" : "dentist"` meant
  // GDCMAS_PREVIEW_ROLE=secretary silently produced a dentist, so the whole
  // secretary interface — reduced navigation, the branch footer, the
  // unassigned warning — could not be reviewed at all despite the README
  // advertising it.
  if (isPreviewMode()) {
    return previewPersona();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id, email, full_name, role, branch_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  // No staff row, or deactivated by an admin -> treated as signed out.
  if (!staff || !staff.is_active) return null;

  return {
    userId: staff.id,
    email: staff.email,
    fullName: staff.full_name,
    role: staff.role,
    branchId: staff.branch_id,
  };
});

/** Any active staff member. Redirects to /login when signed out. */
export async function requireStaff(): Promise<Session> {
  const session = await getSession();
  if (session) return session;

  // Signed in but with no active staff row = deactivated (or never approved),
  // which is worth telling the user about rather than showing a blank form.
  // Only taken on the failure path, so it costs nothing in the normal case.
  if (isPreviewMode()) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/login?deactivated=1" : "/login");
}

/**
 * Requires one of the given roles. Anyone else lands on the dashboard with a
 * message rather than a 403, because the nav already hides these links.
 */
export async function requireRole(
  ...allowed: StaffRole[]
): Promise<Session> {
  const session = await requireStaff();
  if (!allowed.includes(session.role)) redirect("/dashboard?denied=1");
  return session;
}

/** Server-component half of the permission check. */
export function canWriteClinical(role: StaffRole): boolean {
  return role === "dentist" || role === "admin";
}

export function isAdmin(role: StaffRole): boolean {
  return role === "admin";
}

/** Narrow a full staff row to the shape the UI needs. */
export function toStaffSummary(
  s: Pick<Staff, "id" | "full_name" | "role" | "email">
): { id: string; name: string; role: StaffRole; email: string } {
  return { id: s.id, name: s.full_name, role: s.role, email: s.email };
}