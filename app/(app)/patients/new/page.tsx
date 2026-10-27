import { requireStaff } from "@/lib/security/session";
import { listBranches } from "@/lib/queries";
import { Callout, PageHeader } from "@/components/ui";
import PatientIntakeForm from "@/components/patient-intake-form";
import { createPatient } from "../actions";

export const metadata = { title: "Register patient" };

export default async function NewPatientPage() {
  const session = await requireStaff();
  const allBranches = await listBranches();

  // Mirrors is_clinic_wide() in supabase/schema.sql: a secretary is scoped to
  // their own branch, so offering the other branches would only produce an RLS
  // rejection after the whole form had been filled in.
  const branches =
    session.role === "secretary"
      ? allBranches.filter((b) => b.id === session.branchId)
      : allBranches;

  const unassigned = session.role === "secretary" && !session.branchId;

  return (
    <>
      <PageHeader
        title="Register patient"
        description="The paper intake form, digitised: details, dental and medical history, and the patient's signature on one record."
      />

      {unassigned && (
        <div className="mb-4">
          <Callout tone="warn" title="No branch assigned">
            This account has no branch assigned, so a patient record cannot be
            created yet. An admin needs to assign a branch under{" "}
            <strong>Staff</strong> first.
          </Callout>
        </div>
      )}

      <div className="mb-5">
        <PatientIntakeForm
          action={createPatient}
          branches={branches}
          defaultBranchId={session.branchId}
        />
      </div>

      <p className="hint">
        TODO(CLINIC): required fields, consent wording, and retention practices
        are still to be confirmed with the clinic.
      </p>
    </>
  );
}
