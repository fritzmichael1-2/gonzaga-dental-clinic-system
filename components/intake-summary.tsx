import { EmptyState } from "@/components/ui";
import type { PatientIntake } from "@/lib/types";
import { formatDateOnly } from "@/lib/utils";

/** Questions 1-7, in the order the paper form asks them. */
const SCREENING_LABELS: Record<string, string> = {
  q1: "Are you in good health?",
  q2: "Under medical treatment now?",
  q3: "Serious illness or surgical operation?",
  q4: "Ever been hospitalized?",
  q5: "Taking drugs / non-prescription medication?",
  q6: "Uses tobacco products?",
  q7: "Uses alcohol or other dangerous drugs?",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="text-sm break-words text-ink">{value || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

function Answer({ value }: { value: "yes" | "no" | null | undefined }) {
  if (!value) return <span className="text-muted">not asked</span>;
  return (
    <span className={value === "yes" ? "font-semibold text-warn" : "text-ink"}>
      {value === "yes" ? "Yes" : "No"}
    </span>
  );
}

/**
 * The stored intake form, read-only. Shown on the patient record so the answers
 * are not write-only, and printed as the patient's copy — the replacement for
 * the index card they used to photograph.
 */
export default function IntakeSummary({
  intake,
  patientName,
}: {
  intake: PatientIntake | null;
  patientName: string;
}) {
  if (!intake) {
    return (
      <EmptyState
        title="Intake form not captured"
        description={`${patientName} was registered before the digital intake form existed, or the answers were not saved. Re-register the details from the front desk.`}
      />
    );
  }

  const hasWomen =
    intake.women_only &&
    (intake.women_only.pregnant ||
      intake.women_only.nursing ||
      intake.women_only.pills);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Patient information record</h2>
        </div>
        <div className="panel-body grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Religion" value={intake.religion} />
          <Row label="Nationality" value={intake.nationality} />
          <Row label="Birthplace" value={intake.birthplace} />
          <Row label="Occupation" value={intake.occupation} />
          <Row label="Home no." value={intake.home_no} />
          <Row label="Office no." value={intake.office_no} />
          <Row label="Fax no." value={intake.fax_no} />
          <Row label="Dental insurance" value={intake.dental_insurance} />
          <Row
            label="Insurance effective"
            value={
              intake.insurance_effective
                ? formatDateOnly(intake.insurance_effective)
                : null
            }
          />
          <Row label="Guardian" value={intake.guardian_name} />
          <Row label="Guardian occupation" value={intake.guardian_occupation} />
          <Row label="Guardian email" value={intake.guardian_email} />
          <Row label="Referred by" value={intake.referred_by} />
          <Row label="Reason for consultation" value={intake.consultation_reason} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Dental history</h2>
        </div>
        <div className="panel-body grid gap-4 sm:grid-cols-3">
          <Row label="Previous dentist" value={intake.previous_dentist} />
          <Row label="Previous dentist office" value={intake.previous_dentist_office} />
          <Row
            label="Last dental visit"
            value={
              intake.last_dental_visit
                ? formatDateOnly(intake.last_dental_visit)
                : null
            }
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Medical history</h2>
        </div>
        <div className="panel-body flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Row label="Physician" value={intake.physician?.name} />
            <Row label="Specialty" value={intake.physician?.specialty} />
            <Row label="Physician office" value={intake.physician?.office} />
            <Row label="Physician phone" value={intake.physician?.phone} />
          </div>

          <div>
            <h3 className="label mb-2">Screening questions</h3>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Question</th>
                    <th scope="col">Answer</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(SCREENING_LABELS).map(([key, label]) => {
                    const a = intake.screening?.[key];
                    return (
                      <tr key={key}>
                        <td className="whitespace-nowrap">{key.replace("q", "")}</td>
                        <td>{label}</td>
                        <td>
                          <Answer value={a?.answer} />
                        </td>
                        <td>{a?.detail || <span className="text-muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Row
              label="Allergies"
              value={
                intake.allergies.length || intake.allergy_other ? (
                  <span className="font-semibold text-warn">
                    {[...intake.allergies, intake.allergy_other]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                ) : (
                  "None reported"
                )
              }
            />
            <Row
              label="Bleeding problems"
              value={
                <>
                  <Answer value={intake.bleeding_problems} />
                  {intake.bleeding_time ? ` — ${intake.bleeding_time}` : ""}
                </>
              }
            />
            <Row label="Blood type" value={intake.blood_type} />
            <Row label="Blood pressure" value={intake.blood_pressure} />
          </div>

          {hasWomen && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Row
                label="Pregnant"
                value={<Answer value={intake.women_only.pregnant} />}
              />
              <Row
                label="Nursing"
                value={<Answer value={intake.women_only.nursing} />}
              />
              <Row
                label="Birth control pills"
                value={<Answer value={intake.women_only.pills} />}
              />
            </div>
          )}

          <div>
            <h3 className="label mb-2">Conditions reported</h3>
            {intake.conditions.length || intake.condition_other ? (
              <div className="flex flex-wrap gap-2">
                {intake.conditions.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-semibold text-ink"
                  >
                    {c}
                  </span>
                ))}
                {intake.condition_other && (
                  <span className="rounded-full border border-warn/40 bg-warn-tint px-3 py-1 text-xs font-semibold text-warn">
                    {intake.condition_other}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">None reported.</p>
            )}
          </div>

          {intake.notes && <Row label="Notes for the dentist" value={intake.notes} />}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Signature</h2>
        </div>
        <div className="panel-body flex flex-wrap items-end gap-6">
          {intake.signature_png ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={intake.signature_png}
                alt={`Signature of ${patientName}`}
                className="h-24 w-auto rounded border border-line bg-white"
              />
              <p className="label mt-2">Patient / guardian signature</p>
            </div>
          ) : (
            <p className="text-sm text-warn">
              No signature on file — the patient must sign before treatment.
            </p>
          )}
          <div className="flex flex-col gap-1 text-sm">
            <span className="label">Signed</span>
            <span>
              {intake.signed_at
                ? formatDateOnly(intake.signed_at)
                : "not signed"}
            </span>
            <span className="label mt-2">Encoded by</span>
            <span>{intake.filled_by ? "front desk" : "—"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
