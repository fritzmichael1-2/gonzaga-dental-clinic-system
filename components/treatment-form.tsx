"use client";

import { useActionState, useState } from "react";
import { Save } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type { Appointment, Branch } from "@/lib/types";
import { SURFACE_LABEL, SURFACES } from "@/lib/clinical/tooth";
import { clinicTodayKey, shiftDateKey } from "@/lib/clinical/schedule";
import { formatDate } from "@/lib/utils";
import ToothChart from "@/components/tooth-chart";

/**
 * Records one treatment entry. This is the structured replacement for the
 * dentist's handwritten index-card update.
 *
 * TODO(CLINIC): procedure codes are free text until the clinic confirms
 * whether they use ADA/CDT codes or their own list.
 */
export default function TreatmentForm({
  action,
  patientId,
  branches,
  defaultBranchId,
  dentists,
  role,
  currentUserId,
  appointments = [],
  existingCounts = {},
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  patientId: string;
  branches: Branch[];
  defaultBranchId: string | null;
  /** Active dentists; filtered per chosen branch (clinic-wide ones always). */
  dentists: { id: string; full_name: string; branch_id: string | null }[];
  role: "dentist" | "secretary" | "admin";
  currentUserId: string;
  /** This patient's appointments; the entry is attached to a real visit. */
  appointments?: (Appointment & { branches: { id: string; name: string }[] | null })[];
  /** Procedures already recorded per tooth, so the chart shows prior work. */
  existingCounts?: Record<string, number>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null
  );
  const fieldErrors = (state && !state.ok ? state.fieldErrors : undefined) ?? {};
  // The clinic's day, not the server's: between 00:00 and 08:00 Manila time a UTC
  // host would otherwise default a treatment to yesterday.
  const today = clinicTodayKey();

  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  // The dentist is the clinical author; a dentist defaults to themselves and a
  // secretary must name one. The typist goes in `recorded_by` server-side.
  const [performedBy, setPerformedBy] = useState(
    role === "dentist" ? currentUserId : ""
  );
  const [performedOn, setPerformedOn] = useState(today);

  const dentistOptions = dentists.filter(
    (d) => !d.branch_id || d.branch_id === branchId
  );
  const overAYear = performedOn < shiftDateKey(today, -365);

  /**
   * Tooth selection is one string shared by the chart and the text box, so
   * tapping a tooth and typing a code can never disagree about what gets saved.
   * Typed ranges ("11-18") stay possible because a tap cannot express one.
   */
  const [tooth, setTooth] = useState("");
  const [showPrimary, setShowPrimary] = useState(false);

  function toggleTooth(code: string) {
    const list = tooth
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const next = list.includes(code)
      ? list.filter((c) => c !== code)
      : [...list, code];
    setTooth(next.join(", "));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="patient_id" value={patientId} />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="procedure_name">
            Procedure
          </label>
          <input
            id="procedure_name"
            name="procedure_name"
            required
            placeholder="e.g. Tooth restoration, cleaning, extraction"
            className="field"
          />
          {fieldErrors.procedure_name && (
            <p className="error-text mt-1">{fieldErrors.procedure_name}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="procedure_code">
            Code
          </label>
          <input
            id="procedure_code"
            name="procedure_code"
            placeholder="Optional"
            className="field"
          />
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="label">Tooth</span>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-ink-soft">
            <input
              type="checkbox"
              checked={showPrimary}
              onChange={(e) => setShowPrimary(e.target.checked)}
              className="size-3.5 rounded border-line"
            />
            Show child teeth
          </label>
        </div>

        <ToothChart
          counts={existingCounts}
          primary={showPrimary}
          selected={tooth.split(",").map((s) => s.trim()).filter(Boolean)}
          onToggle={toggleTooth}
        />

        <div className="mt-3">
          <label className="label" htmlFor="tooth_fdi">
            Tooth codes
          </label>
          <input
            id="tooth_fdi"
            name="tooth_fdi"
            value={tooth}
            onChange={(e) => setTooth(e.target.value)}
            placeholder="Tap a tooth above, or type 16, 21, or 11-18"
            className="field font-mono"
          />
          {fieldErrors.tooth_fdi && (
            <p className="error-text mt-1">{fieldErrors.tooth_fdi}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <fieldset>
          <legend className="label">Surfaces</legend>
          <div className="flex flex-wrap gap-2 pt-1">
            {SURFACES.map((s) => (
              <label
                key={s}
                className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink-soft has-checked:border-brand has-checked:bg-brand/5"
              >
                <input
                  type="checkbox"
                  value={s}
                  name="tooth_surfaces"
                  className="size-3.5 rounded border-line"
                />
                {SURFACE_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="performed_at">
            Date performed
          </label>
          <input
            id="performed_at"
            name="performed_at"
            type="date"
            value={performedOn}
            max={today}
            onChange={(e) => setPerformedOn(e.target.value)}
            className="field"
          />
          {fieldErrors.performed_at && (
            <p className="error-text mt-1">{fieldErrors.performed_at}</p>
          )}
          <p className={`hint mt-1 ${overAYear ? "text-warn" : ""}`}>
            {overAYear
              ? "That date is over a year ago — check the year."
              : "Today or earlier."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="performed_by">
            Performed by
          </label>
          <select
            id="performed_by"
            name="performed_by"
            className="field"
            value={performedBy}
            onChange={(e) => setPerformedBy(e.target.value)}
          >
            <option value="">Choose the dentist</option>
            {dentistOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
                {!d.branch_id ? " (clinic-wide)" : ""}
              </option>
            ))}
          </select>
          {fieldErrors.performed_by && (
            <p className="error-text mt-1">{fieldErrors.performed_by}</p>
          )}
          <p className="hint mt-1">
            The dentist who did the work, not whoever typed it.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="treatment_branch">
            Branch
          </label>
          <select
            id="treatment_branch"
            name="branch_id"
            className="field"
            value={branchId}
            onChange={(e) => {
              const next = e.target.value;
              setBranchId(next);
              setPerformedBy((prev) =>
                dentists.some(
                  (d) => d.id === prev && (!d.branch_id || d.branch_id === next)
                )
                  ? prev
                  : role === "dentist"
                    ? currentUserId
                    : ""
              );
            }}
          >
            <option value="">Choose branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="appointment_id">
            Link to appointment
          </label>
          {/*
            This used to ask for a raw appointment UUID in a text box, so in
            practice nobody ever linked a treatment to the visit it belonged to.
            The visit is what "last appointment" means, so it is a dropdown of
            this patient's real appointments, nearest to today first.
          */}
          <select
            id="appointment_id"
            name="appointment_id"
            className="field"
            defaultValue=""
          >
            <option value="">Not linked to a booked visit</option>
            {appointments
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {formatDate(a.starts_at)}
                  {a.branches?.[0]?.name ? ` · ${a.branches[0].name}` : ""}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Clinical notes
        </label>
        <textarea id="notes" name="notes" rows={3} className="field" />
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
          <Save size={16} aria-hidden />
          {pending ? "Saving…" : "Save treatment entry"}
        </button>
      </div>
    </form>
  );
}