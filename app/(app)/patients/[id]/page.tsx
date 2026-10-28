import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { requireStaff } from "@/lib/security/session";
import {
  getClinicSettings,
  getPatient,
  getPatientIntake,
  listAppointments,
  listBranches,
  listTreatmentsForPatient,
  one,
} from "@/lib/queries";
import { auditLog, AUDIT } from "@/lib/security/audit";
import { countByTooth, toothLabel } from "@/lib/clinical/tooth";
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_TONE,
  ageFrom,
  formatDate,
  formatDateOnly,
  fullName,
} from "@/lib/utils";
import type { ConsentRecord } from "@/lib/types";
import { Callout, Detail, EmptyState, PageHeader } from "@/components/ui";
import ToothChart from "@/components/tooth-chart";
import Odontogram from "@/components/odontogram";
import TreatmentForm from "@/components/treatment-form";
import ConsentForm from "@/components/consent-form";
import IntakeSummary from "@/components/intake-summary";
import PatientForm from "@/components/patient-form";
import PrintButton from "@/components/print-button";
import { recordConsent, recordTreatment, updatePatient } from "../actions";

export const metadata = { title: "Patient record" };

type ConsentWithBranch = ConsentRecord & {
  branches: { id: string; name: string }[] | null;
};

/** Future appointments that still count, excluding cancelled ones. */
function upcomingOf<T extends { starts_at: string; status: string }>(
  appointments: T[]
): T[] {
  const now = Date.now();
  return appointments.filter(
    (a) => new Date(a.starts_at).getTime() >= now && a.status !== "cancelled"
  );
}

