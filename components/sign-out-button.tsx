"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function signOut() {
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    // `startTransition` keeps the redirect from racing the cookie clear.
    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy || pending}
      className="btn-ghost"
      title="Sign out"
    >
      <LogOut size={16} aria-hidden />
      <span className="hidden sm:inline">
        {busy || pending ? "Signing out…" : "Sign out"}
      </span>
    </button>
  );
}