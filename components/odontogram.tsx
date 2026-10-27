"use client";

import { useState } from "react";
import {
  CONDITION_CODES,
  LEGEND_GROUPS,
  FDI_PERMANENT_UPPER,
  FDI_PERMANENT_LOWER,
  FDI_PRIMARY_UPPER,
  FDI_PRIMARY_LOWER,
  ZONE_ORDER,
  getToothType,
  blankToothSurfaces,
  type ConditionCode,
  type Surface,
} from "@/lib/clinical/odontogram";

type ToothState = Record<string, Record<Surface, ConditionCode | null>>;
type Comments = Record<string, string>;

type ExamData = {
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
};

const ZONES = {
  B: "0,0 100,0 70,30 30,30",
  D: "100,0 100,100 70,70 70,30",
  L: "100,100 0,100 30,70 70,70",
  M: "0,100 0,0 30,30 30,70",
  O: "30,30 70,30 70,70 30,70",
};

export default function Odontogram() {
  const [toothState, setToothState] = useState<ToothState>({});
  const [comments, setComments] = useState<Comments>({});
  const [armed, setArmed] = useState<ConditionCode>("D");
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [showPrimary, setShowPrimary] = useState(true);
  
  const [exam, setExam] = useState<ExamData>({
    periodontal_screening: null,
    occlusion_class: null,
    overjet_mm: null,
    overbite: null,
    midline_deviation: false,
    crossbite: false,
    appliances: { braces: false, stayplate: false, other: null },
    tmd: { clenching: false, clicking: false, trismus: false, muscle_spasm: false },
  });

  function markSurface(tooth: string, surface: Surface) {
    setToothState((prev) => {
      const current = prev[tooth] || blankToothSurfaces();
      const updated = { ...current };
      updated[surface] = updated[surface] === armed ? null : armed;
      return { ...prev, [tooth]: updated };
    });
    setSelectedTooth(tooth);
  }

  function clearTooth(tooth: string) {
    if (!confirm(`Remove all markings on Tooth ${tooth}?`)) return;
    setToothState((prev) => {
      const next = { ...prev };
      delete next[tooth];
      return next;
    });
    setComments((prev) => {
      const next = { ...prev };
      delete next[tooth];
      return next;
    });
    if (selectedTooth === tooth) setSelectedTooth(null);
  }

  function clearAll() {
    if (!confirm("Remove ALL markings for this examination? This cannot be undone.")) return;
    setToothState({});
    setComments({});
    setSelectedTooth(null);
  }

  function renderTooth(tooth: string) {
    const surfaces = toothState[tooth] || blankToothSurfaces();
    const hasMarkings = Object.values(surfaces).some((v) => v !== null);
    const isSelected = selectedTooth === tooth;

    return (
      <div key={tooth} className={`flex flex-col items-center gap-1 ${isSelected ? "opacity-100" : ""}`}>
        <svg
          width="44"
          height="44"
          viewBox="0 0 100 100"
          className={`cursor-pointer ${isSelected ? "ring-2 ring-brand rounded-full" : ""}`}
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
                  className="cursor-pointer hover:opacity-80"
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
              <button type="button" onClick={clearAll} className="btn text-sm">
                Clear all
              </button>
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
              Click a code in the legend to arm it, then click tooth segments to mark them. Click again to unmark.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Clinical Assessment</h2>
          </div>
          <div className="panel-body grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Periodontal Screening</label>
              <select
                value={exam.periodontal_screening || ""}
                onChange={(e) => setExam({ ...exam, periodontal_screening: e.target.value || null })}
                className="field"
              >
                <option value="">Select...</option>
                <option>Healthy</option>
                <option>Gingivitis</option>
                <option>Early Periodontitis</option>
                <option>Moderate Periodontitis</option>
                <option>Advanced Periodontitis</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Occlusion Class</label>
              <select
                value={exam.occlusion_class || ""}
                onChange={(e) => setExam({ ...exam, occlusion_class: e.target.value || null })}
                className="field"
              >
                <option value="">Select...</option>
                <option>Class I</option>
                <option>Class II</option>
                <option>Class III</option>
              </select>
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
            <div className="rounded-md bg-brand-tint px-3 py-2 text-sm">
              Armed: <span className="font-semibold">{armed}</span> — {CONDITION_CODES[armed].label}
            </div>
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
                      onClick={() => setArmed(code as ConditionCode)}
                      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                        armed === code ? "border-brand bg-brand-tint" : "border-line"
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
                <textarea
                  value={comments[selectedTooth] || ""}
                  onChange={(e) =>
                    setComments({ ...comments, [selectedTooth]: e.target.value })
                  }
                  placeholder="Comment for this tooth..."
                  className="field mb-2 min-h-[60px] text-sm"
                />
                <button type="button" onClick={() => clearTooth(selectedTooth)} className="btn text-sm text-danger">
                  Clear this tooth
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
