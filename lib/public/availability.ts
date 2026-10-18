import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server helpers for the public (unauthenticated) booking page.
 *
 * These call the `public_*` RPCs in supabase/schema.sql and nothing else. The
 * anon role has no table grants, so every read here goes through a
 * SECURITY DEFINER function that returns only branch names and slot occupancy.
 */

export type PublicBranch = { id: string; name: string };

export type PublicAvailability = {
  ok: boolean;
  message?: string;
  branch?: PublicBranch;
  date?: string;
  open?: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
  slotMin?: number;
  busy?: { start: string; end: string }[];
};

export async function listPublicBranches(): Promise<PublicBranch[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_branches");
  if (error) throw new Error(`public branches lookup failed: ${error.message}`);
  return (data ?? []) as PublicBranch[];
}

export async function getPublicAvailability(
  branchId: string,
  date: string
): Promise<PublicAvailability> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_branch_availability", {
    p_branch: branchId,
    p_date: date,
  });
  if (error) {
    throw new Error(`public availability lookup failed: ${error.message}`);
  }
  return (data ?? { ok: false, message: "No availability." }) as PublicAvailability;
}
