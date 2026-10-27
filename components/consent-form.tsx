"use client";

import { useActionState, useRef, useState } from "react";
import { Check, PenLine } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type { Branch, ConsentType } from "@/lib/types";

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
  const [initials, setInitials] = useState<Record<number, string>>({});
  const [patientSig, setPatientSig] = useState<string | null>(null);
  const [dentistSig, setDentistSig] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const patientCanvasRef = useRef<HTMLCanvasElement>(null);
  const dentistCanvasRef = useRef<HTMLCanvasElement>(null);

  const allInitialed = CLAUSES.every((_, i) => (initials[i] || "").trim().length > 0);
  const hasSigs = patientSig && dentistSig;
  const canSubmit = allInitialed && hasSigs && confirmed && !pending;

  function startDraw(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2937";
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, setter: (d: string) => void) {
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setter(canvas.toDataURL("image/png"));
  }

  function clear(canvas: HTMLCanvasElement | null, setter: (d: string | null) => void) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setter(null);
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="consent_type" value={consentType} />
      <input type="hidden" name="template" value={template} />
      {patientSig && <input type="hidden" name="signature_patient" value={patientSig} />}
      {dentistSig && <input type="hidden" name="signature_dentist" value={dentistSig} />}
      <input type="hidden" name="initialed_clauses" value={JSON.stringify(initials)} />
      <input type="hidden" name="consent_meta" value={JSON.stringify({
        date: new Date().toISOString(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      })} />

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Informed Consent</h2>
        </div>
        <div className="panel-body grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
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
              <label className="text-sm font-medium">Consent type</label>
              <div className="flex flex-wrap gap-2">
                {CONSENT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setConsentType(type.value)}
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
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Clauses</h2>
          <p className="hint">Initial each clause to indicate you have read and understood it.</p>
        </div>
        <div className="panel-body divide-y divide-line">
          {CLAUSES.map((clause, i) => (
            <div key={i} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
              <span className="mt-1 text-sm font-semibold text-muted">{i + 1}.</span>
              <p className="flex-1 text-sm leading-relaxed">{clause}</p>
              <div className="flex flex-col items-center gap-1">
                <input
                  value={initials[i] || ""}
                  onChange={(e) => setInitials({ ...initials, [i]: e.target.value.slice(0, 3).toUpperCase() })}
                  className="field w-16 text-center uppercase"
                  placeholder="___"
                  maxLength={3}
                />
                <span className="text-xs text-muted">Initials</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Signatures</h2>
        </div>
        <div className="panel-body grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Patient/Guardian Signature</label>
              <button type="button" onClick={() => clear(patientCanvasRef.current, setPatientSig)} className="btn text-xs">
                Clear
              </button>
            </div>
            <canvas
              ref={patientCanvasRef}
              width={400}
              height={150}
              className="w-full rounded border border-line bg-white"
              onMouseDown={(e) => {
                const ctx = patientCanvasRef.current?.getContext("2d");
                if (ctx) {
                  ctx.beginPath();
                  ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                }
              }}
              onMouseMove={(e) => {
                if (e.buttons !== 1 || !patientCanvasRef.current) return;
                draw(e, patientCanvasRef.current, setPatientSig);
              }}
              onMouseUp={() => {
                const ctx = patientCanvasRef.current?.getContext("2d");
                if (ctx) ctx.beginPath();
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Dentist Signature</label>
              <button type="button" onClick={() => clear(dentistCanvasRef.current, setDentistSig)} className="btn text-xs">
                Clear
              </button>
            </div>
            <canvas
              ref={dentistCanvasRef}
              width={400}
              height={150}
              className="w-full rounded border border-line bg-white"
              onMouseDown={(e) => {
                const ctx = dentistCanvasRef.current?.getContext("2d");
                if (ctx) {
                  ctx.beginPath();
                  ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                }
              }}
              onMouseMove={(e) => {
                if (e.buttons !== 1 || !dentistCanvasRef.current) return;
                draw(e, dentistCanvasRef.current, setDentistSig);
              }}
              onMouseUp={() => {
                const ctx = dentistCanvasRef.current?.getContext("2d");
                if (ctx) ctx.beginPath();
              }}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-body flex flex-col gap-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 rounded border-line"
            />
            <span className="text-sm">
              I confirm that I have read and understood all clauses, initialed each, and provided signatures. I voluntarily give informed consent.
            </span>
          </label>
          <div className="flex items-center justify-between">
            <p className="hint">
              {!allInitialed && "Initial all clauses. "}
              {!hasSigs && "Provide both signatures. "}
              {!confirmed && "Check the confirmation box."}
            </p>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              <Check className="h-4 w-4" />
              Confirm & accept
            </button>
          </div>
          {state?.message && (
            <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-danger"}`}>
              {state.message}
            </p>
          )}
        </div>
      </section>
    </form>
  );
}
