import Link from "next/link";
import { Plus, TriangleAlert } from "lucide-react";
import { Suspense } from "react";
import { searchPatients, one } from "@/lib/queries";
import { ageFrom, formatDateOnly, fullName } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui";
import PatientSearch from "@/components/patient-search";

export const metadata = { title: "Patients" };

type Params = {
  q?: string;
  branch?: string;
  archived?: string;
};

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const patients = await searchPatients({
    q: params.q,
    includeArchived: params.archived === "1",
    limit: 100,
  });

  return (
    <>
      <PageHeader
        title="Patients"
        description="One record set shared by the Main Branch and the Second Branch."
        actions={
          <Link href="/patients/new" className="btn-primary">
            <Plus size={16} aria-hidden />
            Register patient
          </Link>
        }
      />

      <div className="panel mb-5 p-4">
        <Suspense
          key={`${params.q ?? ""}|${params.archived ?? ""}`}
        >
          <PatientSearch
            initialQuery={params.q ?? ""}
            includeArchived={params.archived === "1"}
          />
        </Suspense>
      </div>

      <div className="panel overflow-hidden">
        {patients.length === 0 ? (
          <EmptyState
            title={params.q ? "No matching patients" : "No patients yet"}
            description={
              params.q
                ? "Check the spelling, or try the patient number instead. Names are matched loosely, so partial surnames work."
                : "Register the first patient to create the searchable directory."
            }
            action={
              <Link href="/patients/new" className="btn-primary">
                <Plus size={16} aria-hidden />
                Register patient
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <caption className="sr-only">
                Patient directory, {patients.length} records
              </caption>
              <thead>
                <tr>
                  <th scope="col">Patient no.</th>
                  <th scope="col">Name</th>
                  <th scope="col">Age</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Branch</th>
                  <th scope="col">Allergies</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const age = ageFrom(p.birthdate);
                  const branch = one(p.branches);
                  return (
                    <tr key={p.id}>
                      <td className="font-mono text-xs whitespace-nowrap">
                        {p.patient_no}
                      </td>
                      <td className="font-medium whitespace-nowrap">
                        <Link
                          href={`/patients/${p.id}`}
                          className="-my-2 inline-block py-2 text-brand hover:underline"
                        >
                          {fullName(p)}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">
                        {age !== null ? `${age} yrs` : "—"}
                      </td>
                      <td className="whitespace-nowrap">{p.contact_no ?? "—"}</td>
                      <td className="whitespace-nowrap">{branch?.name ?? "—"}</td>
                      <td>
                        {p.allergies ? (
                          <span className="badge-danger">
                            <TriangleAlert size={12} aria-hidden className="mr-1" />
                            {p.allergies.length > 24
                              ? `${p.allergies.slice(0, 23)}…`
                              : p.allergies}
                          </span>
                        ) : (
                          <span className="badge-muted">None noted</span>
                        )}
                      </td>
                      <td className="hint whitespace-nowrap">
                        {formatDateOnly(p.updated_at)}
                      </td>
                      <td>
                        <span
                          className={
                            p.status === "active" ? "badge-ok" : "badge-muted"
                          }
                        >
                          {p.status === "active" ? "Active" : "Archived"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {patients.length > 0 && (
        <p className="hint mt-3">
          Showing {patients.length} records
          {params.q ? ` matching “${params.q}”` : ""}. Narrow the list with the
          search box above.
        </p>
      )}
    </>
  );
}