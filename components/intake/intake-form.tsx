"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eraser, Save } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type { Branch } from "@/lib/types";
import s from "./intake-form.module.css";

type YesNo = "yes" | "no" | null;
type Span = 2 | 3 | 4;

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

/**
 * One labelled cell of the sheet. Mirrors the mockup's `.field`: micro-label,
 * optional inline hint, the control, and the validation message underneath.
 */
function SheetField({
  label,
  htmlFor,
  hint,
  error,
  span,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  span?: Span;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        s.field,
        span ? s[`span${span}`] : "",
        error ? s.fieldErr : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <label htmlFor={htmlFor}>
        {label}
        {hint && <span className={s.hint}> {hint}</span>}
      </label>
      {children}
      {error && <span className={s.msg}>{error}</span>}
    </div>
  );
}

/** The paper form's Y / N pair. Pressing the active side clears the answer. */
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
    <div className={s.yn} role="group" aria-label={label}>
      {(["yes", "no"] as const).map((v) => (
        <button
          key={v}
          type="button"
          data-v={v}
          aria-pressed={value === v}
          onClick={() => onChange(value === v ? null : v)}
        >
          {v === "yes" ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

function SheetChip({
  checked,
  onChange,
  variant = "chip",
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  variant?: "chip" | "cond";
  children: React.ReactNode;
}) {
  const base = variant === "cond" ? s.cond : s.chip;
  return (
    <label className={`${base} ${checked ? s.sel : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}

/**
 * Digital intake form — the replacement for the paper form the patient fills in
 * at the front desk. The secretary encodes it (the usual case) and the patient
 * or guardian signs on the same device at the end.
 *
 * Layout is the clinic's printed form (public/mockups/intake-form.html): three
 * numbered cards plus the signature block. Only the presentation follows the
 * mockup — the fields, validation and submission are unchanged.
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
    <form action={formAction} onSubmit={guardSubmit} className={s.root}>
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
      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.num}>1</span>
          <h2>Patient information record</h2>
        </div>
        <div className={s.cardBody}>
          <div className={`${s.grid} ${s.g4}`}>
            <SheetField label="Last name" htmlFor="last_name" hint="required" error={errors.last_name}>
              <input id="last_name" name="last_name" required autoComplete="family-name" />
            </SheetField>
            <SheetField label="First name" htmlFor="first_name" hint="required" error={errors.first_name}>
              <input id="first_name" name="first_name" required autoComplete="given-name" />
            </SheetField>
            <SheetField label="Middle name" htmlFor="middle_name" error={errors.middle_name}>
              <input id="middle_name" name="middle_name" autoComplete="additional-name" />
            </SheetField>
            <SheetField label="Suffix" htmlFor="suffix" error={errors.suffix}>
              <input id="suffix" name="suffix" placeholder="Jr., III" />
            </SheetField>

            <SheetField label="Nickname(s)" htmlFor="nickname" error={errors.nickname}>
              <input id="nickname" name="nickname" />
            </SheetField>
            <SheetField label="Birthdate" htmlFor="birthdate" hint="mm/dd/yyyy" error={errors.birthdate}>
              <input
                id="birthdate"
                name="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
              />
            </SheetField>
            <SheetField label="Age" htmlFor="age" hint="from birthdate">
              <input
                id="age"
                value={age}
                readOnly
                tabIndex={-1}
                aria-readonly
                placeholder="auto"
              />
            </SheetField>
            <SheetField label="Sex (M/F)" htmlFor="sex" error={errors.sex}>
              <select
                id="sex"
                name="sex"
                value={sex}
                onChange={(e) => setSex(e.target.value)}
              >
                {SEX_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </SheetField>

            <SheetField label="Civil status" htmlFor="civil_status" error={errors.civil_status}>
              <select id="civil_status" name="civil_status" defaultValue="">
                <option value="">Not stated</option>
                {CIVIL_STATUS_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </SheetField>
            <SheetField label="Religion" htmlFor="religion" error={errors.religion}>
              <input id="religion" name="religion" placeholder="Roman Catholic" />
            </SheetField>
            <SheetField label="Nationality" htmlFor="nationality" error={errors.nationality}>
              <input id="nationality" name="nationality" placeholder="Filipino" />
            </SheetField>
            <SheetField label="Birthplace" htmlFor="birthplace" error={errors.birthplace}>
              <input id="birthplace" name="birthplace" placeholder="City / municipality, province" />
            </SheetField>

            <SheetField label="Home address" htmlFor="address" span={2} error={errors.address}>
              <input id="address" name="address" placeholder="House no., street, barangay, city" />
            </SheetField>
            <SheetField label="Home no." htmlFor="home_no" error={errors.home_no}>
              <input id="home_no" name="home_no" inputMode="tel" placeholder="(033) 000 0000" />
            </SheetField>
            <SheetField
              label="Cel / mobile no."
              htmlFor="contact_no"
              hint="required"
              error={errors.contact_no}
            >
              <input
                id="contact_no"
                name="contact_no"
                inputMode="tel"
                required
                placeholder="0917 000 0000"
              />
            </SheetField>

            <SheetField label="Email address" htmlFor="email" span={2} error={errors.email}>
              <input id="email" name="email" type="email" placeholder="name@example.com" />
            </SheetField>
            <SheetField label="Occupation" htmlFor="occupation" error={errors.occupation}>
              <input id="occupation" name="occupation" placeholder="Student" />
            </SheetField>
            <SheetField label="Office no." htmlFor="office_no" error={errors.office_no}>
              <input id="office_no" name="office_no" inputMode="tel" placeholder="(033) 000 0000" />
            </SheetField>

            <SheetField label="Fax no." htmlFor="fax_no" error={errors.fax_no}>
              <input id="fax_no" name="fax_no" inputMode="tel" placeholder="(033) 000 0000" />
            </SheetField>
            <SheetField label="Dental insurance" htmlFor="dental_insurance" error={errors.dental_insurance}>
              <input id="dental_insurance" name="dental_insurance" placeholder="Company / policy no." />
            </SheetField>
            <SheetField
              label="Effective date"
              htmlFor="insurance_effective"
              span={2}
              error={errors.insurance_effective}
            >
              <input id="insurance_effective" name="insurance_effective" type="date" />
            </SheetField>

            <div className={s.groupLabel}>Emergency contact &amp; branch</div>
            <SheetField
              label="Emergency contact"
              htmlFor="emergency_contact_name"
              span={2}
              error={errors.emergency_contact_name}
            >
              <input id="emergency_contact_name" name="emergency_contact_name" />
            </SheetField>
            <SheetField
              label="Emergency contact no."
              htmlFor="emergency_contact_no"
              error={errors.emergency_contact_no}
            >
              <input id="emergency_contact_no" name="emergency_contact_no" inputMode="tel" />
            </SheetField>
            <SheetField label="Branch" htmlFor="branch_id" error={errors.branch_id}>
              <select id="branch_id" name="branch_id" defaultValue={defaultBranchId ?? ""}>
                <option value="">Not set</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </SheetField>

            <div className={s.groupLabel}>For patients below 18 — parent / guardian</div>
            <SheetField
              label="Parent / guardian name"
              htmlFor="guardian_name"
              span={2}
              error={errors.guardian_name}
            >
              <input id="guardian_name" name="guardian_name" />
            </SheetField>
            <SheetField
              label="Guardian occupation"
              htmlFor="guardian_occupation"
              error={errors.guardian_occupation}
            >
              <input id="guardian_occupation" name="guardian_occupation" />
            </SheetField>
            <SheetField
              label="Guardian email"
              htmlFor="guardian_email"
              error={errors.guardian_email}
            >
              <input id="guardian_email" name="guardian_email" type="email" />
            </SheetField>

            <SheetField
              label="Whom may we thank for referring you?"
              htmlFor="referred_by"
              span={2}
              error={errors.referred_by}
            >
              <input
                id="referred_by"
                name="referred_by"
                placeholder="Name of person / clinic / advertisement"
              />
            </SheetField>
            <SheetField
              label="Reason for dental consultation"
              htmlFor="consultation_reason"
              span={2}
              error={errors.consultation_reason}
            >
              <input
                id="consultation_reason"
                name="consultation_reason"
                placeholder="Toothache, cleaning, braces, check-up…"
              />
            </SheetField>
          </div>
        </div>
      </section>

      {/* ============================================================
          2. Dental history
          ============================================================ */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.num}>2</span>
          <h2>Dental history</h2>
        </div>
        <div className={s.cardBody}>
          <div className={`${s.grid} ${s.g2}`}>
            <SheetField
              label="Previous dentist (Dr.)"
              htmlFor="previous_dentist"
              error={errors.previous_dentist}
            >
              <input id="previous_dentist" name="previous_dentist" placeholder="Dr. —" />
            </SheetField>
            <SheetField
              label="Last dental visit"
              htmlFor="last_dental_visit"
              error={errors.last_dental_visit}
            >
              <input id="last_dental_visit" name="last_dental_visit" type="date" />
            </SheetField>
            <SheetField
              label="Previous dentist office address"
              htmlFor="previous_dentist_office"
              span={2}
              error={errors.previous_dentist_office}
            >
              <input
                id="previous_dentist_office"
                name="previous_dentist_office"
                placeholder="Clinic address (optional)"
              />
            </SheetField>
          </div>
        </div>
      </section>

      {/* ============================================================
          3. Medical history
          ============================================================ */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.num}>3</span>
          <h2>Medical history</h2>
        </div>
        <div className={s.cardBody}>
          <div className={`${s.grid} ${s.g4} mb-4`}>
            <SheetField label="Name of physician" htmlFor="physician_name" span={2}>
              <input
                id="physician_name"
                value={physician.name}
                onChange={(e) => setPhysician({ ...physician, name: e.target.value })}
                placeholder="Dr. —"
              />
            </SheetField>
            <SheetField label="Specialty" htmlFor="physician_specialty">
              <input
                id="physician_specialty"
                value={physician.specialty}
                onChange={(e) =>
                  setPhysician({ ...physician, specialty: e.target.value })
                }
                placeholder="Internal medicine"
              />
            </SheetField>
            <SheetField label="Office number" htmlFor="physician_phone">
              <input
                id="physician_phone"
                inputMode="tel"
                value={physician.phone}
                onChange={(e) => setPhysician({ ...physician, phone: e.target.value })}
                placeholder="(033) 000 0000"
              />
            </SheetField>
            <SheetField label="Office address" htmlFor="physician_office" span={4}>
              <input
                id="physician_office"
                value={physician.office}
                onChange={(e) => setPhysician({ ...physician, office: e.target.value })}
                placeholder="Clinic / hospital address"
              />
            </SheetField>
          </div>

          <div className={s.qs}>
            {/* 1-7: screening questions */}
            {SCREENING.map((q) => {
              const current = screening[q.n] ?? { answer: null, detail: "" };
              return (
                <div key={q.n} className={`${s.q} ${current.answer ? s.qOn : ""}`}>
                  <div className={s.qTop}>
                    <p className={s.qText}>
                      <span className={s.qNum}>{q.n}</span>
                      <b>{q.text}</b>
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
                    <div className={s.detail}>
                      <SheetField label={q.detail} htmlFor={`q${q.n}_detail`}>
                        <input
                          id={`q${q.n}_detail`}
                          value={current.detail}
                          onChange={(e) =>
                            setScreening({
                              ...screening,
                              [q.n]: { answer: current.answer, detail: e.target.value },
                            })
                          }
                        />
                      </SheetField>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 8. allergies */}
            <div className={s.q}>
              <div className={s.qTop}>
                <p className={s.qText}>
                  <span className={s.qNum}>8</span>
                  <b>Allergies</b> — are you allergic to any of the following? Check
                  all that apply.
                </p>
              </div>
              <div className={`${s.chips} mt-2.5`}>
                {ALLERGY_OPTIONS.map((a) => (
                  <SheetChip
                    key={a}
                    checked={allergies.includes(a)}
                    onChange={(on) =>
                      setAllergies(
                        on ? [...allergies, a] : allergies.filter((x) => x !== a)
                      )
                    }
                  >
                    {a}
                  </SheetChip>
                ))}
              </div>
              <div className={s.detail}>
                <SheetField label="Other allergy" htmlFor="allergy_other" error={errors.allergy_other}>
                  <input id="allergy_other" name="allergy_other" placeholder="Specify…" />
                </SheetField>
              </div>
            </div>

            {/* 9. bleeding */}
            <div className={`${s.q} ${bleeding ? s.qOn : ""}`}>
              <div className={s.qTop}>
                <p className={s.qText}>
                  <span className={s.qNum}>9</span>
                  <b>Bleeding problems?</b> — prolonged bleeding, bleeding gums,
                  bleeding disorder
                </p>
                <YesNoGroup
                  label="Bleeding problems"
                  value={bleeding}
                  onChange={setBleeding}
                />
              </div>
              {bleeding === "yes" && (
                <div className={s.detail}>
                  <SheetField
                    label="Bleeding time / details"
                    htmlFor="bleeding_time"
                    error={errors.bleeding_time}
                  >
                    <input
                      id="bleeding_time"
                      name="bleeding_time"
                      placeholder="e.g. 2 min — or describe the problem"
                    />
                  </SheetField>
                </div>
              )}
            </div>

            {/* 10. women only */}
            {sex === "female" && (
              <div className={s.q}>
                <div className={s.qTop}>
                  <p className={s.qText}>
                    <span className={s.qNum}>10</span>
                    <b>For women only</b>{" "}
                    <span className={s.hint}>— shown because sex is female</span>
                  </p>
                </div>
                <div className="mt-2">
                  {(
                    [
                      ["pregnant", "Are you pregnant?"],
                      ["nursing", "Are you nursing?"],
                      ["pills", "Are you taking birth control pills?"],
                    ] as const
                  ).map(([key, text]) => (
                    <div key={key} className={s.qSub}>
                      <span className={s.qSubText}>{text}</span>
                      <YesNoGroup
                        label={text}
                        value={women[key] ?? null}
                        onChange={(v) => setWomen({ ...women, [key]: v })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 11 + 12 + notes */}
            <div className={`${s.grid} ${s.g4} mt-2.5`}>
              <SheetField label="11. Blood type" htmlFor="blood_type" error={errors.blood_type}>
                <select id="blood_type" name="blood_type" defaultValue="">
                  <option value="">Not stated</option>
                  {BLOOD_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </SheetField>
              <SheetField
                label="12. Blood pressure"
                htmlFor="blood_pressure"
                error={errors.blood_pressure}
              >
                <input
                  id="blood_pressure"
                  name="blood_pressure"
                  placeholder="120 / 80"
                />
              </SheetField>
              <SheetField label="Notes for the dentist" htmlFor="notes" span={2} error={errors.notes}>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  placeholder="Anything else the dentist should know"
                />
              </SheetField>
              <SheetField
                label="Current medications"
                htmlFor="medications"
                span={4}
                hint="anything taken regularly, including vitamins"
                error={errors.medications}
              >
                <textarea id="medications" name="medications" rows={2} />
              </SheetField>
            </div>

            {/* 13. conditions */}
            <div className={s.q}>
              <div className={s.qTop}>
                <p className={s.qText}>
                  <span className={s.qNum}>13</span>
                  <b>Do you or have you had any of the following?</b> Check which
                  apply.
                </p>
                {conditions.length > 0 && (
                  <span className={s.count}>{conditions.length} selected</span>
                )}
              </div>
              <div className={`${s.condGrid} mt-2.5`}>
                {CONDITION_OPTIONS.map((c) => (
                  <SheetChip
                    key={c}
                    variant="cond"
                    checked={conditions.includes(c)}
                    onChange={(on) =>
                      setConditions(
                        on ? [...conditions, c] : conditions.filter((x) => x !== c)
                      )
                    }
                  >
                    {c}
                  </SheetChip>
                ))}
              </div>
              {conditions.includes("Other") && (
                <div className={s.detail}>
                  <SheetField
                    label="Other condition — please specify"
                    htmlFor="condition_other"
                    error={errors.condition_other}
                  >
                    <input id="condition_other" name="condition_other" placeholder="Specify…" />
                  </SheetField>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          Signature
          ============================================================ */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.num}>✓</span>
          <h2>Patient / guardian signature</h2>
        </div>
        <div className={s.cardBody}>
          <div className={`${s.sigWrap} ${sigError ? s.sigWrapErr : ""}`}>
            <canvas
              ref={canvasRef}
              className={s.sig}
              onPointerDown={handleDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
              onPointerLeave={handleUp}
              aria-label="Patient signature"
            />
          </div>
          <div className={s.sigFoot}>
            <button type="button" onClick={clearSignature} className="btn-ghost">
              <Eraser size={14} aria-hidden />
              Clear canvas
            </button>
            <p className={s.hint}>
              Sign with a finger, stylus, or mouse. The signature is required
              before the record is created.
            </p>
            {sigError && <span className={s.sigErr}>A signature is required.</span>}
            {signature && <span className={s.sigOk}>Signature captured.</span>}
          </div>
          <p className={`${s.hint} mt-2`}>
            Encoded by the front desk. The signature above is the patient&apos;s
            own — the record stores both, separately.
          </p>
        </div>
        <div className={s.actions}>
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
      </section>
    </form>
  );
}
