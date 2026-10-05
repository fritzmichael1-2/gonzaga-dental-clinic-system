"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";

/**
 * Directory search box. Pushes the term into the URL so results stay
 * bookmarkable and shareable between the two branches — a real benefit over
 * "searching for a patient record requires staff to browse physical files".
 *
 * The caller passes `key={query}` so a new server result remounts this with a
 * fresh term. That avoids syncing URL state back into local state, which would
 * need an effect and would double-render.
 */
export default function PatientSearch({
  initialQuery = "",
  includeArchived = false,
}: {
  initialQuery?: string;
  includeArchived?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  function submit(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    startTransition(() => {
      router.replace(`/patients?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-md">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(term);
          }}
          onBlur={() => submit(term)}
          placeholder="Name, patient no., or contact number"
          aria-label="Search patients"
          className="field pl-9"
        />
      </div>

      {term && (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            submit("");
          }}
          className="btn-ghost"
        >
          <X size={16} aria-hidden />
          Clear
        </button>
      )}

      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-ink-soft">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            if (e.target.checked) next.set("archived", "1");
            else next.delete("archived");
            startTransition(() => {
              router.replace(`/patients?${next.toString()}`, { scroll: false });
            });
          }}
          className="size-4 rounded border-line"
        />
        Show archived
      </label>

      {pending && <span className="hint">Searching…</span>}
    </div>
  );
}