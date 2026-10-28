"use client";

import { useActionState, useState } from "react";
import { CalendarClock, CircleCheck, History, Lock, Save } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type {
  Appointment,
  Branch,
  ChartExamination,
  ChartFinding,
} from "@/lib/types";
import {
  commentsFromFindings,
  findingsFromToothState,
  toothStateFromFindings,
  type ToothComments,
  type ToothState,
} from "@/lib/clinical/odontogram";
import { clinicTodayKey } from "@/lib/clinical/schedule";
import { APPOINTMENT_STATUS_LABEL, formatDate } from "@/lib/utils";
import Odontogram, {
  emptyChartExam,
  type ChartExamFields,
} from "@/components/odontogram";

/** A to-one embed arrives as an array from the untyped client. */
function first<T>(v: T[] | T | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type SavedExam = ChartExamination & {
  findings: ChartFinding[];
  staff: { id: string; full_name: string }[] | null;
};

type AppointmentOption = Appointment & {
  branches: { id: string; name: string }[] | null;
};

type Draft = {
  toothState: ToothState;
  comments: ToothComments;
  exam: ChartExamFields;
  copiedFrom: SavedExam | null;
};

function examFromRecord(e: SavedExam): ChartExamFields {
  return {
    periodontal_screening: e.periodontal_screening,
    occlusion_class: e.occlusion_class,
    overjet_mm: e.overjet_mm,
    overbite: e.overbite,
    midline_deviation: e.midline_deviation,
    crossbite: e.crossbite,
    appliances: e.appliances ?? { braces: false, stayplate: false, other: null },
    tmd:
      e.tmd ??
      { clenching: false, clicking: false, trismus: false, muscle_spasm: false },
    notes: e.notes,
  };
}

function findingsSummary(exam: SavedExam): string {
  const teeth = new Set(exam.findings.map((f) => f.tooth_fdi));
  if (!exam.findings.length) return "No findings charted";
  return `${exam.findings.length} finding${exam.findings.length === 1 ? "" : "s"} on ${teeth.size} ${teeth.size === 1 ? "tooth" : "teeth"}`;
}

/**
 * The Dental Record Chart tab.
 *
 * A saved examination is never mutated: "Start a new chart" copies the last one
 * into a draft, the dentist marks only what changed, and saving writes a new
 * dated snapshot. That is why the next visit can open pre-filled while every
 * earlier visit stays readable exactly as it was signed off.
 */
export default function ChartTab({
  action,
  patientId,
  branches,
  defaultBranchId,
  examinations,
  appointments,
  treatmentCounts = {},
  canWrite,
  initialExamId = null,
  saved = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  patientId: string;
  branches: Branch[];
  defaultBranchId: string | null;
  examinations: SavedExam[];
  appointments: AppointmentOption[];
  /** Procedures already recorded per tooth — read-only overlay on the grid. */
  treatmentCounts?: Record<string, number>;
  canWrite: boolean;
  /** `?exam=` — the examination that was just saved, or one being reviewed. */
  initialExamId?: string | null;
  /** `?saved=1` — show the confirmation after a successful save. */
  saved?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    initialExamId ?? examinations[0]?.id ?? null
  );
  const [draft, setDraft] = useState<Draft | null>(null);

  const selected =
    examinations.find((e) => e.id === selectedId) ?? examinations[0] ?? null;

  // Today's visit first, then the nearest date either side: the appointment a
  // dentist is charting is almost always the one they just finished.
  const today = clinicTodayKey();
  const appointmentOptions = [...appointments]
    .filter((a) => a.status !== "cancelled")
    .sort((a, b) => {
      // Today first (that is the visit being charted), then newest to oldest.
      // Comparing the clinic day string keeps this pure — Date.now() during
      // render makes an unchanged page sort differently between paints.
      const aToday = a.starts_at.slice(0, 10) === today ? 0 : 1;
      const bToday = b.starts_at.slice(0, 10) === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();
    });

  const [appointmentId, setAppointmentId] = useState<string>("");
  const linkedAppointment = draft
    ? appointmentOptions.find((a) => a.id === appointmentId) ?? null
    : selected?.appointment_id
      ? appointmentOptions.find((a) => a.id === selected.appointment_id) ?? null
      : null;

  // The visit's branch: the linked appointment wins (that is where the work
  // happened), then the patient's own branch, then the signed-in user's.
  const branchId =
    linkedAppointment?.branch_id ??
    (draft ? null : selected?.branch_id) ??
    defaultBranchId ??
    branches[0]?.id ??
    "";

  function startDraft(from: SavedExam | null) {
    if (!canWrite) return;
    setDraft({
      toothState: from ? toothStateFromFindings(from.findings) : {},
      comments: from ? commentsFromFindings(from.findings) : {},
      exam: from ? examFromRecord(from) : emptyChartExam(),
      copiedFrom: from,
    });
    // Pre-select today's appointment when there is one, so the common case
    // links the chart to the visit without another decision.
    const todays = appointmentOptions.find((a) => a.starts_at.slice(0, 10) === today);
    setAppointmentId(todays?.id ?? "");
  }

  const rows = draft
    ? findingsFromToothState(draft.toothState, draft.comments)
    : [];
  const payload = JSON.stringify({
    exam: draft?.exam ?? null,
    findings: rows.map((f) => ({
      tooth_fdi: f.tooth_fdi,
      condition_code: f.condition_code,
      surfaces: f.surfaces.join(""),
      comment: f.comment,
    })),
  });

  return (
    <div className="flex flex-col gap-5">
      {saved && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-ok-tint px-4 py-3 text-sm text-ok"
        >
          <CircleCheck size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>
            Examination saved. The next chart will open pre-filled from this
            visit, so only what changed has to be marked.
          </p>
        </div>
      )}

      {!canWrite && (
        <div className="flex items-start gap-2 rounded-md bg-brand-tint px-4 py-3 text-sm">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-brand" />
          <p>
            The dental chart is read-only for secretaries. Only the dentist or an
            administrator can chart findings.
          </p>
        </div>
      )}

      <section className="panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[16rem]">
            <label className="label" htmlFor="visit">
              <History size={13} aria-hidden className="mr-1 inline" />
              Visit
            </label>
            <select
              id="visit"
              className="field"
              value={selected?.id ?? ""}
              disabled={draft !== null || examinations.length === 0}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {examinations.length === 0 && <option value="">No examinations yet</option>}
              {examinations.map((e, i) => (
                <option key={e.id} value={e.id}>
                  {formatDate(e.examined_at)}
                  {i === 0 ? " (latest)" : ""}
                  {first(e.staff)?.full_name ? ` · ${first(e.staff)!.full_name}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {draft ? (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setDraft(null)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button type="submit" form="chart-form" className="btn" disabled={pending}>
                  <Save size={15} aria-hidden />
                  {pending ? "Saving..." : "Save examination"}
                </button>
              </>
            ) : (
              canWrite && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => startDraft(selected)}
                >
                  <CalendarClock size={15} aria-hidden />
                  {selected ? "Start a new chart from this visit" : "Start the first chart"}
                </button>
              )
            )}
          </div>
        </div>

        {draft ? (
          <div className="mt-4 flex flex-col gap-4">
            {draft.copiedFrom ? (
              <p className="rounded-md bg-brand-tint px-3 py-2 text-sm">
                Copied from <b>{formatDate(draft.copiedFrom.examined_at)}</b> — edit
                only what changed. Saving records a new examination; the copied one
                stays as it was.
              </p>
            ) : (
              <p className="rounded-md bg-brand-tint px-3 py-2 text-sm">
                First examination on record for this patient.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="chart_appointment">
                  Link to appointment
                </label>
                <select
                  id="chart_appointment"
                  className="field"
                  value={appointmentId}
                  onChange={(e) => setAppointmentId(e.target.value)}
                >
                  <option value="">Walk-in / no appointment</option>
                  {appointmentOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatDate(a.starts_at)} · {first(a.branches)?.name ?? "—"} ·{" "}
                      {APPOINTMENT_STATUS_LABEL[a.status]}
                    </option>
                  ))}
                </select>
                <p className="hint mt-1">
                  {appointmentOptions.length
                    ? "Today's visit is listed first."
                    : "This patient has no appointments on record."}
                </p>
              </div>
              <div>
                <p className="label">Branch</p>
                <p className="text-sm">
                  {first(linkedAppointment?.branches ?? null)?.name ??
                    branches.find((b) => b.id === branchId)?.name ??
                    "—"}
                </p>
                <p className="hint mt-1">Taken from the linked appointment.</p>
              </div>
            </div>

            <Odontogram
              toothState={draft.toothState}
              onToothStateChange={(toothState) =>
                setDraft({ ...draft, toothState })
              }
              comments={draft.comments}
              onCommentsChange={(comments) => setDraft({ ...draft, comments })}
              exam={draft.exam}
              onExamChange={(exam) => setDraft({ ...draft, exam })}
              treatmentCounts={treatmentCounts}
            />

            {state && !state.ok && (
              <p role="alert" className="error-text">
                {state.message}
              </p>
            )}

            <form id="chart-form" action={formAction} className="flex flex-col gap-2">
              <input type="hidden" name="patient_id" value={patientId} />
              <input type="hidden" name="branch_id" value={branchId} />
              <input type="hidden" name="appointment_id" value={appointmentId} />
              <input type="hidden" name="payload" value={payload} />
              <p className="hint">
                {rows.length} finding{rows.length === 1 ? "" : "s"} ready to save
                {draft.copiedFrom ? " (including unchanged ones carried over)" : ""}.
              </p>
            </form>
          </div>
        ) : selected ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="label">Examined</p>
                <p className="text-sm">{formatDate(selected.examined_at)}</p>
              </div>
              <div>
                <p className="label">Dentist</p>
                <p className="text-sm">{first(selected.staff)?.full_name ?? "—"}</p>
              </div>
              <div>
                <p className="label">Appointment</p>
                <p className="text-sm">
                  {linkedAppointment
                    ? formatDate(linkedAppointment.starts_at)
                    : "Walk-in / not linked"}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted">{findingsSummary(selected)}</p>

            <Odontogram
              toothState={toothStateFromFindings(selected.findings)}
              onToothStateChange={() => {}}
              comments={commentsFromFindings(selected.findings)}
              onCommentsChange={() => {}}
              exam={examFromRecord(selected)}
              onExamChange={() => {}}
              readOnly
              readOnlyHint={
                canWrite
                  ? "Saved examination — start a new chart to record this visit's findings. A numbered badge marks a tooth that already has treatments recorded."
                  : undefined
              }
              treatmentCounts={treatmentCounts}
            />
          </div>
        ) : (
          <div className="mt-6 rounded-md border border-dashed border-line px-6 py-10 text-center">
            <p className="font-medium">Nothing charted yet</p>
            <p className="hint mt-1">
              {canWrite
                ? "Start the first chart for this patient. The next visit will open pre-filled from it."
                : "The dentist has not charted an examination for this patient yet."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
