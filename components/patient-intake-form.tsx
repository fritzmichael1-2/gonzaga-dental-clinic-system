"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eraser, Save } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type { Branch } from "@/lib/types";

type YesNo = "yes" | "no" | null;

/** Questions 1-7 of the paper form. Each has a follow-up when answered yes. */
const SCREENING = [
  { n: 1, text: "Are you in good health?" },
  {
    n: 2,
    text: "Are you under medical treatment now?",
    detail: "If so, what condition is being treated?",
  },
  {
    n: 3,
    text: "Have you ever had a serious illness or surgical operation?",
    detail: "If yes, what was the illness or operation?",
  },
  {
    n: 4,
    text: "Have you ever been hospitalized?",
    detail: "If so, when and why?",
  },
  {
    n: 5,
    text: "Are you now taking drugs or non-prescription medication?",
    detail: "If so, please specify",
  },
  { n: 6, text: "Do you use tobacco products?", detail: "How often / how much" },
  {
    n: 7,
    text: "Do you use alcohol, cocaine, or other dangerous drugs?",
    detail: "Please specify",
  },
] as const;

const ALLERGY_OPTIONS = [
  "Local anesthetic (ex. Lidocaine)",
  "Penicillin",
  "Antibiotics",
  "Sulfa drugs",
  "Barbiturates",
  "Aspirin",
  "Latex",
] as const;

/** Question 13 — duplicated entries on the printed form are merged here. */
const CONDITION_OPTIONS = [
  "Diabetes",
  "High blood pressure",
  "Low blood pressure",
  "Hemophilia",
  "AIDS or HIV infection",
  "Sexually transmitted disease",
  "Cold sores / fever blisters",
  "Fainting / seizures",
  "Rapid weight loss",
  "Radiation therapy",
  "Glaucoma",
  "Joint replacement / implant",
  "Heart disease",
  "Heart murmur",
  "Heart surgery",
  "Heart attack",
  "Angina",
  "Hepatitis / liver disease",
  "Jaundice",
  "Hay fever / allergies",
  "Respiratory problems",
  "Tuberculosis",
  "Kidney problems",
  "Swollen ankles",
  "Chest pain",
  "Stroke",
  "Cancer",
  "Anemia / tumors",
  "Asthma",
  "Emphysema",
  "Bleeding problems",
  "Blood diseases",
  "Arthritis / rheumatism",
  "Canker sores",
  "Thyroid problem",
  "Other",
] as const;

const BLOOD_TYPES = [
  "A+",
  "A−",
  "B+",
  "B−",
  "AB+",
  "AB−",
  "O+",
  "O−",
  "Unknown",
] as const;

