/**
 * Odontogram helpers for the clinical dental chart.
 * Different from tooth-chart.tsx which is just a tooth picker for treatments.
 * This is the full clinical chart with surfaces, conditions, and diagnostics.
 */

export const FDI_PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const FDI_PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const FDI_PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const FDI_PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export const ZONE_ORDER = ["B", "M", "O", "D", "L"] as const;
export type Surface = typeof ZONE_ORDER[number];

export const SURFACES: Record<Surface, string> = {
  B: "Buccal",
  M: "Mesial",
  O: "Occlusal",
  D: "Distal",
  L: "Lingual",
};

export const CONDITION_CODES = {
  D: { label: "Decayed", cat: "condition", color: "#dc2626" },
  M: { label: "Missing (caries)", cat: "condition", color: "#6b7280" },
  F: { label: "Filled", cat: "condition", color: "#2563eb" },
  I: { label: "Indicated for Extr.", cat: "condition", color: "#991b1b" },
  RF: { label: "Root Fragment", cat: "condition", color: "#b45309" },
  MO: { label: "Missing (other)", cat: "condition", color: "#9ca3af" },
  Im: { label: "Impacted", cat: "condition", color: "#7c3aed" },

  J: { label: "Jacket Crown", cat: "restoration", color: "#ca8a04" },
  A: { label: "Amalgam Filling", cat: "restoration", color: "#475569" },
  AB: { label: "Abutment", cat: "restoration", color: "#0d9488" },
  P: { label: "Pontic", cat: "restoration", color: "#0891b2" },
  In: { label: "Inlay", cat: "restoration", color: "#4f46e5" },
  Fx: { label: "Fixed Cure Composite", cat: "restoration", color: "#0284c7" },
  S: { label: "Sealants", cat: "restoration", color: "#16a34a" },
  Rm: { label: "Removable Denture", cat: "restoration", color: "#ea580c" },

  X: { label: "Extraction (caries)", cat: "surgery", color: "#7f1d1d" },
  XO: { label: "Extraction (other)", cat: "surgery", color: "#78350f" },
  Cm: { label: "Congenitally Missing", cat: "surgery", color: "#a1a1aa" },
  Sp: { label: "Supernumerary", cat: "surgery", color: "#db2777" },
} as const;

export const LEGEND_GROUPS = {
  condition: ["D", "M", "F", "I", "RF", "MO", "Im"],
  restoration: ["J", "A", "AB", "P", "In", "Fx", "S", "Rm"],
  surgery: ["X", "XO", "Cm", "Sp"],
} as const;

export type ConditionCode = keyof typeof CONDITION_CODES;

export function getToothType(fdi: string | number): "primary" | "permanent" {
  const n = Number(fdi);
  return n >= 51 && n <= 85 ? "primary" : "permanent";
}

export function blankToothSurfaces(): Record<Surface, ConditionCode | null> {
  return { B: null, M: null, O: null, D: null, L: null };
}
