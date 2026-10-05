"use client";

import { useActionState, useState } from "react";
import { Signature } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type { Branch, ConsentType } from "@/lib/types";

const CONSENT_TYPES: { value: ConsentType; label: string }[] = [
  { value: "treatment", label: "Treatment consent" },
  { value: "privacy", label: "Privacy / data consent" },
  { value: "surgery", label: "Surgical consent" },
  { value: "orthodontic", label: "Orthodontic consent" },
  { value: "other", label: "Other" },
];

/**
 * Records a signed consent against the patient.
 *
 * TODO(CLINIC): the signature capture method is undecided in the automation
 * plan — currently the typed name is stored as the minimum. If the clinic
 * wants a drawn signature, that needs a storage bucket and a consent-to-store
 * line for the signature image itself.
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
    null
  );
  const [signedBy, setSignedBy] = useState("");
  const [body, setBody] = useState(template);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="patient_id" value={patientId} />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="consent_type">
            Type
          </label>
          <select id="consent_type" name="consent_type" className="field">
            {CONSENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="version">
            Version
          </label>
          <input
            id="version"
            name="version"
            defaultValue="1.0"
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="consent_branch">
            Recorded at
          </label>
          <select
            id="consent_branch"
            name="branch_id"
            className="field"
            defaultValue={defaultBranchId ?? ""}
          >
            <option value="">Choose branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="body">
          Consent wording shown to the patient
        </label>
        <textarea
          id="body"
          name="body"
          rows={7}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="field font-mono text-xs leading-relaxed"
        />
        <p className="hint mt-1">
          Edit before saving if the clinic&apos;s wording differs. The exact text
          is stored with the record so it can be shown as it was agreed.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="signed_by_name">
            Signed by (patient or guardian)
          </label>
          <input
            id="signed_by_name"
            name="signed_by_name"
            required
            value={signedBy}
            onChange={(e) => setSignedBy(e.target.value)}
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="signed_by_relation">
            Relation, if not the patient
          </label>
          <input
            id="signed_by_relation"
            name="signed_by_relation"
            placeholder="Mother, guardian…"
            className="field"
          />
        </div>
      </div>

      {state?.ok === false && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}
      {state?.ok === true && state.message && (
        <p role="status" className="text-sm font-medium text-ok">
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary">
          <Signature size={16} aria-hidden />
          {pending ? "Saving…" : "Record consent"}
        </button>
      </div>
    </form>
  );
}