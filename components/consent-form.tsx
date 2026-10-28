"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Eraser, PenLine } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type { Branch, ConsentType } from "@/lib/types";
import SignaturePad, { type SignaturePadHandle } from "@/components/signature-pad";

const CONSENT_TYPES: { value: ConsentType; label: string }[] = [
  { value: "treatment", label: "Treatment consent" },
  { value: "privacy", label: "Privacy / data consent" },
  { value: "surgery", label: "Surgical consent" },
  { value: "orthodontic", label: "Orthodontic consent" },
  { value: "other", label: "Other" },
];

const CLAUSES = [
  "I have been informed of the nature, purpose, benefits, and risks of the proposed dental treatment.",
  "I understand the alternatives to treatment, including the option of no treatment, and their risks.",
  "I have been informed of possible complications such as pain, swelling, bleeding, infection, or allergic reactions.",
  "I understand that anesthesia/sedation carries its own risks and have been explained to me.",
  "I consent to the taking of radiographs, photographs, or models as needed for diagnosis/treatment.",
  "I understand that additional treatment may be necessary and will be explained to me before proceeding.",
  "I authorize the dentist and staff to perform the treatment as deemed necessary under this consent.",
  "I understand the fees, payment terms, and that results may vary.",
  "I have had the opportunity to ask questions and all questions have been answered to my satisfaction.",
  "I voluntarily give my informed consent to proceed with the treatment described.",
];

const RELATIONS = ["Self", "Parent", "Guardian", "Spouse", "Other"];

/**
 * Digital consent — the paper form's clauses, initialled once and signed twice.
 *
 * Why one initial instead of ten: the paper sheet has an "Initial:" line under
 * each clause, but copying a signature into all ten would make the record claim
 * ten separate acknowledgements that never happened. The patient initials once,
 * presses "Initial all 10 clauses", and the record stores that mark with the
 * clause count and the moment it was made — readable as "initialled as a block".
 */
