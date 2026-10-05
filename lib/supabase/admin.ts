import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. NEVER import this into client components. Used only for
 * privileged server-side work that RLS would otherwise block: staff account
 * provisioning, audit writes, and the login rate-limit table.
 */
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Extract the client IP from the request, handling common proxy headers. */
export function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}