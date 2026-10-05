"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import type { ActionState } from "@/app/(app)/patients/actions";
import { inviteStaff, updateStaff } from "@/app/(app)/staff/actions";
import type { Branch, StaffRole } from "@/lib/types";

const ROLES: { value: StaffRole; label: string }[] = [
  { value: "secretary", label: "Secretary" },
  { value: "dentist", label: "Dentist" },
  { value: "admin", label: "Administrator" },
];

export function InviteStaffForm({ branches }: { branches: Branch[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    inviteStaff,
    null
  );
  const fieldErrors = (state && !state.ok ? state.fieldErrors : undefined) ?? {};

  return (
    <form action={formAction} className="panel flex flex-col gap-4 p-5">
      <h2 className="panel-title">Add a staff account</h2>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="invite_name">
            Full name
          </label>
          <input id="invite_name" name="full_name" required className="field" />
          {fieldErrors.full_name && (
            <p className="error-text mt-1">{fieldErrors.full_name}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="invite_email">
            Email
          </label>
          <input
            id="invite_email"
            name="email"
            type="email"
            required
            className="field"
          />
          {fieldErrors.email && (
            <p className="error-text mt-1">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="invite_role">
            Role
          </label>
          <select id="invite_role" name="role" className="field" defaultValue="secretary">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="invite_branch">
            Home branch
          </label>
          <select id="invite_branch" name="branch_id" className="field" defaultValue="">
            <option value="">Not set</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="invite_password">
            Temporary password
          </label>
          <input
            id="invite_password"
            name="password"
            type="text"
            required
            className="field font-mono"
            placeholder="8+ chars, upper, lower, digit, symbol"
          />
          <p className="hint mt-1">
            Share it with the staff member and ask them to change it after their
            first sign-in.
          </p>
          {fieldErrors.password && (
            <p className="error-text mt-1">{fieldErrors.password}</p>
          )}
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
          <UserPlus size={16} aria-hidden />
          {pending ? "Creating…" : "Create account"}
        </button>
      </div>
    </form>
  );
}

type StaffRow = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  branch_id: string | null;
  is_active: boolean;
  branches: { id: string; name: string }[] | null;
};

/** Inline editor. Saving uses a separate action per row id. */
export function StaffRowEditor({
  staff,
  branches,
  isSelf,
}: {
  staff: StaffRow;
  branches: Branch[];
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateStaff,
    null
  );
  const fieldErrors = (state && !state.ok ? state.fieldErrors : undefined) ?? {};
  const branchName = staff.branches?.[0]?.name ?? null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={staff.id} />

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor={`name-${staff.id}`}>
            Name
          </label>
          <input
            id={`name-${staff.id}`}
            name="full_name"
            defaultValue={staff.full_name}
            required
            className="field"
          />
          {fieldErrors.full_name && (
            <p className="error-text mt-1">{fieldErrors.full_name}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor={`role-${staff.id}`}>
            Role
          </label>
          <select
            id={`role-${staff.id}`}
            name="role"
            defaultValue={staff.role}
            className="field"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor={`branch-${staff.id}`}>
            Home branch
          </label>
          <select
            id={`branch-${staff.id}`}
            name="branch_id"
            defaultValue={staff.branch_id ?? ""}
            className="field"
          >
            <option value="">Not set</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Access</span>
          <label className="field flex min-h-11 cursor-pointer items-center gap-2 py-2">
            <input
              type="checkbox"
              name="is_active"
              value="yes"
              defaultChecked={staff.is_active}
              disabled={isSelf}
              className="size-4 rounded border-line"
            />
            <span className="text-sm">
              {staff.is_active ? "Active" : "Deactivated"}
            </span>
          </label>
          {isSelf && <p className="hint mt-1">You cannot deactivate yourself.</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="hint">
          {staff.email}
          {branchName ? ` · ${branchName}` : ""}
          {state?.message && (
            <span
              className={`ml-2 font-medium ${
                state.ok ? "text-ok" : "text-danger"
              }`}
            >
              {state.message}
            </span>
          )}
        </p>
        <button type="submit" disabled={pending} className="btn-ghost py-1.5 text-xs">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}