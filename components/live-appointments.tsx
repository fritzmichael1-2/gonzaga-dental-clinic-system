"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentStatus } from "@/lib/types";
import type { AppointmentWithRefs } from "@/lib/queries";
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_TONE,
  formatTime,
  fullName,
} from "@/lib/utils";
import { updateAppointmentStatus } from "@/app/(app)/patients/actions";

/** Status transitions a secretary realistically needs from the day view. */
const NEXT_STATUSES: Record<AppointmentStatus, AppointmentStatus[]> = {
  requested: ["scheduled", "confirmed", "cancelled"],
  scheduled: ["confirmed", "completed", "cancelled", "no_show"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: ["scheduled"],
  no_show: ["scheduled"],
};

/**
 * The one action worth a single tap on each row.
 *
 * Working a waiting room means repeating the same transition all morning, so
 * burying it in a dropdown made the most common task in the app the slowest.
 * The label is deliberately not the raw status name: a secretary calls it
 * "check in", not "confirmed".
 */
const PRIMARY_ACTION: Partial<
  Record<AppointmentStatus, { to: AppointmentStatus; label: string }>
> = {
  requested: { to: "confirmed", label: "Confirm" },
  scheduled: { to: "confirmed", label: "Check in" },
  confirmed: { to: "completed", label: "Complete" },
  cancelled: { to: "scheduled", label: "Reopen" },
  no_show: { to: "scheduled", label: "Reopen" },
};

const STATUSES_REQUIRING_ACTION: AppointmentStatus[] = [
  "requested",
  "scheduled",
  "confirmed",
];

/**
 * Day list with inline status changes. Cancelling frees the slot immediately
 * because both the unique index and the exclusion constraint only count
 * requested/scheduled/confirmed rows.
 */
export default function LiveAppointments({
  initialAppointments,
}: {
  initialAppointments: AppointmentWithRefs[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Tracked per row: a global pending flag disabled every row's controls while
  // one save was in flight, so a slow request froze the whole waiting room.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function changeStatus(
    id: string,
    status: AppointmentStatus,
    patientName: string,
  ) {
    setError(null);
    setPendingId(id);
    const result = await updateAppointmentStatus(id, status);
    setPendingId(null);

    if (result && !result.ok) {
      setError(`${patientName}: ${result.message}`);
      return;
    }
    setNotice(
      `${patientName} marked ${APPOINTMENT_STATUS_LABEL[status].toLowerCase()}.`,
    );
    startTransition(() => router.refresh());
  }

  if (initialAppointments.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted">
        Nothing booked on this date. Use the form to add one.
      </p>
    );
  }

  const remaining = initialAppointments.filter((a) =>
    STATUSES_REQUIRING_ACTION.includes(a.status),
  ).length;
  const completed = initialAppointments.filter(
    (a) => a.status === "completed",
  ).length;
  const cancelled = initialAppointments.filter(
    (a) => a.status === "cancelled" || a.status === "no_show",
  ).length;

  return (
    <div>
      {/* Announced to assistive tech so a status change is confirmed without
          hunting for the row that changed. */}
      <p role="status" aria-live="polite" className="sr-only">
        {notice}
      </p>

      {/* Answers "where are we up to?" without counting rows. */}
      <p className="border-b border-line px-5 py-2 text-xs text-muted">
        {remaining === 0 ? (
          <>All {initialAppointments.length} settled.</>
        ) : (
          <>
            <span className="font-semibold text-ink-soft">{remaining} still to
            </span> see
          </>
        )}
        {completed > 0 && <> · {completed} completed</>}
        {cancelled > 0 && <> · {cancelled} cancelled or no-show</>}
      </p>

      {error && (
        <p role="alert" className="error-text border-b border-line px-5 py-3">
          {error}
        </p>
      )}
      <ul className="divide-y divide-line">
        {initialAppointments.map((a) => {
          const patient = oneOf(a.patients);
          const branch = oneOf(a.branches);
          const dentist = oneOf(a.staff);
          const options = NEXT_STATUSES[a.status];
          const primary = PRIMARY_ACTION[a.status];
          const name = patient ? fullName(patient) : "Unknown patient";
          const busy = pendingId === a.id;
          const rest = primary
            ? options.filter((s) => s !== primary.to)
            : options;

          return (
            <li
              key={a.id}
              className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 ${
                busy ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-muted">
                  {formatTime(a.starts_at)}–{formatTime(a.ends_at)}
                </p>
                <p className="truncate text-sm font-medium">
                  {patient ? (
                    <Link
                      href={`/patients/${a.patient_id}`}
                      className="text-brand hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </p>
                <p className="hint truncate">
                  {branch?.name ?? "—"} · {dentist?.full_name ?? "Unassigned"}
                  {a.reason ? ` · ${a.reason}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={APPOINTMENT_STATUS_TONE[a.status]}>
                  {APPOINTMENT_STATUS_LABEL[a.status]}
                </span>

                {primary && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeStatus(a.id, primary.to, name)}
                    className="btn-secondary whitespace-nowrap text-xs"
                  >
                    {busy ? "Saving…" : primary.label}
                  </button>
                )}

                {rest.length > 0 && (
                  <select
                    aria-label={`Other statuses for ${name} at ${formatTime(a.starts_at)}`}
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) => {
                      const value = e.target.value as AppointmentStatus;
                      if (value) changeStatus(a.id, value, name);
                    }}
                    className="field w-auto py-1 text-xs"
                  >
                    <option value="">More…</option>
                    {rest.map((s) => (
                      <option key={s} value={s}>
                        {APPOINTMENT_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function oneOf<T>(v: T[] | T | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