const SEX_OPTIONS = [
  { value: "", label: "Not stated" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const CIVIL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
  "Annulled",
];

function Field({
  label,
  name,
  error,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {hint && <p className="hint mt-1">{hint}</p>}
      {error && <p className="error-text mt-1">{error}</p>}
    </div>
  );
}

function YesNoGroup({
  value,
  onChange,
  label,
}: {
  value: YesNo;
  onChange: (v: YesNo) => void;
  label: string;
}) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-md border border-line-strong bg-surface"
      role="group"
      aria-label={label}
    >
      {(["yes", "no"] as const).map((v, idx) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(value === v ? null : v)}
          className={`min-h-9 min-w-14 px-3 text-sm font-semibold transition-colors ${
            idx === 1 ? "border-l border-line-strong" : ""
          } ${
            value === v
              ? v === "yes"
                ? "bg-brand text-white"
                : "bg-ink-soft text-white"
              : "text-ink-soft hover:bg-surface-2"
          }`}
        >
          {v === "yes" ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

function ToggleChip({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        checked
          ? "border-brand bg-brand-tint text-ink"
          : "border-line bg-surface text-ink-soft hover:border-line-strong"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-line accent-[var(--brand)]"
      />
      {children}
    </label>
  );
}

/**
 * Digital intake form — the replacement for the paper form the patient fills in
 * at the front desk. The secretary encodes it (the usual case) and the patient
 * or guardian signs on the same device at the end.
 */
export default function PatientIntakeForm({
  action,
  branches,
  defaultBranchId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  branches: Branch[];
  defaultBranchId: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null
  );

  const [duplicateAck, setDuplicateAck] = useState(false);
  const [sex, setSex] = useState("");
  const [birthdate, setBirthdate] = useState("");

  const [screening, setScreening] = useState<
    Record<number, { answer: YesNo; detail: string }>
  >({});
  const [allergies, setAllergies] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [bleeding, setBleeding] = useState<YesNo>(null);
  const [women, setWomen] = useState<Record<string, YesNo>>({
    pregnant: null,
    nursing: null,
    pills: null,
  });
  const [physician, setPhysician] = useState({
    name: "",
    specialty: "",
    office: "",
    phone: "",
  });

  const [signature, setSignature] = useState<string | null>(null);
  const [sigError, setSigError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const age = useMemo(() => {
    if (!birthdate) return "";
    const bd = new Date(`${birthdate}T00:00:00`);
    if (Number.isNaN(bd.getTime())) return "";
    const now = new Date();
    let years = now.getFullYear() - bd.getFullYear();
    const m = now.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) years--;
    return years >= 0 && years < 130 ? String(years) : "";
  }, [birthdate]);

  const isDuplicateBlock =
    state && !state.ok && /similar patient already exists/i.test(state.message);
  const errors = (state && !state.ok ? state.fieldErrors : undefined) ?? {};
  const submitLabel = "Register patient";

  // ---------------------------------------------------------------
  // Signature pad
  // ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2937";
  }, []);

  function pointAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    setSigError(false);
    const p = pointAt(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = pointAt(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function handleUp() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSignature(canvas.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature(null);
  }

  // The patient must sign before the record is created, matching the paper
  // form where the signature block is mandatory.
  function guardSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!signature) {
      e.preventDefault();
      setSigError(true);
      canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const screeningJson = JSON.stringify(
    Object.fromEntries(
      SCREENING.map((q) => [
        `q${q.n}`,
        {
          answer: screening[q.n]?.answer ?? null,
          detail: screening[q.n]?.detail?.trim() || null,
        },
      ])
    )
  );

  return (
    <form
      action={formAction}
      onSubmit={guardSubmit}
      className="flex flex-col gap-5"
    >
      {/* Block answers travel as JSON — they are built client-side. */}
      <input type="hidden" name="screening" value={screeningJson} />
      {/* `_json` suffix: the chip list and the free-text "Known allergies"
          field on the Edit tab both post as `allergies`, and mixing them would
          store a JSON array in the summary column. */}
      <input type="hidden" name="allergies_json" value={JSON.stringify(allergies)} />
      <input type="hidden" name="conditions" value={JSON.stringify(conditions)} />
      <input type="hidden" name="women_only" value={JSON.stringify(women)} />
      <input
        type="hidden"
        name="physician"
        value={JSON.stringify({
          name: physician.name.trim() || null,
          specialty: physician.specialty.trim() || null,
          office: physician.office.trim() || null,
          phone: physician.phone.trim() || null,
        })}
      />
      {signature && (
        <input type="hidden" name="signature_png" value={signature} />
      )}

      {isDuplicateBlock && (
        <div className="rounded-lg border border-warn/40 bg-warn-tint px-4 py-3">
          <p className="text-sm font-semibold text-warn">
            A similar patient already exists
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Duplicate files split a patient&apos;s treatment history. If this is
            the same person, open the existing record and add the new details
            there instead.
          </p>
          <div className="mt-3">
            <Link
              href="/patients"
              className="text-sm font-semibold text-brand hover:underline"
            >
              Search existing patients →
            </Link>
          </div>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
            <input
              type="checkbox"
              name="duplicate_ack"
              value="yes"
              checked={duplicateAck}
              onChange={(e) => setDuplicateAck(e.target.checked)}
              className="mt-0.5 size-4 rounded border-line"
            />
            <span>
              This is a <strong>different person</strong> with the same name —
              create a separate record.
            </span>
          </label>
        </div>
      )}

      {state?.ok === false && !isDuplicateBlock && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}

      {/* ============================================================
          1. Patient information record
          ============================================================ */}
      <section className="panel p-5">
        <h2 className="panel-title mb-1">1 · Patient information record</h2>
        <p className="hint mb-4">
          The secretary encodes this while the patient answers. Fields marked
          with <span className="text-danger">*</span> are required.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Last name"
            name="last_name"
            required
            error={errors.last_name}
          >
            <input id="last_name" name="last_name" required className="field" />
          </Field>
          <Field
            label="First name"
            name="first_name"
            required
            error={errors.first_name}
          >
            <input id="first_name" name="first_name" required className="field" />
          </Field>
          <Field label="Middle name" name="middle_name" error={errors.middle_name}>
            <input id="middle_name" name="middle_name" className="field" />
          </Field>
          <Field label="Suffix" name="suffix" error={errors.suffix}>
            <input id="suffix" name="suffix" placeholder="Jr., III" className="field" />
          </Field>

          <Field label="Nickname" name="nickname" error={errors.nickname}>
            <input id="nickname" name="nickname" className="field" />
          </Field>
          <Field label="Birthdate" name="birthdate" error={errors.birthdate}>
            <input
              id="birthdate"
              name="birthdate"
              type="date"
              className="field"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
            />
          </Field>
          <Field label="Age" name="age" hint="Calculated from the birthdate">
            <input
              id="age"
              className="field bg-surface-2"
              value={age}
              readOnly
              tabIndex={-1}
              aria-readonly
            />
          </Field>
          <Field label="Sex" name="sex" error={errors.sex}>
            <select
              id="sex"
              name="sex"
              className="field"
              value={sex}
              onChange={(e) => setSex(e.target.value)}
            >
              {SEX_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Civil status" name="civil_status" error={errors.civil_status}>
            <select id="civil_status" name="civil_status" className="field" defaultValue="">
              <option value="">Not stated</option>
              {CIVIL_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Religion" name="religion" error={errors.religion}>
            <input id="religion" name="religion" className="field" />
          </Field>
          <Field label="Nationality" name="nationality" error={errors.nationality}>
            <input id="nationality" name="nationality" className="field" />
          </Field>
          <Field label="Birthplace" name="birthplace" error={errors.birthplace}>
            <input id="birthplace" name="birthplace" className="field" />
          </Field>

          <Field
            label="Home address"
            name="address"
            error={errors.address}
            className="sm:col-span-2"
          >
            <input id="address" name="address" className="field" />
          </Field>
          <Field label="Home no." name="home_no" error={errors.home_no}>
            <input id="home_no" name="home_no" inputMode="tel" className="field" />
          </Field>
          <Field
            label="Cel / mobile no."
            name="contact_no"
            required
            error={errors.contact_no}
          >
            <input
              id="contact_no"
              name="contact_no"
              inputMode="tel"
              required
              className="field"
              placeholder="0917 000 0000"
            />
          </Field>

          <Field label="Email address" name="email" error={errors.email}>
            <input id="email" name="email" type="email" className="field" />
          </Field>
          <Field label="Occupation" name="occupation" error={errors.occupation}>
            <input id="occupation" name="occupation" className="field" />
          </Field>
          <Field label="Office no." name="office_no" error={errors.office_no}>
            <input id="office_no" name="office_no" inputMode="tel" className="field" />
          </Field>
          <Field label="Fax no." name="fax_no" error={errors.fax_no}>
            <input id="fax_no" name="fax_no" inputMode="tel" className="field" />
          </Field>

          <Field
            label="Emergency contact"
            name="emergency_contact_name"
            error={errors.emergency_contact_name}
          >
            <input
              id="emergency_contact_name"
              name="emergency_contact_name"
              className="field"
            />
          </Field>
          <Field
            label="Emergency contact no."
            name="emergency_contact_no"
            error={errors.emergency_contact_no}
          >
            <input
              id="emergency_contact_no"
              name="emergency_contact_no"
              inputMode="tel"
              className="field"
            />
          </Field>
          <Field label="Dental insurance" name="dental_insurance" error={errors.dental_insurance}>
            <input id="dental_insurance" name="dental_insurance" className="field" />
          </Field>
          <Field
            label="Effective date"
            name="insurance_effective"
            error={errors.insurance_effective}
          >
            <input
              id="insurance_effective"
              name="insurance_effective"
              type="date"
              className="field"
            />
          </Field>

          <Field
            label="Branch"
            name="branch_id"
            error={errors.branch_id}
            className="sm:col-span-2"
          >
            <select
              id="branch_id"
              name="branch_id"
              className="field"
              defaultValue={defaultBranchId ?? ""}
            >
              <option value="">Not set</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Whom may we thank for referring you?"
            name="referred_by"
            error={errors.referred_by}
          >
            <input id="referred_by" name="referred_by" className="field" />
          </Field>
          <Field
            label="Reason for dental consultation"
            name="consultation_reason"
            error={errors.consultation_reason}
          >
            <input id="consultation_reason" name="consultation_reason" className="field" />
          </Field>
        </div>

        <h3 className="mt-6 text-sm font-semibold text-ink">
          For patients below 18 — parent / guardian
        </h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Guardian name" name="guardian_name" error={errors.guardian_name}>
            <input id="guardian_name" name="guardian_name" className="field" />
          </Field>
          <Field
            label="Guardian occupation"
            name="guardian_occupation"
            error={errors.guardian_occupation}
          >
            <input
              id="guardian_occupation"
              name="guardian_occupation"
              className="field"
            />
          </Field>
          <Field
            label="Guardian email"
            name="guardian_email"
            error={errors.guardian_email}
          >
            <input
              id="guardian_email"
              name="guardian_email"
              type="email"
              className="field"
            />
          </Field>
        </div>
      </section>

      {/* ============================================================
          2. Dental history
          ============================================================ */}
      <section className="panel p-5">
        <h2 className="panel-title mb-4">2 · Dental history</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Previous dentist (Dr.)"
            name="previous_dentist"
            error={errors.previous_dentist}
          >
            <input id="previous_dentist" name="previous_dentist" className="field" />
          </Field>
          <Field
            label="Last dental visit"
            name="last_dental_visit"
            error={errors.last_dental_visit}
          >
            <input
              id="last_dental_visit"
              name="last_dental_visit"
              type="date"
              className="field"
            />
          </Field>
          <Field
            label="Previous dentist office address"
            name="previous_dentist_office"
            error={errors.previous_dentist_office}
          >
            <input
              id="previous_dentist_office"
              name="previous_dentist_office"
              className="field"
            />
          </Field>
        </div>
      </section>

      {/* ============================================================
          3. Medical history
          ============================================================ */}
      <section className="panel p-5">
        <h2 className="panel-title mb-4">3 · Medical history</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Name of physician"
            name="physician_name"
            className="sm:col-span-2"
          >
            <input
              id="physician_name"
              className="field"
              value={physician.name}
              onChange={(e) =>
                setPhysician({ ...physician, name: e.target.value })
              }
            />
          </Field>
          <Field label="Specialty" name="physician_specialty">
            <input
              id="physician_specialty"
              className="field"
              value={physician.specialty}
              onChange={(e) =>
                setPhysician({ ...physician, specialty: e.target.value })
              }
            />
          </Field>
          <Field label="Office number" name="physician_phone">
            <input
              id="physician_phone"
              inputMode="tel"
              className="field"
              value={physician.phone}
              onChange={(e) =>
                setPhysician({ ...physician, phone: e.target.value })
              }
            />
          </Field>
          <Field
            label="Office address"
            name="physician_office"
            className="sm:col-span-2 lg:col-span-4"
          >
            <input
              id="physician_office"
              className="field"
              value={physician.office}
              onChange={(e) =>
                setPhysician({ ...physician, office: e.target.value })
              }
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {SCREENING.map((q) => {
            const current = screening[q.n] ?? { answer: null, detail: "" };
            return (
              <div
                key={q.n}
                className={`rounded-lg border p-3 ${
                  current.answer
                    ? "border-brand/40 bg-brand-tint/40"
                    : "border-line bg-surface"
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="mr-2 inline-grid size-5 place-items-center rounded bg-surface-2 text-xs font-bold text-ink-soft">
                      {q.n}
                    </span>
                    <span className="font-semibold">{q.text}</span>
                  </p>
                  <YesNoGroup
                    label={`Question ${q.n}`}
                    value={current.answer}
                    onChange={(v) =>
                      setScreening({
                        ...screening,
                        [q.n]: { answer: v, detail: current.detail },
                      })
                    }
                  />
                </div>
                {"detail" in q && current.answer === "yes" && (
                  <div className="mt-3">
                    <label className="label" htmlFor={`q${q.n}_detail`}>
                      {q.detail}
                    </label>
                    <input
                      id={`q${q.n}_detail`}
                      className="field"
                      value={current.detail}
                      onChange={(e) =>
                        setScreening({
                          ...screening,
                          [q.n]: { answer: current.answer, detail: e.target.value },
                        })
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* 8. allergies */}
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-sm">
              <span className="mr-2 inline-grid size-5 place-items-center rounded bg-surface-2 text-xs font-bold text-ink-soft">
                8
              </span>
              <span className="font-semibold">Allergies</span> — check all that
              apply.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALLERGY_OPTIONS.map((a) => (
                <ToggleChip
                  key={a}
                  checked={allergies.includes(a)}
                  onChange={(on) =>
                    setAllergies(
                      on ? [...allergies, a] : allergies.filter((x) => x !== a)
                    )
                  }
                >
                  {a}
                </ToggleChip>
              ))}
            </div>
            <Field label="Other allergy" name="allergy_other" className="mt-3 max-w-md">
              <input id="allergy_other" name="allergy_other" className="field" />
            </Field>
          </div>

          {/* 9. bleeding */}
          <div
            className={`rounded-lg border p-3 ${
              bleeding ? "border-brand/40 bg-brand-tint/40" : "border-line bg-surface"
            }`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <p className="min-w-0 flex-1 text-sm">
                <span className="mr-2 inline-grid size-5 place-items-center rounded bg-surface-2 text-xs font-bold text-ink-soft">
                  9
                </span>
                <span className="font-semibold">Bleeding problems?</span> —
                prolonged bleeding, bleeding gums, bleeding disorder
              </p>
              <YesNoGroup label="Bleeding problems" value={bleeding} onChange={setBleeding} />
            </div>
            {bleeding === "yes" && (
              <Field
                label="Bleeding time / details"
                name="bleeding_time"
                className="mt-3 max-w-md"
              >
                <input id="bleeding_time" name="bleeding_time" className="field" />
              </Field>
            )}
          </div>

          {/* 10. women only */}
          {sex === "female" && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="text-sm">
                <span className="mr-2 inline-grid size-5 place-items-center rounded bg-surface-2 text-xs font-bold text-ink-soft">
                  10
                </span>
                <span className="font-semibold">For women only</span>{" "}
                <span className="hint">— shown because sex is female</span>
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  ["pregnant", "Are you pregnant?"],
                  ["nursing", "Are you nursing?"],
                  ["pills", "Are you taking birth control pills?"],
                ].map(([key, label]) => (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-3 border-b border-line/60 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="min-w-0 flex-1 text-sm">{label}</span>
                    <YesNoGroup
                      label={label}
                      value={women[key] ?? null}
                      onChange={(v) => setWomen({ ...women, [key]: v })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 11 + 12 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="11. Blood type" name="blood_type" error={errors.blood_type}>
              <select id="blood_type" name="blood_type" className="field" defaultValue="">
                <option value="">Not stated</option>
                {BLOOD_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="12. Blood pressure" name="blood_pressure" error={errors.blood_pressure}>
              <input
                id="blood_pressure"
                name="blood_pressure"
                placeholder="120 / 80"
                className="field"
              />
            </Field>
          </div>

          {/* 13. conditions */}
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-sm">
              <span className="mr-2 inline-grid size-5 place-items-center rounded bg-surface-2 text-xs font-bold text-ink-soft">
                13
              </span>
              <span className="font-semibold">
                Do you or have you had any of the following?
              </span>{" "}
              Check which apply.
              {conditions.length > 0 && (
                <span className="ml-2 text-xs font-semibold text-brand">
                  {conditions.length} selected
                </span>
              )}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CONDITION_OPTIONS.map((c) => (
                <ToggleChip
                  key={c}
                  checked={conditions.includes(c)}
                  onChange={(on) =>
                    setConditions(
                      on ? [...conditions, c] : conditions.filter((x) => x !== c)
                    )
                  }
                >
                  {c}
                </ToggleChip>
              ))}
            </div>
            {conditions.includes("Other") && (
              <Field
                label="Other condition — please specify"
                name="condition_other"
                className="mt-3 max-w-md"
              >
                <input id="condition_other" name="condition_other" className="field" />
              </Field>
            )}
          </div>

          <Field label="Notes for the dentist" name="notes" error={errors.notes}>
            <textarea id="notes" name="notes" rows={2} className="field" />
          </Field>

          <Field
            label="Current medications"
            name="medications"
            error={errors.medications}
            hint="Anything taken regularly, including vitamins and supplements."
          >
            <textarea id="medications" name="medications" rows={2} className="field" />
          </Field>
        </div>
      </section>

      {/* ============================================================
          Signature
          ============================================================ */}
      <section className="panel p-5">
        <h2 className="panel-title mb-1">Patient / guardian signature</h2>
        <p className="hint mb-3">
          Hand the device to the patient. Sign with a finger, stylus or mouse.
          The signature is required before the record is created.
        </p>
        <div
          className={`rounded-lg border border-dashed p-1 ${
            sigError ? "border-danger" : "border-line-strong"
          }`}
        >
          <canvas
            ref={canvasRef}
            className="block h-44 w-full touch-none rounded bg-white"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onPointerLeave={handleUp}
            aria-label="Patient signature"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={clearSignature} className="btn text-xs">
            <Eraser size={14} aria-hidden />
            Clear
          </button>
          {sigError && (
            <p className="text-sm font-semibold text-danger">
              A signature is required.
            </p>
          )}
          {signature && (
            <p className="text-sm font-medium text-ok">Signature captured.</p>
          )}
        </div>
        <p className="hint mt-2">
          Encoded by the front desk. The signature above is the patient&apos;s
          own — the record stores both, separately.
        </p>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/patients" className="btn-ghost">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending || (Boolean(isDuplicateBlock) && !duplicateAck)}
          className="btn-primary"
        >
          <Save size={16} aria-hidden />
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
