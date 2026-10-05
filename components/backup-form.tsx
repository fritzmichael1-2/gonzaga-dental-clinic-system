"use client";

import { useActionState } from "react";
import { DatabaseBackup } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import { logBackup } from "@/app/(app)/backups/actions";

const KINDS = [
  { value: "manual_export", label: "Manual export" },
  { value: "restore_drill", label: "Restore drill" },
  { value: "pitr_note", label: "Recovery-point note" },
];

const OUTCOMES = [
  { value: "ok", label: "Succeeded" },
  { value: "partial", label: "Partial" },
  { value: "failed", label: "Failed" },
];

export default function BackupForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    logBackup,
    null
  );

  return (
    <form action={formAction} className="panel flex flex-col gap-4 p-5">
      <h2 className="panel-title">Log a backup or restore drill</h2>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="backup_kind">
            Type
          </label>
          <select id="backup_kind" name="kind" className="field" defaultValue="manual_export">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="backup_outcome">
            Outcome
          </label>
          <select id="backup_outcome" name="outcome" className="field" defaultValue="ok">
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="backup_reference">
            Reference
          </label>
          <input
            id="backup_reference"
            name="reference"
            placeholder="Recovery point id, file name…"
            className="field"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="backup_notes">
          Notes
        </label>
        <textarea id="backup_notes" name="notes" rows={2} className="field" />
        <p className="hint mt-1">
          Do not paste patient data here. This log is kept separately from the
          clinical database.
        </p>
      </div>

      {state?.ok === false && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}
      {state?.ok === true && state.message && (
        <p role="status" className="text-sm font-medium text-ok">
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary">
          <DatabaseBackup size={16} aria-hidden />
          {pending ? "Saving…" : "Log entry"}
        </button>
      </div>
    </form>
  );
}