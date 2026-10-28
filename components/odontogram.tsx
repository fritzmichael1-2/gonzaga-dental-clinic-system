"use client";

import { useState } from "react";
import {
  CONDITION_CODES,
  LEGEND_GROUPS,
  FDI_PERMANENT_UPPER,
  FDI_PERMANENT_LOWER,
  FDI_PRIMARY_UPPER,
  FDI_PRIMARY_LOWER,
  blankToothSurfaces,
  type ConditionCode,
  type Surface,
  type ToothComments,
  type ToothState,
} from "@/lib/clinical/odontogram";

/**
 * The clinical dental chart.
 *
 * Controlled, not self-contained: `chart-tab.tsx` owns the state because the
 * same grid is used to view a saved examination and to draft the next one.
 * Keeping the findings in React state *here* was the original bug — the chart
 * forgot everything on refresh and rendered the same blank sheet for every
 * patient in the clinic.
 */

/** The examination-level fields saved beside the tooth grid. */
export type ChartExamFields = {
  periodontal_screening: string | null;
  occlusion_class: string | null;
  overjet_mm: string | null;
  overbite: string | null;
  midline_deviation: boolean;
  crossbite: boolean;
  appliances: {
    braces: boolean;
    stayplate: boolean;
    other: string | null;
  };
  tmd: {
    clenching: boolean;
    clicking: boolean;
    trismus: boolean;
    muscle_spasm: boolean;
  };
  notes: string | null;
};

export function emptyChartExam(): ChartExamFields {
  return {
    periodontal_screening: null,
    occlusion_class: null,
    overjet_mm: null,
    overbite: null,
    midline_deviation: false,
    crossbite: false,
    appliances: { braces: false, stayplate: false, other: null },
    tmd: {
      clenching: false,
      clicking: false,
      trismus: false,
      muscle_spasm: false,
    },
    notes: null,
  };
}

const ZONES = {
  B: "0,0 100,0 70,30 30,30",
  D: "100,0 100,100 70,70 70,30",
  L: "100,100 0,100 30,70 70,70",
  M: "0,100 0,0 30,30 30,70",
  O: "30,30 70,30 70,70 30,70",
};

const PERIODONTAL_OPTIONS = [
  "Healthy",
  "Gingivitis",
  "Early Periodontitis",
  "Moderate Periodontitis",
  "Advanced Periodontitis",
];

