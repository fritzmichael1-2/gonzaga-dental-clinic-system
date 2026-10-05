"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CalendarPlus } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type { Branch, ClinicSettings } from "@/lib/types";
import { buildDaySlots, isPast } from "@/lib/clinical/schedule";
import { fullName } from "@/lib/utils";
import type { AppointmentWithRefs } from "@/lib/queries";

/**
 * Booking form with a live slot grid.
 *
 * The grid is advisory — the database exclusion constraint
 * (`appointments_no_dentist_overlap`) is the actual guarantee against
 * double-booking. This just stops staff being offered a taken slot.
 */
export default function AppointmentForm({
  action,
  appointments,
  branches,
  dentists,
  settings,
  defaultBranchId,
  defaultDate,
  defaultPatientId = "",
  patients,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  appointments: AppointmentWithRefs[];
  branches: Branch[];
  dentists: { id: string; full_name: string }[];
  settings: ClinicSettings | null;
  defaultBranchId: string | null;
  defaultDate: string;
  defaultPatientId?: string;
  patients: {
    id: string;
    patient_no: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
  }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null
  );
  const fieldErrors = (state && !state.ok ? state.fieldErrors : undefined) ?? {};

  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [dentistId, setDentistId] = useState(dentists[0]?.id ?? "");

  const slotMin = settings?.default_slot_min ?? 30;
  const openingHours = settings?.opening_hours ?? {};

  const slots =
    branchId && date
      ? buildDaySlots({
          date,
          branchId,
          openingHours,
          slotMin,
          appointments: appointments as never,
        })
      : [];

  return (
    <form action={formAction} className="flex flex-col gap-5 p-5">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="patient_id">
            Patient
          </label>
          <select
            id="patient_id"
            name="patient_id"
            required
            defaultValue={defaultPatientId}
            className="field"
          >
            <option value="">Choose patient</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p)} — {p.patient_no}
              </option>
            ))}
          </select>
          {patients.length === 0 && (
            <p className="hint mt-1">
              No active patients yet.{" "}
              <Link
                href="/patients/new"
                className="font-medium text-brand hover:underline"
              >
                Register one first
              </Link>
              .
            </p>
          )}
          {fieldErrors.patient_id && (
            <p className="error-text mt-1">{fieldErrors.patient_id}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="appt_branch">
            Branch
          </label>
          <select
            id="appt_branch"
            name="branch_id"
            required
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="field"
          >
            <option value="">Choose branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {fieldErrors.branch_id && (
            <p className="error-text mt-1">{fieldErrors.branch_id}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="appt_date">
            Date
          </label>
          <input
            id="appt_date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setTime("");
            }}
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="appt_duration">
            Duration
          </label>
          <select
            id="appt_duration"
            name="duration_min"
            defaultValue={slotMin}
            className="field"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="appt_dentist">
            Dentist
          </label>
          <select
            id="appt_dentist"
            name="dentist_id"
            value={dentistId}
            onChange={(e) => setDentistId(e.target.value)}
            className="field"
          >
            <option value="">Unassigned</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="label">Available slots</span>
        {!branchId ? (
          <p className="hint">Choose a branch to see its schedule.</p>
        ) : slots.length === 0 ? (
          <p className="hint">The clinic is closed on that day.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((slot) => {
              const past = isPast(slot);
              const disabled = !slot.available || past;
              const selected = time === slot.start;
              return (
                <button
                  key={slot.startIso}
                  type="button"
                  disabled={disabled}
                  onClick={() => setTime(slot.start)}
                  aria-pressed={selected}
                  title={
                    past
                      ? "Time has already passed"
                      : slot.available
                        ? "Available"
                        : "Already booked"
                  }
                  className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition ${
                    selected
                      ? "border-brand bg-brand text-white"
                      : disabled
                        ? "cursor-not-allowed border-line bg-surface-2 text-muted line-through"
                        : "border-line bg-surface text-ink hover:border-brand"
                  }`}
                >
                  {slot.start}
                </button>
              );
            })}
          </div>
        )}
        <input type="hidden" name="time" value={time} />
        {fieldErrors.time && (
          <p className="error-text mt-1">{fieldErrors.time}</p>
        )}
        <p className="hint mt-2">
          Struck-through slots are taken or already past. Struck-through
          availability is enforced by a database constraint, so two staff cannot
          book the same dentist at once.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="reason">
            Reason for visit
          </label>
          <input
            id="reason"
            name="reason"
            placeholder="Cleaning, tooth pain…"
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="appt_status">
            Status
          </label>
          <select id="appt_status" name="status" className="field" defaultValue="scheduled">
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="requested">Requested</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="appt_notes">
          Notes
        </label>
        <textarea id="appt_notes" name="notes" rows={2} className="field" />
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
        <button
          type="submit"
          disabled={pending || !time}
          className="btn-primary"
        >
          <CalendarPlus size={16} aria-hidden />
          {pending ? "Booking…" : "Book appointment"}
        </button>
      </div>
    </form>
  );
}