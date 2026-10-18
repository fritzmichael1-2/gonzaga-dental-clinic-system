"use client";

import { useActionState, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { buildSlotsFromWindow, isPast } from "@/lib/clinical/schedule";
import type { PublicAvailability } from "@/lib/public/availability";
import { requestAppointment, type BookingState } from "./actions";

/**
 * Public booking form. Unlike the staff form it takes no patient picker —
 * the patient types their own name/birthdate/contact and the database matches
 * or creates the record. The slot grid is rendered from the anonymous busy
 * intervals returned by public_branch_availability().
 */
export default function BookingForm({
  branchId,
  date,
  availability,
  nowIso,
}: {
  branchId: string;
  date: string;
  availability: PublicAvailability | null;
  /** Clinic "now", resolved on the server (clinicNow()). The default clock
   *  would be the browser's, which disagrees with the preview anchor. */
  nowIso: string;
}) {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(
    requestAppointment,
    null
  );
  const [time, setTime] = useState("");

  const opensAt = availability?.opensAt ?? null;
  const closesAt = availability?.closesAt ?? null;
  const open = availability?.ok === true && availability.open === true && !!opensAt && !!closesAt;

  const slots =
    open && opensAt && closesAt
      ? buildSlotsFromWindow({
          date,
          opensAt,
          closesAt,
          slotMin: availability?.slotMin ?? 30,
          busy: availability?.busy ?? [],
        })
      : [];

  if (state?.ok) {
    return (
      <div className="panel p-6">
        <h2 className="text-lg font-semibold text-ok">Request received</h2>
        <p className="mt-2 text-sm text-ink-soft">{state.message}</p>
        <p className="hint mt-3">
          This is a request, not a confirmed booking. The clinic will contact
          you to confirm the exact time.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      <input type="hidden" name="duration_min" value="30" />

      <div>
        <span className="label">Available times</span>
        {!open ? (
          <p className="hint">
            {availability?.message ?? "Pick a branch and date to see open times."}
          </p>
        ) : slots.length === 0 ? (
          <p className="hint">The clinic is closed on that day.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((slot) => {
              const past = isPast(slot, new Date(nowIso));
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
        <p className="hint mt-2">
          Struck-through times are already booked or have passed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="book_first">
            First name
          </label>
          <input id="book_first" name="first_name" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="book_last">
            Last name
          </label>
          <input id="book_last" name="last_name" required className="field" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="book_birth">
            Date of birth
          </label>
          <input
            id="book_birth"
            name="birthdate"
            type="date"
            required
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="book_contact">
            Contact number
          </label>
          <input
            id="book_contact"
            name="contact_no"
            inputMode="tel"
            required
            placeholder="0917 000 0000"
            className="field"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="book_reason">
          Reason for visit
        </label>
        <input
          id="book_reason"
          name="reason"
          placeholder="Cleaning, tooth pain…"
          className="field"
        />
      </div>

      {state?.ok === false && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !time}
        className="btn-primary w-full sm:w-auto sm:self-start"
      >
        <CalendarPlus size={16} aria-hidden />
        {pending ? "Submitting…" : "Request appointment"}
      </button>
      <p className="hint">
        We will only use these details to schedule and confirm your visit.
      </p>
    </form>
  );
}
