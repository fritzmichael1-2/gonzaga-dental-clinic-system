"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import type { Branch } from "@/lib/types";

const SEX_OPTIONS = [
  { value: "", label: "Not stated" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

/** TODO(CLINIC): confirm the civil-status options the clinic accepts. */
const CIVIL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
  "Annulled",
];

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="error-text mt-1">{msg}</p> : null;
}

function Field({
  label,
  name,
  error,
  required,
  children,
  hint,
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {hint && <p className="hint mt-1">{hint}</p>}
      <Err msg={error} />
    </div>
  );
}

/**
 * The subset of patient fields the form edits. Passed in edit mode so the
 * inputs render the stored values instead of blank boxes.
 */
export type PatientDefaults = Partial<{
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  suffix: string | null;
  nickname: string | null;
  birthdate: string | null;
  sex: string | null;
  civil_status: string | null;
  contact_no: string | null;
  email: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_no: string | null;
  branch_id: string | null;
  allergies: string | null;
  medical_history: string | null;
  medications: string | null;
}>;

/**
 * Digital intake form — the replacement for the paper form completed by the
 * patient at the front desk.
 */
export default function PatientForm({
  action,
  branches,
  defaultBranchId,
  mode = "create",
  patientId,
  defaults,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  branches: Branch[];
  defaultBranchId: string | null;
  mode?: "create" | "edit";
  patientId?: string;
  defaults?: PatientDefaults;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null
  );
  // Shown once staff confirm the duplicate warning, so the guard cannot be
  // dismissed by accident and cannot be silently bypassed either.
  const [duplicateAck, setDuplicateAck] = useState(false);

  const isDuplicateBlock = state && !state.ok && /similar patient already exists/i.test(state.message);
  const fieldErrors = (state && !state.ok ? state.fieldErrors : undefined) ?? {};
  const submitLabel = mode === "edit" ? "Save changes" : "Register patient";

  // Uncontrolled inputs keyed off this. `v()` normalises null/undefined to "",
  // because defaultValue={null} renders an empty control just fine but
  // defaultValue={undefined} would make React fall back to uncontrolled
  // warning-free behaviour inconsistently.
  const v = (key: keyof PatientDefaults) => defaults?.[key] ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {patientId && <input type="hidden" name="id" value={patientId} />}

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
      {state?.ok === true && state.message && (
        <p role="status" className="text-sm font-medium text-ok">
          {state.message}
        </p>
      )}

      <section className="panel p-5">
        <h2 className="panel-title mb-4">Patient details</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Field
            label="Last name"
            name="last_name"
            required
            error={fieldErrors.last_name}
          >
            <input id="last_name" name="last_name" required className="field" defaultValue={v("last_name")} />
          </Field>

          <Field
            label="First name"
            name="first_name"
            required
            error={fieldErrors.first_name}
          >
            <input id="first_name" name="first_name" required className="field" defaultValue={v("first_name")} />
          </Field>

          <Field label="Middle name" name="middle_name" error={fieldErrors.middle_name}>
            <input id="middle_name" name="middle_name" className="field" defaultValue={v("middle_name")} />
          </Field>

          <Field label="Suffix" name="suffix" error={fieldErrors.suffix}>
            <input id="suffix" name="suffix" placeholder="Jr., III" className="field" defaultValue={v("suffix")} />
          </Field>

          <Field label="Nickname" name="nickname" error={fieldErrors.nickname}>
            <input id="nickname" name="nickname" className="field" defaultValue={v("nickname")} />
          </Field>

          <Field
            label="Birthdate"
            name="birthdate"
            error={fieldErrors.birthdate}
            hint="Used to catch duplicate records."
          >
            <input id="birthdate" name="birthdate" type="date" className="field" defaultValue={v("birthdate")} />
          </Field>

          <Field label="Sex" name="sex" error={fieldErrors.sex}>
            <select id="sex" name="sex" className="field" defaultValue={v("sex")}>
              {SEX_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Civil status" name="civil_status" error={fieldErrors.civil_status}>
            <select id="civil_status" name="civil_status" className="field" defaultValue={v("civil_status")}>
              <option value="">Not stated</option>
              {CIVIL_STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="panel-title mb-4">Contact</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Field
            label="Contact number"
            name="contact_no"
            error={fieldErrors.contact_no}
            hint="Used to look a patient up quickly."
          >
            <input id="contact_no" name="contact_no" className="field" placeholder="0917 000 0000" defaultValue={v("contact_no")} />
          </Field>

          <Field label="Email" name="email" error={fieldErrors.email}>
            <input id="email" name="email" type="email" className="field" defaultValue={v("email")} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Address" name="address" error={fieldErrors.address}>
              <input id="address" name="address" className="field" defaultValue={v("address")} />
            </Field>
          </div>

          <Field
            label="Emergency contact"
            name="emergency_contact_name"
            error={fieldErrors.emergency_contact_name}
          >
            <input
              id="emergency_contact_name"
              name="emergency_contact_name"
              className="field"
              defaultValue={v("emergency_contact_name")}
            />
          </Field>

          <Field
            label="Emergency contact number"
            name="emergency_contact_no"
            error={fieldErrors.emergency_contact_no}
          >
            <input
              id="emergency_contact_no"
              name="emergency_contact_no"
              className="field"
              defaultValue={v("emergency_contact_no")}
            />
          </Field>

          <Field label="Branch" name="branch_id" error={fieldErrors.branch_id}>
            <select
              id="branch_id"
              name="branch_id"
              className="field"
              defaultValue={defaults?.branch_id ?? defaultBranchId ?? ""}
            >
              <option value="">Not set</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="panel-title mb-4">Medical history</h2>
        <div className="flex flex-col gap-4">
          <Field
            label="Known allergies"
            name="allergies"
            error={fieldErrors.allergies}
            hint="Shown as an alert in the patient list."
          >
            <input id="allergies" name="allergies" className="field" defaultValue={v("allergies")} />
          </Field>

          <Field label="Medical history" name="medical_history" error={fieldErrors.medical_history}>
            <textarea id="medical_history" name="medical_history" rows={3} className="field" defaultValue={v("medical_history")} />
          </Field>

          <Field label="Current medications" name="medications" error={fieldErrors.medications}>
            <textarea id="medications" name="medications" rows={2} className="field" defaultValue={v("medications")} />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Link href={mode === "edit" ? `/patients/${patientId}` : "/patients"} className="btn-ghost">
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