import { redirect } from "next/navigation";
import { getSession } from "@/lib/security/session";

/**
 * The system has no public surface. Signed out -> login, signed in -> dashboard.
 * A separate / page would only ever be a redirect.
 */
export default async function Home() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}