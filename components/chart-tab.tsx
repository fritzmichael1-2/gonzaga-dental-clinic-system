"use client";

import { useActionState, useState } from "react";
import {
  CalendarClock,
  CircleCheck,
  History,
  PenLine,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
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
import {
  clinicDateKey,
  clinicTodayKey,
  localIso,
  shiftDateKey,
} from "@/lib/clinical/schedule";
import { APPOINTMENT_STATUS_LABEL, formatDate, formatDateOnly } from "@/lib/utils";
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
  recorder: { id: string; full_name: string }[] | null;
};

type AppointmentOption = Appointment & {
  branches: { id: string; name: string }[] | null;
};

type DentistOption = { id: string; full_name: string; branch_id: string | null };

type Role = "dentist" | "secretary" | "admin";

type Draft = {
  toothState: ToothState;
  comments: ToothComments;
  exam: ChartExamFields;
  copiedFrom: SavedExam | null;
  /** Set when correcting a saved entry instead of charting a new visit. */
  editingId: string | null;
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
 *
 * A secretary may transcribe a visit on a named dentist's behalf. The chart is
 * still the dentist's: `examined_by` is frozen once saved, and only the same
 * day may she correct her own typing. After that the entry is the record.
 */
export default function ChartTab({
  action,
  deleteAction,
  patientId,
  branches,
  defaultBranchId,
  examinations,
  appointments,
  dentists,
  role,
  currentUserId,
  treatmentCounts = {},
  initialExamId = null,
  saved = false,
  corrected = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  deleteAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  patientId: string;
  /** Branches the signed-in user may write to. */
  branches: Branch[];
  defaultBranchId: string | null;
  examinations: SavedExam[];
  appointments: AppointmentOption[];
  /** Active dentists; filtered per chosen branch (clinic-wide ones always). */
  dentists: DentistOption[];
  role: Role;
  currentUserId: string;
  /** Procedures already recorded per tooth — read-only overlay on the grid. */
  treatmentCounts?: Record<string, number>;
  /** `?exam=` — the examination that was just saved, or one being reviewed. */
  initialExamId?: string | null;
  /** `?saved=1` — show the confirmation after a successful save. */
  saved?: boolean;
  /** `?corrected=1` — show the confirmation after a correction. */
  corrected?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    initialExamId ?? examinations[0]?.id ?? null
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [branchOverride, setBranchOverride] = useState<string | null>(null);
  const [examinedBy, setExaminedBy] = useState<string>(
    role === "dentist" ? currentUserId : ""
  );
  const [examinedOn, setExaminedOn] = useState<string>(clinicTodayKey());

  const selected =
    examinations.find((e) => e.id === selectedId) ?? examinations[0] ?? null;

  const clinical = role === "dentist" || role === "admin";
  // A secretary with no branch has nowhere to write; the page passes only the
  // branches she may use, so an empty list is the honest signal.
  const canRecord = clinical || branches.length > 0;

  const today = clinicTodayKey();
  // Only visits that have already happened can be charted; a future booking
  // belongs in Appointments until the patient actually shows up.
  const appointmentOptions = [...appointments]
    .filter((a) => a.status !== "cancelled")
    .filter((a) => clinicDateKey(a.starts_at) <= today)
    .sort((a, b) => {
      // Today first (that is the visit being charted), then newest to oldest.
      // Comparing the clinic day string keeps this pure — Date.now() during
      // render makes an unchanged page sort differently between paints.
      const aToday = clinicDateKey(a.starts_at) === today ? 0 : 1;
      const bToday = clinicDateKey(b.starts_at) === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();
    });

  const [appointmentId, setAppointmentId] = useState<string>("");
  const linkedAppointment = draft
    ? appointmentOptions.find((a) => a.id === appointmentId) ?? null
    : selected?.appointment_id
      ? appointmentOptions.find((a) => a.id === selected.appointment_id) ?? null
      : null;

  // The visit's branch: an explicit choice wins, then the linked appointment
  // (that is where the work happened), then the patient's, then the operator's.
  const branchId =
    branchOverride ??
    linkedAppointment?.branch_id ??
    (draft ? null : selected?.branch_id) ??
    defaultBranchId ??
    branches[0]?.id ??
    "";

  const dentistOptions = dentists.filter(
    (d) => !d.branch_id || d.branch_id === branchId
  );

  function startDraft(from: SavedExam | null) {
    if (!canRecord) return;
    setDraft({
      toothState: from ? toothStateFromFindings(from.findings) : {},
      comments: from ? commentsFromFindings(from.findings) : {},
      exam: from ? examFromRecord(from) : emptyChartExam(),
      copiedFrom: from,
      editingId: null,
    });
    // Pre-select today's appointment when there is one, so the common case
    // links the chart to the visit without another decision.
    const todays = appointmentOptions.find(
      (a) => clinicDateKey(a.starts_at) === today
    );
    setAppointmentId(todays?.id ?? "");
    setBranchOverride(null);
    setExaminedOn(todays ? clinicDateKey(todays.starts_at) : today);
    setExaminedBy((prev) => {
      const eligible = dentists.filter(
        (d) => !d.branch_id || d.branch_id === (todays?.branch_id ?? branchId)
      );
      if (eligible.some((d) => d.id === prev)) return prev;
      if (clinical) return currentUserId;
      return eligible[0]?.id ?? "";
    });
  }

  /** A secretary may fix her own typing until the clinic day ends. */
  function canCorrect(exam: SavedExam): boolean {
    return (
      role === "secretary" &&
      exam.recorded_by === currentUserId &&
      clinicDateKey(exam.created_at) === today
    );
  }

  function startCorrection(exam: SavedExam) {
    setDraft({
      toothState: toothStateFromFindings(exam.findings),
      comments: commentsFromFindings(exam.findings),
      exam: examFromRecord(exam),
      copiedFrom: null,
      editingId: exam.id,
    });
    setAppointmentId(exam.appointment_id ?? "");
    setBranchOverride(exam.branch_id);
    setExaminedBy(exam.examined_by ?? "");
    setExaminedOn(clinicDateKey(exam.examined_at));
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

  const overAYear = examinedOn < shiftDateKey(today, -365);
  const editing = Boolean(draft?.editingId);
  const recordedBy = first(selected?.recorder)?.full_name ?? null;
  const examinedBySaved = first(selected?.staff)?.full_name ?? null;

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

      {corrected && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-ok-tint px-4 py-3 text-sm text-ok"
        >
          <CircleCheck size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>
            Correction saved. The visit date and the examining dentist stay as
            they were; only the transcription changed.
          </p>
        </div>
      )}

      {role === "secretary" && (
        <div className="flex items-start gap-2 rounded-md bg-brand-tint px-4 py-3 text-sm">
          <PenLine size={16} aria-hidden className="mt-0.5 shrink-0 text-brand" />
          <p>
            You can enter this chart on the dentist&apos;s behalf, including from
            a paper chart. The dentist is recorded as the examiner and the record
            shows both names. You can fix your own entry until the end of the day;
            after that it needs the dentist or an administrator.
          </p>
        </div>
      )}

      {!canRecord && (
        <div className="flex items-start gap-2 rounded-md bg-warn-tint px-4 py-3 text-sm text-warn">
          <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>
            Your account has no branch assigned, so there is nowhere to record a
            chart. Ask an administrator to assign one.
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
                  {formatDateOnly(e.examined_at)}
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
                  {pending
                    ? "Saving..."
                    : editing
                      ? "Save correction"
                      : "Save examination"}
                </button>
              </>
            ) : (
              canRecord && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => startDraft(selected)}
                >
                  <CalendarClock size={15} aria-hidden />
                  {selected
                    ? "Start a new chart from this visit"
                    : "Start the first chart"}
                </button>
              )
            )}
          </div>
        </div>

        {draft ? (
          <div className="mt-4 flex flex-col gap-4">
            {editing ? (
              <p className="rounded-md bg-brand-tint px-3 py-2 text-sm">
                Correcting the entry from{" "}
                <b>{formatDateOnly(localIso(examinedOn, "12:00"))}</b>. The examining
                dentist and the visit date cannot be changed — remove the entry
                and enter it again if either was wrong.
              </p>
            ) : draft.copiedFrom ? (
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
                <label className="label" htmlFor="chart_examined_by">
                  Examined by
                </label>
                <select
                  id="chart_examined_by"
                  className="field"
                  value={examinedBy}
                  onChange={(e) => setExaminedBy(e.target.value)}
                  disabled={editing}
                >
                  <option value="">Choose the dentist</option>
                  {dentistOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                      {!d.branch_id ? " (clinic-wide)" : ""}
                    </option>
                  ))}
                </select>
                <p className="hint mt-1">
                  {dentistOptions.length
                    ? "The dentist who authored this chart, not whoever typed it."
                    : "No active dentist is available for this branch."}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="chart_examined_on">
                  Examined on
                </label>
                <input
                  id="chart_examined_on"
                  type="date"
                  className="field"
                  value={examinedOn}
                  max={today}
                  onChange={(e) => setExaminedOn(e.target.value)}
                  disabled={editing}
                />
                <p className={`hint mt-1 ${overAYear ? "text-warn" : ""}`}>
                  {overAYear
                    ? "That date is over a year ago — check the year."
                    : "The visit date. Defaults to the linked appointment, else today."}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="chart_appointment">
                  Link to appointment
                </label>
                <select
                  id="chart_appointment"
                  className="field"
                  value={appointmentId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAppointmentId(next);
                    const appt = appointmentOptions.find((a) => a.id === next);
                    if (appt) {
                      setBranchOverride(null);
                      setExaminedOn(clinicDateKey(appt.starts_at));
                    }
                  }}
                  disabled={editing}
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
                    ? "Only visits up to today are listed; today's comes first."
                    : "This patient has no past appointments on record."}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="chart_branch">
                  Branch
                </label>
                <select
                  id="chart_branch"
                  className="field"
                  value={branchId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBranchOverride(next);
                    setExaminedBy((prev) =>
                      dentists.some(
                        (d) =>
                          d.id === prev &&
                          (!d.branch_id || d.branch_id === next)
                      )
                        ? prev
                        : clinical
                          ? currentUserId
                          : ""
                    );
                  }}
                  disabled={editing || branches.length <= 1}
                >
                  {branches.length === 0 && <option value="">No branch</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="hint mt-1">
                  Where the visit belongs. Taken from the linked appointment
                  unless changed.
                </p>
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
              <input type="hidden" name="examined_by" value={examinedBy} />
              <input type="hidden" name="examined_on" value={examinedOn} />
              <input
                type="hidden"
                name="examination_id"
                value={draft.editingId ?? ""}
              />
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
                <p className="text-sm">{formatDateOnly(selected.examined_at)}</p>
              </div>
              <div>
                <p className="label">Dentist</p>
                <p className="text-sm">{examinedBySaved ?? "—"}</p>
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

            {recordedBy &&
              examinedBySaved &&
              recordedBy !== examinedBySaved && (
                <p className="text-sm text-ink-soft">
                  Examined by <b>{examinedBySaved}</b> · entered by{" "}
                  <b>{recordedBy}</b> on {formatDate(selected.created_at)}.
                </p>
              )}

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
                clinical
                  ? "Saved examination — start a new chart to record this visit's findings. A numbered badge marks a tooth that already has treatments recorded."
                  : undefined
              }
              treatmentCounts={treatmentCounts}
            />

            {canCorrect(selected) && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2">
                <p className="mr-auto text-sm text-ink-soft">
                  You typed this entry today. Fix a mistyped tooth or remove it.
                </p>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => startCorrection(selected)}
                >
                  <PenLine size={14} aria-hidden />
                  Fix this entry
                </button>
                <DeleteChartEntry
                  action={deleteAction}
                  patientId={patientId}
                  examinationId={selected.id}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-md border border-dashed border-line px-6 py-10 text-center">
            <p className="font-medium">Nothing charted yet</p>
            <p className="hint mt-1">
              {canRecord
                ? "Start the first chart for this patient. The next visit will open pre-filled from it."
                : "The dentist has not charted an examination for this patient yet."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/** Remove a same-day secretary entry; the database decides if it may go. */
function DeleteChartEntry({
  action,
  patientId,
  examinationId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  patientId: string;
  examinationId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null
  );

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Remove this chart entry? The visitor's examination will be gone and would have to be entered again."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="examination_id" value={examinationId} />
      <button type="submit" className="btn-ghost text-danger" disabled={pending}>
        <Trash2 size={14} aria-hidden />
        {pending ? "Removing..." : "Remove entry"}
      </button>
      {state && !state.ok && (
        <p role="alert" className="error-text mt-1">
          {state.message}
        </p>
      )}
    </form>
  );
}
