import { requireStaff } from "@/lib/security/session";
import { listBranches } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import PatientForm from "@/components/patient-form";
import { createPatient } from "../actions";

export const metadata = { title: "Register patient" };

export default async function NewPatientPage() {
  const session = await requireStaff();
  const branches = await listBranches();

  return (
    <>
      <PageHeader
        title="Register patient"
        description="Completes the intake step: details, medical history, and consent are stored against one record."
      />

      <div className="mb-5">
        <PatientForm
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