import { requireRole } from "@/lib/security/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { BackupLog } from "@/lib/types";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
import BackupForm from "@/components/backup-form";

export const metadata = { title: "Backups" };

const KIND_LABEL: Record<BackupLog["kind"], string> = {
  manual_export: "Manual export",
  restore_drill: "Restore drill",
  pitr_note: "Recovery-point note",
};

const OUTCOME_TONE: Record<BackupLog["outcome"], string> = {
  ok: "badge-ok",
  partial: "badge-warn",
  failed: "badge-danger",
};

export default async function BackupsPage() {
  await requireRole("admin");
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("backup_logs")
    .select("*, staff ( full_name )")
    .order("performed_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as (BackupLog & {
    staff: { full_name: string }[] | null;
  })[];

  return (
    <>
      <PageHeader
        title="Backups and recovery"
        description="Record when a backup or restore drill was carried out."
      />

      <div className="mb-5">
        <Callout tone="warn" title="This is a log, not a backup engine">
          Patient records are protected by the database host&apos;s automatic
          backups. Confirm the hosting plan includes daily backups and
          point-in-time recovery, then log each restore drill here so there is
          evidence the backups are actually restorable.
          <br />
          TODO(CLINIC): hosting tier, backup frequency, and recovery targets are
          still unconfirmed.
        </Callout>
      </div>

      <div className="flex flex-col gap-5">
        <BackupForm />

        <section className="panel overflow-hidden">
          <div className="panel-header">
            <h2 className="panel-title">History ({rows.length})</h2>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              title="No backup entries yet"
              description="Log the first one after the next backup or restore drill."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Type</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Reference</th>
                    <th scope="col">By</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        {formatDate(r.performed_at)}
                      </td>
                      <td className="whitespace-nowrap">
                        {KIND_LABEL[r.kind]}
                      </td>
                      <td>
                        <span className={OUTCOME_TONE[r.outcome]}>{r.outcome}</span>
                      </td>
                      <td className="hint font-mono text-xs">
                        {r.reference ?? "—"}
                      </td>
                      <td className="whitespace-nowrap">
                        {r.staff?.[0]?.full_name ?? "—"}
                      </td>
                      <td className="hint max-w-xs truncate">{r.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}