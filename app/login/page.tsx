import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { getSession } from "@/lib/security/session";
import { isPreviewMode } from "@/lib/preview";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Resolve the staff row before rendering. An active user never sees the
  // form; a deactivated one does (getSession returns null for them), which is
  // what keeps this from bouncing back to /dashboard in a loop.
  // In preview mode getSession always returns a sample session, so skip the
  // redirect: otherwise /login could never be reviewed or screenshotted.
  if (!isPreviewMode()) {
    const session = await getSession();
    if (session) redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full flex-col items-center gap-6">
        <div className="flex items-center gap-2 text-brand">
          <Stethoscope size={22} aria-hidden />
          <span className="text-sm font-semibold tracking-wide uppercase">
            Gonzaga Dental Clinic
          </span>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="hint max-w-sm text-center">
          Staff system containing patient records. Access is logged and limited
          to authorised clinic personnel.
        </p>
      </div>
    </main>
  );
}