export default async function PatientRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { created, tab } = await searchParams;
  const session = await requireStaff();

  const patient = await getPatient(id);
  if (!patient) notFound();

  const [treatments, appointments, branches, settings, consents, intake] =
    await Promise.all([
      listTreatmentsForPatient(id),
      listAppointments({ patientId: id, limit: 50 }),
      listBranches(),
      getClinicSettings(),
      fetchConsents(id),
      getPatientIntake(id),
    ]);

  // Opening a record is itself an access event (Scope 7: audit logging).
  await auditLog({
    action: AUDIT.patientViewed,
    userId: session.userId,
    email: session.email,
    entityType: "patient",
    entityId: id,
  });

  const counts = countByTooth(treatments);
  const branch = one(patient.branches);
  const age = ageFrom(patient.birthdate);
  const canWrite = session.role === "dentist" || session.role === "admin";
  const activeTab = tab ?? "overview";
  const upcoming = upcomingOf(appointments);

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "chart", label: "Dental Record Chart" },
    { key: "treatments", label: `Treatments (${treatments.length})` },
    { key: "intake", label: "Intake & Medical History" },
    { key: "consent", label: `Consent (${consents.length})` },
    { key: "appointments", label: `Appointments (${appointments.length})` },
    { key: "edit", label: "Edit details" },
  ] as const;

  return (
    <>
      <Link
        href="/patients"
        className="no-print mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand"
      >
        <ArrowLeft size={15} aria-hidden />
        All patients
      </Link>

      <PageHeader
        title={fullName(patient)}
        description={`${patient.patient_no} · ${age !== null ? `${age} years old` : "age not recorded"} · ${branch?.name ?? "No branch set"}`}
        actions={
          <PrintButton />
        }
      />

      {created && (
        <div className="mb-5">
          <Callout tone="info" title="Patient registered">
            Intake details saved. Record the consent before the first treatment.
          </Callout>
        </div>
      )}

      {patient.status === "archived" && (
        <div className="mb-5">
          <Callout tone="warn" title="This record is archived">
            Archived records stay searchable for continuity but are hidden from
            the default directory list.
            {patient.archived_reason ? ` Reason: ${patient.archived_reason}` : ""}
          </Callout>
        </div>
      )}

      {patient.allergies && (
        <div className="mb-5">
          <Callout tone="danger" title="Allergy alert">
            <span className="flex items-start gap-2">
              <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
              {patient.allergies}
            </span>
          </Callout>
        </div>
      )}

      <nav className="no-print mb-5 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/patients/${id}?tab=${t.key}`}
            className={`-mb-px inline-flex min-h-11 items-center rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === t.key
                ? "border-brand text-brand"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <section className="panel p-5">
              <h2 className="panel-title mb-4">Intake details</h2>
              <dl className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <Detail label="Patient number">{patient.patient_no}</Detail>
                <Detail label="Birthdate">
                  {formatDateOnly(patient.birthdate)}
                </Detail>
                <Detail label="Sex">{patient.sex ?? "Not stated"}</Detail>
                <Detail label="Civil status">
                  {patient.civil_status ?? "Not stated"}
                </Detail>
                <Detail label="Contact number">
                  {patient.contact_no ?? "—"}
                </Detail>
                <Detail label="Email">{patient.email ?? "—"}</Detail>
                <Detail label="Nickname">{patient.nickname ?? "—"}</Detail>
                <Detail label="Branch">{branch?.name ?? "—"}</Detail>
                <div className="sm:col-span-2">
                  <Detail label="Address">{patient.address ?? "—"}</Detail>
                </div>
                <Detail label="Emergency contact">
                  {patient.emergency_contact_name
                    ? `${patient.emergency_contact_name} · ${patient.emergency_contact_no ?? "no number"}`
                    : "—"}
                </Detail>
              </dl>
            </section>

            <section className="panel p-5">
              <h2 className="panel-title mb-4">Medical history</h2>
              <dl className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <Detail label="Allergies">{patient.allergies ?? "None noted"}</Detail>
                <Detail label="Medications">{patient.medications ?? "—"}</Detail>
                <Detail label="History">
                  {patient.medical_history ?? "—"}
                </Detail>
              </dl>
            </section>

            <section className="panel p-5">
              <h2 className="panel-title mb-4">Dental chart (quick view)</h2>
              <ToothChart counts={counts} />
            </section>
          </div>

          <div className="flex flex-col gap-5">
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Recent treatments</h2>
              </div>
              {treatments.length ? (
                <ul className="divide-y divide-line">
                  {treatments.slice(0, 6).map((t) => (
                    <li key={t.id} className="px-5 py-3">
                      <p className="text-sm font-medium">{t.procedure_name}</p>
                      <p className="hint">
                        {t.tooth_fdi ? `${toothLabel(t.tooth_fdi)} · ` : ""}
                        {formatDateOnly(t.performed_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-center text-sm text-muted">
                  No treatments recorded yet.
                </p>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Upcoming</h2>
              </div>
              {upcoming.length ? (
                <ul className="divide-y divide-line">
                  {upcoming.slice(0, 5).map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <p className="text-sm font-medium">
                        {formatDate(a.starts_at)}
                      </p>
                      <p className="hint">
                        {(one(a.branches as { id: string; name: string }[] | null)?.name) ?? "—"} ·{" "}
                        {APPOINTMENT_STATUS_LABEL[a.status as keyof typeof APPOINTMENT_STATUS_LABEL]}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-center text-sm text-muted">
                  Nothing booked.
                </p>
              )}
            </section>
          </div>
        </div>
      )}

      {activeTab === "chart" && <Odontogram />}

      {activeTab === "intake" && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="hint">
              The paper intake form, digitised. Encoded by the front desk and
              signed by the patient.
            </p>
            <div className="no-print">
              <PrintButton />
            </div>
          </div>
          <IntakeSummary intake={intake} patientName={fullName(patient)} />
        </>
      )}

      {activeTab === "treatments" && (
        <div className="flex flex-col gap-5">
          <section className="panel p-5">
            <h2 className="panel-title mb-1">Treatment history</h2>
            <p className="hint mb-4">
              Replaces the index card patients used to photograph for their own
              copy.
            </p>
            {treatments.length ? (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Procedure</th>
                      <th scope="col">Tooth</th>
                      <th scope="col">Surfaces</th>
                      <th scope="col">Branch</th>
                      <th scope="col">Recorded by</th>
                      <th scope="col">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {treatments.map((t) => (
                      <tr key={t.id}>
                        <td className="whitespace-nowrap">
                          {formatDateOnly(t.performed_at)}
                        </td>
                        <td className="font-medium whitespace-nowrap">
                          {t.procedure_name}
                          {t.procedure_code && (
                            <span className="hint ml-1 font-mono text-xs">
                              {t.procedure_code}
                            </span>
                          )}
                        </td>
                        <td className="font-mono text-xs whitespace-nowrap">
                          {t.tooth_fdi ?? "—"}
                        </td>
                        <td className="text-xs">{t.tooth_surfaces || "—"}</td>
                        <td className="whitespace-nowrap">
                          {one(t.branches)?.name ?? "—"}
                        </td>
                        <td className="hint whitespace-nowrap">
                          {one(t.staff)?.full_name ?? "—"}
                        </td>
                        <td className="hint max-w-xs truncate">
                          {t.notes ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No treatments recorded"
                description="Treatment entries appear here once the dentist records them."
              />
            )}
          </section>

          {canWrite ? (
            <section className="panel p-5">
              <h2 className="panel-title mb-4">Record a treatment</h2>
              <TreatmentForm
                action={recordTreatment}
                patientId={id}
                branches={branches}
                defaultBranchId={session.branchId}
                existingCounts={counts}
              />
            </section>
          ) : (
            <Callout tone="info" title="Read-only">
              Only the dentist can record or amend treatment entries.
            </Callout>
          )}
        </div>
      )}

      {activeTab === "consent" && (
        <div className="flex flex-col gap-5">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Consent on file</h2>
              <span className="hint">
                Wording is stored per record so it can be shown as it was agreed
              </span>
            </div>
            {consents.length ? (
              <ul className="divide-y divide-line">
                {consents.map((c) => (
                  <li key={c.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {c.consent_type} · v{c.version}
                      </p>
                      <p className="hint">
                        {formatDate(c.signed_at)} ·{" "}
                        {one(c.branches)?.name ?? "—"}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      Signed by {c.signed_by_name}
                      {c.signed_by_relation ? ` (${c.signed_by_relation})` : ""}
                    </p>
                    <p className="mt-2 rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                      {c.body}
                    </p>

                    {/* E-signature evidence. Records made before the pads
                        existed carry only the typed name, so this block only
                        appears when there is something to show. */}
                    {(c.initials_png ||
                      c.signature_patient_png ||
                      c.signature_dentist_png) && (
                      <div className="mt-3 flex flex-wrap items-end gap-4">
                        {c.initials_png && (
                          <figure className="flex flex-col gap-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={c.initials_png}
                              alt={`Initials of ${c.signed_by_name}`}
                              className="h-12 w-auto rounded border border-line bg-white"
                            />
                            <figcaption className="text-[11px] text-muted">
                              Initialled all {c.initialed_clause_count ?? "—"}{" "}
                              clauses
                              {c.initialed_all_at
                                ? ` · ${formatDate(c.initialed_all_at)}`
                                : ""}
                            </figcaption>
                          </figure>
                        )}
                        {c.signature_patient_png && (
                          <figure className="flex flex-col gap-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={c.signature_patient_png}
                              alt={`Signature of ${c.signed_by_name}`}
                              className="h-12 w-auto rounded border border-line bg-white"
                            />
                            <figcaption className="text-[11px] text-muted">
                              Patient / guardian
                            </figcaption>
                          </figure>
                        )}
                        {c.signature_dentist_png && (
                          <figure className="flex flex-col gap-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={c.signature_dentist_png}
                              alt="Dentist countersignature"
                              className="h-12 w-auto rounded border border-line bg-white"
                            />
                            <figcaption className="text-[11px] text-muted">
                              Dentist
                            </figcaption>
                          </figure>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No consent recorded"
                description="Record consent before starting treatment."
              />
            )}
          </section>

          <section className="panel p-5">
            <h2 className="panel-title mb-4">Record new consent</h2>
            <ConsentForm
              action={recordConsent}
              patientId={id}
              branches={branches}
              defaultBranchId={session.branchId}
              template={settings?.consent_template ?? ""}
            />
          </section>
        </div>
      )}

      {activeTab === "appointments" && (
        <section className="panel overflow-hidden">
          <div className="panel-header">
            <h2 className="panel-title">Appointment history</h2>
            <Link
              href={`/appointments?patient=${id}`}
              className="-my-1 inline-block py-1 text-xs font-semibold text-brand hover:underline"
            >
              Book another
            </Link>
          </div>
          {appointments.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Branch</th>
                    <th scope="col">Dentist</th>
                    <th scope="col">Status</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{formatDate(a.starts_at)}</td>
                      <td className="whitespace-nowrap">
                        {one(a.branches)?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap">
                        {one(a.staff)?.full_name ?? "Unassigned"}
                      </td>
                      <td>
                        <span className={APPOINTMENT_STATUS_TONE[a.status]}>
                          {APPOINTMENT_STATUS_LABEL[a.status]}
                        </span>
                      </td>
                      <td className="hint">{a.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No appointments" />
          )}
        </section>
      )}

      {activeTab === "edit" && (
        <div>
          {/* Keyed so switching tabs remounts the form with fresh values. */}
          <PatientForm
            key={`edit-${patient.updated_at}`}
            action={updatePatient}
            mode="edit"
            patientId={id}
            branches={branches}
            defaultBranchId={patient.branch_id ?? session.branchId}
            defaults={{
              last_name: patient.last_name,
              first_name: patient.first_name,
              middle_name: patient.middle_name,
              suffix: patient.suffix,
              nickname: patient.nickname,
              birthdate: patient.birthdate,
              sex: patient.sex,
              civil_status: patient.civil_status,
              contact_no: patient.contact_no,
              email: patient.email,
              address: patient.address,
              emergency_contact_name: patient.emergency_contact_name,
              emergency_contact_no: patient.emergency_contact_no,
              allergies: patient.allergies,
              medical_history: patient.medical_history,
              medications: patient.medications,
              branch_id: patient.branch_id,
            }}
          />
        </div>
      )}
    </>
  );
}

async function fetchConsents(patientId: string): Promise<ConsentWithBranch[]> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consent_records")
    .select("*, branches ( id, name )")
    .eq("patient_id", patientId)
    .order("signed_at", { ascending: false });

  if (error) throw new Error(`consent query failed: ${error.message}`);
  return (data ?? []) as ConsentWithBranch[];
}