import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. NEVER import this into client components. Used only for
 * privileged server-side work that RLS would otherwise block: staff account
 * provisioning, audit writes, and the login rate-limit table.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Named plainly: the raw SDK error ("supabaseKey is required") gives no
    // hint about which variable is missing or where it belongs.
    throw new Error(
      "Supabase admin client needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "(server-only; set them in .env.local and in the deployment environment)."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Extract the client IP from the request, handling common proxy headers. */
export function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}