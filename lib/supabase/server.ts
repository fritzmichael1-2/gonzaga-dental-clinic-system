import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPreviewClient, isPreviewMode } from "@/lib/preview";

/**
 * Return type is declared explicitly rather than inferred, so the preview
 * branch does not widen every call site's types back to `any`.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  // Preview mode: serve the in-memory fixtures instead of Postgres.
  if (isPreviewMode()) {
    return createPreviewClient() as unknown as SupabaseClient;
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore when proxy
            // is refreshing the session.
          }
        },
      },
    }
  );
}