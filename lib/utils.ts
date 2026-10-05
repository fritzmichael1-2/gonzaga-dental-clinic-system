import type { AppointmentStatus, StaffRole } from "@/lib/types";

/**
 * IANA name for the clinic's timezone.
 *
 * Paired with CLINIC_UTC_OFFSET_MINUTES in lib/clinical/schedule.ts. The two
 * must agree: the offset does the arithmetic, this one drives Intl formatting.
 */
export const CLINIC_TIME_ZONE = "Asia/Manila";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    timeZone: CLINIC_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A clinic-local calendar day (the `YYYY-MM-DD` keys the schedule helpers
 * produce) rendered as a date, with no time and no timezone conversion.
 *
 * Deliberately not `new Date(key)`: a bare `YYYY-MM-DD` is parsed as UTC
 * midnight, so formatting it in Asia/Manila reports 08:00 and — in any
 * negative-offset zone — the wrong day as well. These keys are already
 * clinic-local calendar dates, so the components are formatted directly.
 */
export function formatClinicDay(dateKey: string | null | undefined): string {
  if (!dateKey) return "\u2014";
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d || Number.isNaN(y)) return "\u2014";
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
  });
  return `${month} ${d}, ${y}`;
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * YYYY-MM-DD on the clinic's wall clock.
 *
 * Deliberately not the host's local date: a UTC server during Manila's
 * early hours would label the wrong calendar day.
 */
export function toDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Clock time as the clinic sees it.
 *
 * Without an explicit timeZone, toLocaleTimeString uses the *server's* zone, so
 * a 9:00 AM appointment would render as 1:00 AM on a UTC host.
 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ageFrom(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  // Age is a whole-year comparison against *today* in the clinic's timezone.
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const part = (t: string) => Number(nowParts.find((x) => x.type === t)?.value);
  const ny = part("year");
  const nmo = part("month");
  const nd = part("day");
  let a = ny - b.getFullYear();
  const m = nmo - (b.getMonth() + 1);
  if (m < 0 || (m === 0 && nd < b.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

export function fullName(p: {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
}): string {
  return [p.first_name, p.middle_name, p.last_name]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  dentist: "Dentist",
  secretary: "Secretary",
  admin: "Administrator",
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const APPOINTMENT_STATUS_TONE: Record<AppointmentStatus, string> = {
  requested: "badge-warn",
  scheduled: "badge-info",
  confirmed: "badge-ok",
  completed: "badge-neutral",
  cancelled: "badge-muted",
  no_show: "badge-danger",
};

/** Show at most `max` characters, ellipsising the rest. */
export function truncate(s: string | null | undefined, max: number): string {
  if (!s) return "—";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}