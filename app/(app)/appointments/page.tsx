import Link from "next/link";
import { requireStaff } from "@/lib/security/session";
import {
  listAppointments,
  listAssignableDentists,
  listBranches,
  listPatientsForPicker,
  getClinicSettings,
} from "@/lib/queries";
import {
  monthGrid,
  isBranchOpenOn,
  clinicTodayKey,
  clinicDayRange,
  clinicDateKey,
  shiftDateKey,
} from "@/lib/clinical/schedule";
import { formatDateOnly } from "@/lib/utils";
import LiveAppointments from "@/components/live-appointments";
import { PageHeader } from "@/components/ui";
import AppointmentForm from "@/components/appointment-form";
import { createAppointment } from "../patients/actions";

export const metadata = { title: "Appointments" };

type Params = {
  branch?: string;
  date?: string;
  patient?: string;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const session = await requireStaff();

  // Anchored to the clinic's wall clock, not the server's.
  const today = clinicTodayKey();
  const date = params.date ?? today;
  const branchFilter = params.branch ?? session.branchId ?? "";

  const [branches, dentists, settings, patients] = await Promise.all([
    listBranches(),
    listAssignableDentists(),
    getClinicSettings(),
    listPatientsForPicker(200),
  ]);

  // A two-week window is enough for the month grid dots at the top.
  const windowStart = clinicDayRange(today).fromIso;
  const windowEnd = clinicDayRange(shiftDateKey(today, 45)).toIso;

  // The whole clinic-local day, not 00:00Z-24:00Z.
  const dayRange = clinicDayRange(date);

  const dayAppointments = await listAppointments({
    fromIso: dayRange.fromIso,
    toIso: dayRange.toIso,
    branchId: branchFilter || undefined,
  });

  const windowAppointments = await listAppointments({
    fromIso: windowStart,
    toIso: windowEnd,
  });

  const grid = monthGrid(today);
  const countsByDate = new Map<string, number>();
  for (const a of windowAppointments) {
    const key = clinicDateKey(a.starts_at);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Shared schedule for both branches, replacing the paper logbook."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                {MONTH_NAMES[Number(today.slice(5, 7)) - 1]}{" "}
                {today.slice(0, 4)}
              </h2>
              <span className="hint">Dots show scheduled volume</span>
            </div>
            <div className="grid grid-cols-7 gap-px bg-line">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div
                  key={d}
                  className="min-w-0 bg-surface px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-muted uppercase"
                >
                  {d}
                </div>
              ))}
              {grid.map((day) => {
                const count = countsByDate.get(day) ?? 0;
                const isToday = day === today;
                const isSelected = day === date;
                const open = settings
                  ? isBranchOpenOn(settings.opening_hours, day)
                  : true;
                const inMonth = day.slice(0, 7) === today.slice(0, 7);

                return (
                  <Link
                    key={day}
                    href={`/appointments?date=${day}${
                      branchFilter ? `&branch=${branchFilter}` : ""
                    }`}
                    className={`relative min-h-16 min-w-0 bg-surface p-2 transition hover:bg-surface-2 ${
                      !inMonth ? "opacity-40" : ""
                    } ${isSelected ? "ring-2 ring-brand ring-inset" : ""}`}
                  >
                    <span
                      className={`text-xs font-semibold ${
                        isToday ? "text-brand" : "text-ink-soft"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {!open && (
                      <span className="hint ml-1 hidden sm:inline">closed</span>
                    )}
                    {count > 0 && (
                      <span className="absolute right-2 bottom-1.5 flex gap-0.5">
                        {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                          <span
                            key={i}
                            className="size-1.5 rounded-full bg-brand"
                          />
                        ))}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <h2 className="panel-title">
                {formatDateOnly(date)}
                {settings && !isBranchOpenOn(settings.opening_hours, date) && (
                  <span className="badge-muted ml-2">Closed</span>
                )}
              </h2>
              <form className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="date" value={date} />
                <label htmlFor="branch-filter" className="sr-only">
                  Filter the schedule by branch
                </label>
                <select
                  id="branch-filter"
                  name="branch"
                  defaultValue={branchFilter}
                  className="field w-auto text-xs"
                >
                  <option value="">Both branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-ghost text-xs">
                  Apply
                </button>
              </form>
            </div>

            <LiveAppointments initialAppointments={dayAppointments} />
          </section>
        </div>

        <section className="panel h-fit">
          <div className="panel-header">
            <h2 className="panel-title">Book an appointment</h2>
          </div>
          <AppointmentForm
            action={createAppointment}
            appointments={windowAppointments}
            branches={branches}
            dentists={dentists}
            settings={settings}
            defaultBranchId={branchFilter || session.branchId}
            defaultDate={date}
            defaultPatientId={params.patient ?? ""}
            patients={patients}
          />
        </section>
      </div>
    </>
  );
}