export default function Odontogram({
  toothState,
  onToothStateChange,
  comments,
  onCommentsChange,
  exam,
  onExamChange,
  readOnly = false,
  readOnlyHint,
  treatmentCounts = {},
}: {
  toothState: ToothState;
  onToothStateChange: (next: ToothState) => void;
  comments: ToothComments;
  onCommentsChange: (next: ToothComments) => void;
  exam: ChartExamFields;
  onExamChange: (next: ChartExamFields) => void;
  /** A secretary may read the chart but not alter it. */
  readOnly?: boolean;
  /**
   * Why the grid cannot be edited here. Viewing a saved examination is
   * read-only for everyone, including the dentist, so the secretary wording
   * would be wrong in that case.
   */
  readOnlyHint?: string;
  /** Procedures already recorded per tooth — a read-only overlay. */
  treatmentCounts?: Record<string, number>;
}) {
  const [armed, setArmed] = useState<ConditionCode>("D");
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [showPrimary, setShowPrimary] = useState(true);

  function markSurface(tooth: string, surface: Surface) {
    if (readOnly) return;
    const current = toothState[tooth] ?? blankToothSurfaces();
    const updated = { ...current };
    updated[surface] = updated[surface] === armed ? null : armed;
    onToothStateChange({ ...toothState, [tooth]: updated });
    setSelectedTooth(tooth);
  }

  function clearTooth(tooth: string) {
    if (readOnly) return;
    if (!confirm(`Remove all markings on Tooth ${tooth}?`)) return;
    const nextState = { ...toothState };
    delete nextState[tooth];
    onToothStateChange(nextState);
    const nextComments = { ...comments };
    delete nextComments[tooth];
    onCommentsChange(nextComments);
    if (selectedTooth === tooth) setSelectedTooth(null);
  }

  function clearAll() {
    if (readOnly) return;
    if (!confirm("Remove ALL markings for this examination? This cannot be undone.")) return;
    onToothStateChange({});
    onCommentsChange({});
    setSelectedTooth(null);
  }

  function renderTooth(tooth: string) {
    const surfaces = toothState[tooth] ?? blankToothSurfaces();
    const hasMarkings = Object.values(surfaces).some((v) => v !== null);
    const isSelected = selectedTooth === tooth;
    const treatments = treatmentCounts[tooth] ?? 0;
    const title = treatments
      ? `Tooth ${tooth}: ${treatments} recorded procedure${treatments === 1 ? "" : "s"}`
      : `Tooth ${tooth}: nothing recorded`;

    return (
      <div
        key={tooth}
        className={`flex flex-col items-center gap-1 ${isSelected ? "opacity-100" : ""}`}
      >
        <div className="relative" title={title}>
          <svg
            width="44"
            height="44"
            viewBox="0 0 100 100"
            className={`${readOnly ? "" : "cursor-pointer"} ${isSelected ? "ring-2 ring-brand rounded-full" : ""}`}
            onClick={() => setSelectedTooth(tooth)}
          >
            <defs>
              <clipPath id={`clip-${tooth}`}>
                <circle cx="50" cy="50" r="48" />
              </clipPath>
            </defs>
            <g clipPath={`url(#clip-${tooth})`}>
              {(["B", "D", "L", "M", "O"] as Surface[]).map((surf) => {
                const code = surfaces[surf];
                const color = code ? CONDITION_CODES[code].color : "#ffffff";
                return (
                  <polygon
                    key={surf}
                    points={ZONES[surf]}
                    fill={color}
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                    aria-label={`Tooth ${tooth} ${surf}${code ? ` ${code}` : ""}`}
                    className={readOnly ? "" : "cursor-pointer hover:opacity-80"}
                    onClick={(e) => {
                      e.stopPropagation();
                      markSurface(tooth, surf);
                    }}
                  />
                );
              })}
            </g>
            <circle cx="50" cy="50" r="48" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
          </svg>
          {/*
           * Treatments already recorded live in `treatment_records`, not in
           * findings, so they are marked with a corner dot rather than a
           * fill — filling a zone would claim a diagnosis nobody charted.
           */}
          {treatments > 0 && (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white"
            >
              {treatments}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelectedTooth(tooth)}
          className={`text-xs font-medium ${isSelected ? "text-brand font-bold" : "text-muted"} ${hasMarkings ? "underline" : ""}`}
        >
          {tooth}
        </button>
      </div>
    );
  }

  function renderArch(label: string, teeth: number[]) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <div className="flex flex-wrap gap-1 justify-center">
          {teeth.map((t) => renderTooth(t.toString()))}
        </div>
      </div>
    );
  }

  const selectedSurfaces = selectedTooth ? toothState[selectedTooth] : null;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2 flex flex-col gap-5">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Intraoral Tooth Charting (FDI)</h2>
            <div className="no-print flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showPrimary}
                  onChange={(e) => setShowPrimary(e.target.checked)}
                  className="rounded border-line"
                />
                Show temporary teeth
              </label>
              {!readOnly && (
                <button type="button" onClick={clearAll} className="btn text-sm">
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="panel-body flex flex-col gap-4">
            {showPrimary && (
              <>
                {renderArch("Upper (temporary)", FDI_PRIMARY_UPPER)}
                {renderArch("Lower (temporary)", FDI_PRIMARY_LOWER)}
              </>
            )}
            {renderArch("Upper (permanent)", FDI_PERMANENT_UPPER)}
            {renderArch("Lower (permanent)", FDI_PERMANENT_LOWER)}
            <p className="text-xs text-muted">
              {readOnly
                ? readOnlyHint ??
                  "This chart is read-only for your role. Teeth with a numbered badge already have treatments recorded."
                : "Click a code in the legend to arm it, then click tooth segments to mark them. Click again to unmark. A numbered badge marks a tooth that already has treatments recorded."}
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Clinical Assessment</h2>
          </div>
          <div className="panel-body grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="periodontal_screening">
                Periodontal Screening
              </label>
              <select
                id="periodontal_screening"
                value={exam.periodontal_screening ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  onExamChange({
                    ...exam,
                    periodontal_screening: e.target.value || null,
                  })
                }
                className="field"
              >
                <option value="">Select...</option>
                {PERIODONTAL_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="occlusion_class">
                Occlusion Class
              </label>
              <select
                id="occlusion_class"
                value={exam.occlusion_class ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  onExamChange({
                    ...exam,
                    occlusion_class: e.target.value || null,
                  })
                }
                className="field"
              >
                <option value="">Select...</option>
                <option>Class I</option>
                <option>Class II</option>
                <option>Class III</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="overjet_mm">
                  Overjet (mm)
                </label>
                <input
                  id="overjet_mm"
                  value={exam.overjet_mm ?? ""}
                  disabled={readOnly}
                  inputMode="decimal"
                  onChange={(e) =>
                    onExamChange({ ...exam, overjet_mm: e.target.value || null })
                  }
                  className="field"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="overbite">
                  Overbite
                </label>
                <input
                  id="overbite"
                  value={exam.overbite ?? ""}
                  disabled={readOnly}
                  onChange={(e) =>
                    onExamChange({ ...exam, overbite: e.target.value || null })
                  }
                  className="field"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Occlusal findings</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exam.midline_deviation}
                  disabled={readOnly}
                  onChange={(e) =>
                    onExamChange({ ...exam, midline_deviation: e.target.checked })
                  }
                  className="rounded border-line"
                />
                Midline deviation
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exam.crossbite}
                  disabled={readOnly}
                  onChange={(e) =>
                    onExamChange({ ...exam, crossbite: e.target.checked })
                  }
                  className="rounded border-line"
                />
                Crossbite
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Appliances</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exam.appliances.braces}
                  disabled={readOnly}
                  onChange={(e) =>
                    onExamChange({
                      ...exam,
                      appliances: { ...exam.appliances, braces: e.target.checked },
                    })
                  }
                  className="rounded border-line"
                />
                Braces
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exam.appliances.stayplate}
                  disabled={readOnly}
                  onChange={(e) =>
                    onExamChange({
                      ...exam,
                      appliances: {
                        ...exam.appliances,
                        stayplate: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-line"
                />
                Stayplate
              </label>
              <input
                aria-label="Other appliance"
                value={exam.appliances.other ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  onExamChange({
                    ...exam,
                    appliances: {
                      ...exam.appliances,
                      other: e.target.value || null,
                    },
                  })
                }
                placeholder="Other appliance..."
                className="field text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Temporomandibular joint</p>
              {(
                [
                  ["clenching", "Clenching"],
                  ["clicking", "Clicking"],
                  ["trismus", "Trismus"],
                  ["muscle_spasm", "Muscle spasm"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exam.tmd[key]}
                    disabled={readOnly}
                    onChange={(e) =>
                      onExamChange({
                        ...exam,
                        tmd: { ...exam.tmd, [key]: e.target.checked },
                      })
                    }
                    className="rounded border-line"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="chart_notes">
                Examination notes
              </label>
              <textarea
                id="chart_notes"
                value={exam.notes ?? ""}
                readOnly={readOnly}
                rows={2}
                onChange={(e) =>
                  onExamChange({ ...exam, notes: e.target.value || null })
                }
                className="field"
              />
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-5">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Diagnostic Legend</h2>
          </div>
          <div className="panel-body flex flex-col gap-4">
            {readOnly ? (
              <div className="rounded-md bg-brand-tint px-3 py-2 text-sm">
                Read-only examination record.
              </div>
            ) : (
              <div className="rounded-md bg-brand-tint px-3 py-2 text-sm">
                Armed: <span className="font-semibold">{armed}</span> —{" "}
                {CONDITION_CODES[armed].label}
              </div>
            )}
            {(Object.keys(LEGEND_GROUPS) as Array<keyof typeof LEGEND_GROUPS>).map((cat) => (
              <div key={cat} className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {cat === "condition" ? "Condition" : cat === "restoration" ? "Restoration" : "Surgery"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {LEGEND_GROUPS[cat].map((code) => (
                    <button
                      key={code}
                      type="button"
                      disabled={readOnly}
                      onClick={() => setArmed(code as ConditionCode)}
                      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                        armed === code && !readOnly ? "border-brand bg-brand-tint" : "border-line"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: CONDITION_CODES[code as ConditionCode].color }}
                      />
                      <span className="font-medium">{code}</span>
                      <span className="text-muted">{CONDITION_CODES[code as ConditionCode].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {selectedTooth && (
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-sm font-medium">Tooth {selectedTooth}</p>
                {selectedSurfaces && (
                  <p className="mb-2 text-xs text-muted">
                    {(["B", "M", "O", "D", "L"] as Surface[])
                      .filter((s) => selectedSurfaces[s])
                      .map((s) => `${s} ${CONDITION_CODES[selectedSurfaces[s]!].label}`)
                      .join(" · ") || "No markings"}
                  </p>
                )}
                <textarea
                  value={comments[selectedTooth] ?? ""}
                  readOnly={readOnly}
                  onChange={(e) =>
                    onCommentsChange({ ...comments, [selectedTooth]: e.target.value })
                  }
                  placeholder="Comment for this tooth..."
                  className="field mb-2 min-h-[60px] text-sm"
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => clearTooth(selectedTooth)}
                    className="btn text-sm text-danger"
                  >
                    Clear this tooth
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
