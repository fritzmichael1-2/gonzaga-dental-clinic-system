"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPreviewMode } from "@/lib/preview";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const deactivated = params.get("deactivated") === "1";

  // `next` comes from the query string, so it must be treated as untrusted:
  // router.replace("https://evil.example") is a working open redirect. Only
  // same-origin absolute paths are honoured, and "//host" is rejected because
  // browsers treat it as protocol-relative.
  const rawNext = params.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    // Preview mode has no auth backend. Say so plainly instead of surfacing a
    // raw Supabase error that would make the build look broken.
    if (isPreviewMode()) {
      setError(
        "Preview mode: sign-in is disabled. Every page is reachable directly from the sidebar once you continue.",
      );
      setBusy(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // Deliberately vague: never reveal whether an email has an account.
      setError("Email or password is incorrect.");
      setBusy(false);
      return;
    }

    // A valid password is not sufficient: the server layout re-checks
    // is_active, so a disabled account lands back on /login?deactivated=1
    // instead of reaching any patient record.
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel w-full max-w-sm p-6">
      <h1 className="text-lg font-semibold">Staff sign-in</h1>
      <p className="hint mt-1 mb-5">
        Gonzaga Dental Clinic Management Automation System
      </p>

      <label className="label" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        required
        className="field"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <label className="label mt-4" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        required
        className="field"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && (
        <p role="alert" className="error-text mt-3">
          {error}
        </p>
      )}
      {deactivated && (
        <p role="status" className="mt-3 rounded-md bg-warn-tint px-3 py-2 text-sm text-warn">
          This account exists but is not active. Ask an administrator to
          activate it, or use a different account to sign in.
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary mt-5 w-full">
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="hint mt-5 border-t border-line pt-4">
        Accounts are created by the clinic administrator. If you cannot sign
        in, ask an administrator to activate your account.
      </p>
    </form>
  );
}