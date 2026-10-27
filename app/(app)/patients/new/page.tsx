import { requireStaff } from "@/lib/security/session";
import { listBranches } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import PatientIntakeForm from "@/components/patient-intake-form";
import { createPatient } from "../actions";

export const metadata = { title: "Register patient" };

export default async function NewPatientPage() {
  const session = await requireStaff();
  const branches = await listBranches();

  return (
    <>
      <PageHeader
        title="Register patient"
        description="The paper intake form, digitised: details, dental and medical history, and the patient's signature on one record."
      />

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
