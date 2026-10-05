import Link from "next/link";
import { requireRole } from "@/lib/security/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log" };

type Params = { q?: string; entity?: string };

const ENTITY_LABEL: Record<string, string> = {
  patient: "Patient",
  consent: "Consent",
  treatment: "Treatment",
  appointment: "Appointment",
  staff: "Staff",
  backup: "Backup",
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireRole("admin");
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  let q = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.entity) q = q.eq("entity_type", params.entity);
  if (params.q) q = q.ilike("action", `%${params.q}%`);

  const { data } = await q;
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what, and when. Read-only, administrator access only."
      />

      <div className="panel mb-5 p-4">
        <form className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <label className="label" htmlFor="audit_q">
              Action contains
            </label>
            <input
              id="audit_q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="e.g. treatment"
              className="field"
            />
          </div>

          <div>
            <label className="label" htmlFor="audit_entity">
              Entity type
            </label>
            <select
              id="audit_entity"
              name="entity"
              defaultValue={params.entity ?? ""}
              className="field"
            >
              <option value="">All</option>
              {Object.entries(ENTITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn-ghost">
            Filter
          </button>
          {(params.q || params.entity) && (
            <Link href="/audit-log" className="btn-ghost">
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="panel overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No log entries match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Record</th>
                  <th scope="col">Details</th>
                  <th scope="col">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const details = (r.details ?? {}) as Record<string, unknown>;
                  const detailText = Object.entries(details)
                    .filter(([, v]) => v !== null && v !== undefined && v !== "")
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ");

                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="whitespace-nowrap">
                        {r.actor_email ?? "—"}
                      </td>
                      <td className="font-mono text-xs whitespace-nowrap">
                        {r.action}
                      </td>
                      <td className="whitespace-nowrap">
                        {r.entity_type ? (
                          <>
                            <span className="badge-neutral">
                              {ENTITY_LABEL[r.entity_type] ?? r.entity_type}
                            </span>
                            {r.entity_id && (
                              <Link
                                href={
                                  r.entity_type === "patient"
                                    ? `/patients/${r.entity_id}`
                                    : "#"
                                }
                                className="-my-2 ml-1.5 inline-block py-2 text-xs text-brand hover:underline"
                              >
                                open
                              </Link>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="hint max-w-xs truncate">{detailText || "—"}</td>
                      <td className="hint font-mono text-xs">{r.ip ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="hint mt-3">
        Showing the most recent {rows.length} entries. Patient names and clinical
        detail are deliberately kept out of this log.
      </p>
    </>
  );
}