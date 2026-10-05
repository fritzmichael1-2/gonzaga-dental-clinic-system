import Link from "next/link";
import { CalendarDays, Plus, Search } from "lucide-react";
import { requireStaff } from "@/lib/security/session";
import {
  clinicNow,
  clinicTodayKey,
  clinicDayRange,
} from "@/lib/clinical/schedule";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listRecentTreatments,
  one,
  type BranchRef,
  type NameRef,
} from "@/lib/queries";
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_TONE,
  formatClinicDay,
  formatDate,
  formatTime,
  fullName,
} from "@/lib/utils";
import { LIVE_APPOINTMENT_STATUSES } from "@/lib/types";
import { Callout, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Dashboard" };

type TodayRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  patients: NameRef[] | null;
  branches: BranchRef[] | null;
};

/**
 * The rolling-7-day cutoff for "this week".
 *
 * Derived from `clinicNow()` rather than `Date.now()`: these are the same
 * measure the two-branch overview reports per branch, and reading the raw clock
 * here made the two disagree under preview, where the data is anchored to a
 * fixed instant but `Date.now()` still returns the real one. The 8-hour offset
 * `clinicNow()` carries is immaterial to a 7-day window.
 */
function weekAgoIso(now: Date): string {
  return new Date(now.getTime() - 7 * 86400_000).toISOString();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const session = await requireStaff();
  const { denied } = await searchParams;
  const supabase = await createSupabaseServerClient();
  // Clock reads live outside the component body so the render is stable.
  const now = clinicNow();
  const today = clinicTodayKey();

  const [
    { count: patientCount },
    { count: newThisWeek },
    { data: todayRows },
    recentTreatments,
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgoIso(now)),
    supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, patients ( first_name, last_name ), branches ( id, name )"
      )
      .gte("starts_at", clinicDayRange(today).fromIso)
      .lte("starts_at", clinicDayRange(today).toIso)
      .order("starts_at"),
    listRecentTreatments(6),
  ]);

  const appointments = (todayRows ?? []) as TodayRow[];
  const liveCount = appointments.filter((a) =>
    LIVE_APPOINTMENT_STATUSES.includes(a.status as never)
  ).length;

  return (
    <>
      <PageHeader
        title={`Good day, ${session.fullName.split(" ")[0]}`}
        description={`Today is ${formatClinicDay(today)}`}
        actions={
          <>
            <Link href="/patients" className="btn-ghost">
              <Search size={16} aria-hidden />
              Find a patient
            </Link>
            <Link href="/patients/new" className="btn-primary">
              <Plus size={16} aria-hidden />
              Register patient
            </Link>
          </>
        }
      />

      {denied && (
        <div className="mb-5">
          <Callout tone="warn" title="That page is not available to your role">
            You were redirected back to the dashboard. If you believe this is
            wrong, ask the clinic administrator to review your role.
          </Callout>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Active patients"
          value={patientCount ?? 0}
          hint={
            // A secretary is scoped to one branch by the database, so telling
            // them the directory spans both is simply wrong on their screen.
            session.role === "secretary"
              ? "At your branch"
              : "Searchable from either branch"
          }
        />
        <Stat
          label="Registered this week"
          value={newThisWeek ?? 0}
          hint="New intake records"
        />
        <Stat
          label="Appointments today"
          value={liveCount}
          hint={`${appointments.length} including cancelled`}
        />
        <Stat
          label="Recorded procedures"
          value={recentTreatments.length}
          hint="Most recent 6 shown below"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Today&apos;s schedule</h2>
            <Link
              href="/appointments"
              className="-my-1 inline-block py-1 text-xs font-semibold text-brand hover:underline"
            >
              Full calendar
            </Link>
          </div>
          {appointments.length ? (
            <ul className="divide-y divide-line">
              {appointments.map((a) => {
                const patient = one(a.patients);
                const branch = one(a.branches);
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {patient ? fullName(patient) : "Unknown patient"}
                      </p>
                      <p className="hint truncate">
                        {formatTime(a.starts_at)}–{formatTime(a.ends_at)} ·{" "}
                        {branch?.name ?? "—"}
                      </p>
                    </div>
                    <span
                      className={
                        APPOINTMENT_STATUS_TONE[
                          a.status as keyof typeof APPOINTMENT_STATUS_TONE
                        ] ?? "badge-muted"
                      }
                    >
                      {APPOINTMENT_STATUS_LABEL[
                        a.status as keyof typeof APPOINTMENT_STATUS_LABEL
                      ] ?? a.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No appointments scheduled today.
            </p>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Recent treatment entries</h2>
            <span className="hint">Replaces the paper index card</span>
          </div>
          {recentTreatments.length ? (
            <ul className="divide-y divide-line">
              {recentTreatments.map((t) => {
                const patient = one(t.patients);
                const branch = one(t.branches);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {t.procedure_name}
                      </p>
                      <p className="hint truncate">
                        {patient ? fullName(patient) : "Unknown patient"} ·{" "}
                        {branch?.name ?? "—"}
                      </p>
                    </div>
                    <span className="hint shrink-0">
                      {formatDate(t.performed_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No treatment entries recorded yet.
            </p>
          )}
        </section>
      </div>

      <p className="hint mt-6 flex items-center gap-2">
        <CalendarDays size={14} aria-hidden />
        Both branches share one record set, so a patient seen at either branch
        has a single treatment history.
      </p>
    </>
  );
}