export default function ConsentForm({
  action,
  patientId,
  branches,
  defaultBranchId,
  template,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  patientId: string;
  branches: Branch[];
  defaultBranchId: string | null;
  template: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    { ok: true, message: "" },
  );

  const [consentType, setConsentType] = useState<ConsentType>("treatment");
  const [signedByName, setSignedByName] = useState("");
  const [relation, setRelation] = useState("Self");
  const [initials, setInitials] = useState<string | null>(null);
  const [initialedAt, setInitialedAt] = useState<Date | null>(null);
  const [patientSig, setPatientSig] = useState<string | null>(null);
  const [dentistSig, setDentistSig] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [blockError, setBlockError] = useState(false);

  const initialsRef = useRef<SignaturePadHandle>(null);
  const patientRef = useRef<SignaturePadHandle>(null);
  const dentistRef = useRef<SignaturePadHandle>(null);

  const blockInitialed = Boolean(initials && initialedAt);
  const hasSigs = Boolean(patientSig && dentistSig);
  const hasName = signedByName.trim().length >= 2;
  const canSubmit = blockInitialed && hasSigs && hasName && confirmed && !pending;

  // The clinic's configured wording when it exists, otherwise the clauses
  // actually shown above — so the stored record is never blank.
  const body = template.trim().length >= 20 ? template.trim() : CLAUSES.join(" ");

  function initialAll() {
    if (!initials) {
      setBlockError(true);
      return;
    }
    setBlockError(false);
    setInitialedAt(new Date());
  }

  function clearInitials() {
    initialsRef.current?.clear();
    // The mark is the evidence, so dropping it drops the block acknowledgement.
    setInitialedAt(null);
  }

  const missing = [
    !blockInitialed && "initial the clause list",
    !hasSigs && "both signatures",
    !hasName && "the signer's name",
    !confirmed && "the confirmation box",
  ].filter(Boolean);

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="consent_type" value={consentType} />
      <input type="hidden" name="version" value="1.0" />
      <input type="hidden" name="body" value={body} />
      <input type="hidden" name="signed_by_name" value={signedByName.trim()} />
      <input
        type="hidden"
        name="signed_by_relation"
        value={relation === "Self" ? "" : relation}
      />
      {patientSig && <input type="hidden" name="signature_patient_png" value={patientSig} />}
      {dentistSig && <input type="hidden" name="signature_dentist_png" value={dentistSig} />}
      {blockInitialed && (
        <>
          <input type="hidden" name="initials_png" value={initials ?? ""} />
          <input
            type="hidden"
            name="initialed_clause_count"
            value={String(CLAUSES.length)}
          />
        </>
      )}
      <input
        type="hidden"
        name="consent_meta"
        value={JSON.stringify({
          // Client clock; the server stamps the authoritative initialed_all_at.
          initialed_at: initialedAt?.toISOString() ?? null,
          clause_count: CLAUSES.length,
          signed_by_relation: relation,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        })}
      />

      {/* ============================================================
          Details
          ============================================================ */}
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Informed consent</h2>
          <p className="hint">Version 1.0 · wording is stored with the record</p>
        </div>
        <div className="panel-body grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="consent-branch">
                Branch
              </label>
              <select
                id="consent-branch"
                name="branch_id"
                className="field"
                defaultValue={defaultBranchId ?? branches[0]?.id ?? ""}
                required
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="consent-name">
                Signed by <span className="text-danger">*</span>
              </label>
              <input
                id="consent-name"
                className="field"
                value={signedByName}
                onChange={(e) => setSignedByName(e.target.value)}
                placeholder="Full name of the patient / guardian"
                autoComplete="off"
              />
              {signedByName.length > 0 && !hasName && (
                <p className="error-text">Enter the full name.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="consent-relation">
                In what capacity
              </label>
              <select
                id="consent-relation"
                className="field"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Consent type</span>
            <div className="flex flex-wrap gap-2">
              {CONSENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setConsentType(type.value)}
                  aria-pressed={consentType === type.value}
                  className={`btn text-sm ${
                    consentType === type.value ? "border-brand text-brand" : ""
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          Clauses + one block initial
          ============================================================ */}
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Clauses ({CLAUSES.length})</h2>
          <p className="hint">
            Read the list, then initial once to cover every clause.
          </p>
        </div>
        <div className="panel-body flex flex-col gap-5">
          <ol className="flex flex-col divide-y divide-line">
            {CLAUSES.map((clause, i) => (
              <li key={i} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 text-sm font-semibold text-muted">
                  {i + 1}.
                </span>
                <p className="flex-1 text-sm leading-relaxed">{clause}</p>
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Patient initials</p>
                <p className="hint">
                  Draw your initials once. They cover all {CLAUSES.length}{" "}
                  clauses above, and the record says so.
                </p>
              </div>
              <span
                className={blockInitialed ? "badge-ok" : "badge-warn"}
                aria-live="polite"
              >
                {blockInitialed
                  ? `Initialled as a block at ${initialedAt?.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Not initialled"}
              </span>
            </div>

            <div
              className={`mt-3 max-w-md rounded-lg border border-dashed bg-white p-1 ${
                blockError ? "border-danger" : "border-line-strong"
              }`}
            >
              <SignaturePad
                ref={initialsRef}
                label="Patient initials"
                height={110}
                className="block w-full rounded bg-white"
                onChange={(dataUrl) => {
                  setInitials(dataUrl);
                  if (!dataUrl) setInitialedAt(null);
                  if (dataUrl) setBlockError(false);
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={initialAll}
                disabled={!initials || blockInitialed}
                className="btn-secondary"
              >
                <PenLine size={15} aria-hidden />
                {blockInitialed
                  ? `Initialled all ${CLAUSES.length} clauses`
                  : `Initial all ${CLAUSES.length} clauses`}
              </button>
              <button type="button" onClick={clearInitials} className="btn-ghost">
                <Eraser size={15} aria-hidden />
                Clear initials
              </button>
              {blockError && (
                <p className="error-text">Draw your initials first.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          Signatures
          ============================================================ */}
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">E-signatures</h2>
          <p className="hint">Both required</p>
        </div>
        <div className="panel-body grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">
                Patient / guardian signature
              </label>
              <button
                type="button"
                onClick={() => patientRef.current?.clear()}
                className="btn text-xs"
              >
                Clear
              </button>
            </div>
            <SignaturePad
              ref={patientRef}
              label="Patient or guardian signature"
              height={150}
              className="w-full rounded border border-line bg-white"
              onChange={setPatientSig}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">Dentist signature</label>
              <button
                type="button"
                onClick={() => dentistRef.current?.clear()}
                className="btn text-xs"
              >
                Clear
              </button>
            </div>
            <SignaturePad
              ref={dentistRef}
              label="Dentist signature"
              height={150}
              className="w-full rounded border border-line bg-white"
              onChange={setDentistSig}
            />
          </div>
        </div>
      </section>

      {/* ============================================================
          Confirm
          ============================================================ */}
      <section className="panel">
        <div className="panel-body flex flex-col gap-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 size-4 rounded border-line"
            />
            <span className="text-sm">
              I confirm that I have read and understood all {CLAUSES.length}{" "}
              clauses, that the initials and signatures on this record are mine,
              and I voluntarily give informed consent.
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="hint" aria-live="polite">
              {missing.length
                ? `Still needed: ${missing.join(" · ")}.`
                : "Ready to record."}
            </p>
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              <Check className="h-4 w-4" aria-hidden />
              Confirm &amp; accept
            </button>
          </div>
          {state?.message && (
            <p className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
              {state.message}
            </p>
          )}
        </div>
      </section>
    </form>
  );
}
