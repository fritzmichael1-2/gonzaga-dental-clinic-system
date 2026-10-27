"use client";

import { useMemo } from "react";
import { formatDateOnly } from "@/lib/utils";
import { one } from "@/lib/queries";
import type { TreatmentRecord } from "@/lib/types";

type TreatmentWithBranch = TreatmentRecord & {
  branches: { id: string; name: string }[] | null;
  staff: { id: string; full_name: string | null }[] | null;
};

export default function TreatmentLedger({
  treatments,
  canWrite,
  canEncode,
}: {
  treatments: TreatmentWithBranch[];
  canWrite: boolean;
  canEncode?: boolean;
}) {
  const rows = useMemo(() => {
    let balance = 0;
    return [...treatments]
      .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime())
      .map((t) => {
        const charged = Number(t.amount_charged ?? 0);
        const paid = Number(t.amount_paid ?? 0);
        balance += charged - paid;
        return { ...t, charged, paid, balance };
      });
  }, [treatments]);

  const totalCharged = rows.reduce((sum, r) => sum + r.charged, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0);
  const totalBalance = rows.reduce((sum, r) => sum + (r.charged - r.paid), 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Treatment Record</h2>
            <p className="hint">Online ledger. Balance is computed automatically.</p>
          </div>
          {canEncode && (
            <span className="badge">Encoding enabled</span>
          )}
        </div>
        <div className="panel-body overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Tooth #</th>
                <th scope="col">Procedure</th>
                <th scope="col">Description/Notes</th>
                <th scope="col" className="text-right">Amount Charged</th>
                <th scope="col" className="text-right">Amount Paid</th>
                <th scope="col" className="text-right">Balance</th>
                <th scope="col">Dentist/Staff</th>
                <th scope="col">Branch</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted">
                    No treatments recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateOnly(r.performed_at)}</td>
                    <td className="font-mono">{r.tooth_fdi ?? "—"}</td>
                    <td className="font-medium">
                      {r.procedure_name}
                      {r.procedure_code && (
                        <span className="hint ml-1 font-mono text-xs">{r.procedure_code}</span>
                      )}
                    </td>
                    <td className="max-w-xs truncate hint">{r.notes ?? "—"}</td>
                    <td className="text-right">₱{r.charged.toLocaleString()}</td>
                    <td className="text-right">₱{r.paid.toLocaleString()}</td>
                    <td className="text-right font-medium">₱{r.balance.toLocaleString()}</td>
                    <td className="whitespace-nowrap">{one(r.staff)?.full_name ?? "—"}</td>
                    <td className="whitespace-nowrap">{one(r.branches)?.name ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
          <div className="flex gap-6">
            <span>Total Charged: <strong>₱{totalCharged.toLocaleString()}</strong></span>
            <span>Total Paid: <strong>₱{totalPaid.toLocaleString()}</strong></span>
          </div>
          <span className="text-base font-semibold">Running Balance: ₱{totalBalance.toLocaleString()}</span>
        </div>
      </section>

      <section className="panel no-print">
        <div className="panel-header">
          <h2 className="panel-title">Print Ledger</h2>
        </div>
        <div className="panel-body">
          <p className="text-sm text-muted">
            Use the browser print button or the Print button on this page to print the treatment record in paper format.
          </p>
        </div>
      </section>
    </div>
  );
}
