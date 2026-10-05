import type { Appointment, ClinicSettings } from "@/lib/types";
import { LIVE_APPOINTMENT_STATUSES } from "@/lib/types";
import { PREVIEW_ANCHOR_ISO, isPreviewClockPinned } from "@/lib/preview/clock";

export type Slot = {
  start: string; // "HH:MM" local
  end: string; // "HH:MM" local
  startIso: string;
  endIso: string;
  available: boolean;
  /** Which appointment occupies it, when unavailable. */
  conflictId: string | null;
};

type OpeningHours = ClinicSettings["opening_hours"];

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function hhmmOf(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Minutes to ADD to UTC to get clinic-local time.
 *
 * Everything about a clinic day — "today", the 09:00 opening slot, the range a
 * day's appointments are queried over — has to be anchored to the *clinic's*
 * wall clock. Deriving it from `new Date(y, m, d, 9, 0)` silently assumes the
 * server's timezone equals the clinic's, which is false for the usual UTC
 * hosts: a 9:00 AM booking would be stored as 09:00 UTC and display as 5:00 PM
 * in Manila.
 *
 * Asia/Manila is UTC+8 with no daylight saving, so a fixed offset is exact.
 * TODO(CLINIC): change this if the clinic is not in the Philippines.
 */
export const CLINIC_UTC_OFFSET_MINUTES = 480;

/**
 * Compose an absolute UTC instant from a clinic-local date + time.
 *
 * Done with Date.UTC arithmetic rather than local-time constructors so the
 * result does not depend on where the code runs. Sub-minute components are
 * dropped so a slot stays on its grid position.
 */
export function localIso(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  return new Date(utcMs - CLINIC_UTC_OFFSET_MINUTES * 60_000).toISOString();
}

/** The UTC instant corresponding to "now" on the clinic's wall clock. */
export function clinicNow(): Date {
  // Preview data is generated against a fixed instant, so preview mode has to
  // agree with it or "today" points at a day the fixtures never populated.
  const base = isPreviewClockPinned()
    ? new Date(PREVIEW_ANCHOR_ISO).getTime()
    : Date.now();
  return new Date(base + CLINIC_UTC_OFFSET_MINUTES * 60_000);
}

/** Today as a clinic-local YYYY-MM-DD key. */
export function clinicTodayKey(): string {
  const shifted = clinicNow();
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/** Move a YYYY-MM-DD key by whole days, staying in UTC arithmetic. */
export function shiftDateKey(key: string, days: number): string {
  const [y, mo, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, mo - 1, d));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The UTC window covering one clinic-local calendar day.
 *
 * Querying `date + "T00:00:00Z"` would cut the day 8 hours out of place.
 */
export function clinicDayRange(date: string): { fromIso: string; toIso: string } {
  return {
    fromIso: localIso(date, "00:00"),
    // +1 day at 00:00 minus 1ms, so the range is inclusive of the last instant
    // without spilling into the next clinic day.
    toIso: new Date(new Date(localIso(date, "00:00")).getTime() + 86400_000 - 1)
      .toISOString(),
  };
}

/**
 * The clinic-local YYYY-MM-DD key an absolute timestamp falls on. Used to place
 * an appointment on the calendar.
 */
export function clinicDateKey(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + CLINIC_UTC_OFFSET_MINUTES * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/** Day of week for a YYYY-MM-DD key: 0 = Sunday .. 6 = Saturday. */
export function weekdayOf(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  // UTC getters: a date-only key has no timezone of its own, and mixing local
  // getters here would misclassify days on a UTC host.
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function isBranchOpenOn(
  openingHours: OpeningHours,
  date: string
): boolean {
  const hours = openingHours?.[String(weekdayOf(date))];
  return Array.isArray(hours) && hours.length === 2;
}

/**
 * Whether a branch is open at this moment, and how to describe it.
 *
 * `isBranchOpenOn` only answers "does it trade on this date", which is enough
 * for a single-site day view but wrong on a two-branch overview: a branch whose
 * Saturday window was 09:00-13:00 would still read "open" at 16:00.
 *
 * The branch's own `opens_at`/`closes_at` wins, because that is the only place
 * the schema records per-site hours and the two branches are independently
 * located. The clinic-wide weekly map is the fallback for a branch that has no
 * window of its own. Note the per-site columns are plain times with no weekday
 * map, so they are read as a daily window — `TODO(CLINIC)` tracks confirming
 * that with the clinic.
 */
export function branchOpenState(opts: {
  opensAt?: string | null;
  closesAt?: string | null;
  openingHours?: OpeningHours | null;
  date: string;
  now?: Date;
}): { open: boolean; hours: string | null; label: string } {
  const now = opts.now ?? clinicNow();

  if (opts.opensAt && opts.closesAt) {
    const hours = `${opts.opensAt}\u2013${opts.closesAt}`;
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return {
      open: minutes >= minutesOf(opts.opensAt) && minutes < minutesOf(opts.closesAt),
      hours,
      label: hours,
    };
  }

  const window = opts.openingHours?.[String(weekdayOf(opts.date))];
  if (!Array.isArray(window) || window.length !== 2) {
    return { open: false, hours: null, label: "Closed today" };
  }
  const [from, to] = window as [string, string];
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return {
    open: minutes >= minutesOf(from) && minutes < minutesOf(to),
    hours: `${from}\u2013${to}`,
    label: `${from}\u2013${to}`,
  };
}

/**
 * Build the day's slot grid for one branch and mark availability against the
 * existing appointments.
 *
 * This is the UI half of the double-booking fix. The database exclusion
 * constraint (`appointments_no_dentist_overlap`) is the real guarantee — this
 * only stops staff being offered a slot that is already taken.
 */
export function buildDaySlots(opts: {
  date: string;
  branchId: string;
  openingHours: OpeningHours;
  slotMin: number;
  appointments: Appointment[];
  /** Ids of appointments the current user is allowed to see conflict info for. */
  now?: Date;
}): Slot[] {
  const hours = opts.openingHours?.[String(weekdayOf(opts.date))];
  if (!Array.isArray(hours) || hours.length !== 2) return [];

  const [open, close] = hours;
  const startMin = minutesOf(open);
  const endMin = minutesOf(close);
  const step = opts.slotMin;

  const busy = opts.appointments.filter(
    (a) =>
      a.branch_id === opts.branchId &&
      LIVE_APPOINTMENT_STATUSES.includes(a.status)
  );

  const slots: Slot[] = [];
  for (let m = startMin; m + step <= endMin; m += step) {
    const start = hhmmOf(m);
    const end = hhmmOf(m + step);
    const startIso = localIso(opts.date, start);
    const endIso = localIso(opts.date, end);

    const conflict = busy.find((a) => {
      const s = new Date(a.starts_at).getTime();
      const e = new Date(a.ends_at).getTime();
      const ms = new Date(startIso).getTime();
      const me = new Date(endIso).getTime();
      // Half-open [start, end) so back-to-back slots do not collide.
      return s < me && e > ms;
    });

    slots.push({
      start,
      end,
      startIso,
      endIso,
      available: !conflict,
      conflictId: conflict?.id ?? null,
    });
  }

  return slots;
}

/** True when the slot's start is already in the past. */
export function isPast(slot: Slot, now: Date = new Date()): boolean {
  return new Date(slot.startIso).getTime() <= now.getTime();
}

/**
 * Validate a booking against the clinic's rules before hitting the database,
 * so the user gets a readable message instead of a Postgres constraint error.
 */
export function validateBooking(opts: {
  date: string;
  time: string;
  durationMin: number;
  openingHours: OpeningHours;
  slotMin: number;
  appointments: Appointment[];
  branchId: string;
  patientId: string;
  dentistId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const { date, time, durationMin, openingHours, appointments } = opts;

  if (!isBranchOpenOn(openingHours, date)) {
    return { ok: false, reason: "The clinic is closed on that day." };
  }

  const hours = openingHours[String(weekdayOf(date))] as [string, string];
  const startMin = minutesOf(time);
  const endMin = startMin + durationMin;
  if (endMin > minutesOf(hours[1])) {
    return { ok: false, reason: "That appointment runs past closing time." };
  }

  // Slot grid alignment: bookings must land on the grid the staff see.
  if ((startMin - minutesOf(hours[0])) % opts.slotMin !== 0) {
    return { ok: false, reason: "Start time is not aligned to the slot grid." };
  }

  const proposedStart = new Date(localIso(date, time)).getTime();
  const proposedEnd = proposedStart + durationMin * 60_000;

  // Same patient already booked and live at this time.
  const patientClash = appointments.find(
    (a) =>
      a.patient_id === opts.patientId &&
      LIVE_APPOINTMENT_STATUSES.includes(a.status) &&
      new Date(a.starts_at).getTime() < proposedEnd &&
      new Date(a.ends_at).getTime() > proposedStart
  );
  if (patientClash) {
    return {
      ok: false,
      reason: "This patient already has an appointment at that time.",
    };
  }

  // Dentist double-booking. Mirrors the DB exclusion constraint.
  if (opts.dentistId) {
    const dentistClash = appointments.find(
      (a) =>
        a.dentist_id === opts.dentistId &&
        LIVE_APPOINTMENT_STATUSES.includes(a.status) &&
        new Date(a.starts_at).getTime() < proposedEnd &&
        new Date(a.ends_at).getTime() > proposedStart
    );
    if (dentistClash) {
      return {
        ok: false,
        reason: "The dentist is already booked for that slot.",
      };
    }
  }

  return { ok: true };
}

/** Month grid (6 weeks x 7 days) starting Monday, for the calendar view. */
export function monthGrid(anchorKey: string): string[] {
  const [ay, am] = anchorKey.split("-").map(Number);
  // UTC arithmetic on a date-only key: local getters would shift the grid on a
  // host whose timezone differs from the clinic's.
  const first = new Date(Date.UTC(ay, am - 1, 1));
  // getUTCDay(): 0 = Sunday. Shift so the grid starts on Monday.
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - offset);

  const days: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < 42; i++) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}