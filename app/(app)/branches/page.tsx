import Link from "next/link";
import { Building2, Clock } from "lucide-react";
import { requireRole } from "@/lib/security/session";
import {
  branchOpenState,
  clinicDayRange,
  clinicNow,
  clinicTodayKey,
} from "@/lib/clinical/schedule";
import {
  getClinicSettings,
  listAppointments,
  listBranches,
  listBranchStats,
  listRecentTreatments,
  one,
} from "@/lib/queries";
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_TONE,
  formatClinicDay,
  formatDate,
  formatTime,
  fullName,
} from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui";
import PrintButton from "@/components/print-button";

export const metadata = { title: "Both branches" };

function weekAgoIso(now: Date): string {
  return new Date(now.getTime() - 7 * 86400_000).toISOString();
}

/**
 * The dentist's cross-branch view.
 *
 * The dashboard answers "what is happening right now"; this answers "how is
 * each branch doing", which is the question the dentist cannot answer from
 * there once the day's list is interleaved. Everything on it is grouped by
 * branch rather than merged, because a merged list hides the one thing that
 * matters when you own two sites: whether one of them is behind.
 *
 * Branch is also the RLS boundary, so this page is honest about access by
 * construction. A dentist or admin sees both branches; a secretary who reaches
 * it sees their own branch's real figures and zero for the other, rather than
 * being shown a number they are not allowed to verify.
 */
export default async function BranchesPage() {
  const session = await requireRole("dentist", "admin");

  const today = clinicTodayKey();
  const now = clinicNow();
  const todayRange = clinicDayRange(today);
  const weekAgo = weekAgoIso(now);

  const [branches, settings, todayAppointments, recentTreatments] =
    await Promise.all([
      listBranches(),
      getClinicSettings(),
      listAppointments({ fromIso: todayRange.fromIso, toIso: todayRange.toIso }),
      listRecentTreatments(12),
    ]);

  // Per-branch counts need the branch ids, which only listBranches can supply,
  // so this is a second round trip by necessity rather than by choice.
  const perBranch = branches.length
    ? await listBranchStats({
        branchIds: branches.map((b) => b.id),
        todayRange,
        weekAgoIso: weekAgo,
      })
    : [];

  const hours = settings?.opening_hours ?? null;

  return (
    <>
      <PageHeader
        title="Both branches"
        description={`${formatClinicDay(today)} — every branch side by side`}
        actions={
          <>
            <Link href="/appointments" className="btn-ghost">
              <Clock size={16} aria-hidden />
              Schedule
            </Link>
            <PrintButton />
          </>
        }
      />

      {!branches.length ? (
        <EmptyState
          title="No active branches"
          description="Branches are configured by an administrator."
        />
      ) : (
        <div className="space-y-5">
          {branches.map((branch) => {
            const stat =
              perBranch.find((s) => s.branchId === branch.id) ?? null;
            const open = branchOpenState({
              opensAt: branch.opens_at,
              closesAt: branch.closes_at,
              openingHours: hours,
              date: today,
              now,
            });
            const mine = session.branchId === branch.id;

            const schedule = todayAppointments
              .filter((a) => a.branch_id === branch.id)
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const treatments = recentTreatments
              .filter((t) => t.branch_id === branch.id)
              .slice(0, 4);

            return (
              <section key={branch.id} className="panel">
                <div className="panel-header flex-wrap gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Building2 size={16} className="text-brand" aria-hidden />
                    <h2 className="panel-title">{branch.name}</h2>
                    {mine && <span className="badge-muted">Your branch</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={open.open ? "badge-ok" : "badge-muted"}>
                      {open.open ? "Open now" : "Closed now"}
                    </span>
                    <span className="hint">
                      {open.hours ?? "Hours not set"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Figure
                    label="Active patients"
                    value={stat?.activePatients ?? 0}
                  />
                  <Figure
                    label="Appointments today"
                    value={stat?.appointmentsToday ?? 0}
                  />
                  <Figure
                    label="New this week"
                    value={stat?.newPatientsThisWeek ?? 0}
                  />
                  <Figure
                    label="Procedures this week"
                    value={stat?.treatmentsThisWeek ?? 0}
                  />
                </div>

                <div className="grid gap-0 grid-cols-1 lg:grid-cols-2">
                  <div className="min-w-0 border-b border-line lg:border-r lg:border-b-0">
                    <h3 className="px-5 pt-4 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                      Today&apos;s schedule
                    </h3>
                    {schedule.length ? (
                      <ul className="divide-y divide-line">
                        {schedule.map((a) => {
                          const patient = one(a.patients);
                          return (
                            <li
                              key={a.id}
                              className="flex items-center justify-between gap-3 px-5 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {patient
                                    ? fullName(patient)
                                    : "Unknown patient"}
                                </p>
                                <p className="hint truncate">
                                  {formatTime(a.starts_at)}–
                                  {formatTime(a.ends_at)}
                                  {a.reason ? ` · ${a.reason}` : ""}
                                </p>
                              </div>
                              <span
                                className={
                                  `shrink-0 ${
                                    APPOINTMENT_STATUS_TONE[
                                      a.status as keyof typeof APPOINTMENT_STATUS_TONE
                                    ] ?? "badge-muted"
                                  }`
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
                      <p className="px-5 py-6 text-center text-sm text-muted">
                        Nothing booked today.
                      </p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="px-5 pt-4 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                      Recent treatments
                    </h3>
                    {treatments.length ? (
                      <ul className="divide-y divide-line">
                        {treatments.map((t) => {
                          const patient = one(t.patients);
                          const dentist = one(t.staff);
                          return (
                            <li key={t.id} className="px-5 py-2.5">
                              <p className="truncate text-sm font-medium">
                                {t.procedure_name}
                                {t.tooth_fdi ? ` · tooth ${t.tooth_fdi}` : ""}
                              </p>
                              <p className="hint truncate">
                                {patient ? fullName(patient) : "Unknown patient"}
                                {dentist ? ` · ${dentist.full_name}` : ""} ·{" "}
                                {formatDate(t.performed_at)}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="px-5 py-6 text-center text-sm text-muted">
                        No treatments recorded yet.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          <div className="no-print flex flex-wrap gap-2">
            <Link href="/patients" className="btn-ghost">
              Patient directory
            </Link>
            <Link href="/appointments" className="btn-ghost">
              Schedule
            </Link>
            <PrintButton />
          </div>

          <p className="hint flex items-start gap-2">
            <Building2 size={14} className="mt-0.5 shrink-0" aria-hidden />
            Figures cover each branch&apos;s own records. A patient registered at
            one branch who is treated at the other is counted at the branch that
            holds their record, and appears in the other branch&apos;s schedule on
            the day they visit.
          </p>

        </div>
      )}
    </>
  );
}

/** One number with a caption. Local to this page to keep Stat for the dashboard. */
function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight">
        {value.toLocaleString("en-PH")}
      </p>
    </div>
  );
}
