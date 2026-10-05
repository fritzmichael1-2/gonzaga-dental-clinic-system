/**
 * FDI dental notation helpers.
 *
 * FDI uses two digits: quadrant + tooth within the quadrant.
 *   1x adult upper right   11-18 (18 = wisdom)
 *   2x adult upper left    21-28
 *   3x adult lower left    31-38
 *   4x adult lower right   41-48
 *   5x-8x primary (baby)   51-85
 * Second character A-E for primary teeth.
 */

export type ToothQuadrant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const PERMANENT_QUADRANTS: ToothQuadrant[] = [1, 2, 3, 4];
export const PRIMARY_QUADRANTS: ToothQuadrant[] = [5, 6, 7, 8];

export const QUADRANT_LABEL: Record<ToothQuadrant, string> = {
  1: "Upper right",
  2: "Upper left",
  3: "Lower left",
  4: "Lower right",
  5: "Upper right (primary)",
  6: "Upper left (primary)",
  7: "Lower left (primary)",
  8: "Lower right (primary)",
};

/** Mesial, Distal, Buccal, Lingual/Palatal, Occlusal. */
export const SURFACES = ["M", "D", "B", "L", "O"] as const;
export const SURFACE_LABEL: Record<string, string> = {
  M: "Mesial",
  D: "Distal",
  B: "Buccal",
  L: "Lingual / Palatal",
  O: "Occlusal",
  I: "Incisal",
};

export function isValidTooth(code: string): boolean {
  return /^(?:[1-8][1-8]|[1-8][A-E])(?:-(?:[1-8][1-8]|[1-8][A-E]))?$/.test(
    code.toUpperCase()
  );
}

/** Human label for a tooth code or range, e.g. "21" -> "Upper left central incisor". */
const TOOTH_NAMES: Record<string, string> = {
  "1": "central incisor",
  "2": "lateral incisor",
  "3": "canine",
  "4": "1st premolar",
  "5": "2nd premolar",
  "6": "1st molar",
  "7": "2nd molar",
  "8": "3rd molar (wisdom)",
  "A": "central incisor",
  "B": "lateral incisor",
  "C": "canine",
  "D": "1st molar",
  "E": "2nd molar",
};

export function toothLabel(code: string | null | undefined): string {
  if (!code) return "Not specified";
  // A range such as 11-18 has no single position, so only flag it as a range.
  if (code.includes("-")) return `${code} (range)`;

  const quad = Number(code[0]) as ToothQuadrant;
  const pos = code[1];
  const name = TOOTH_NAMES[pos];
  if (!(quad in QUADRANT_LABEL) || !name) return code;
  return `${code} · ${QUADRANT_LABEL[quad]} ${name}`;
}

/**
 * Teeth in FDI display order, i.e. as the chart reads in the dental chair:
 * upper arch left-to-right from the patient's right, then the lower arch.
 *
 * Permanent: 18..11 21..28 / 48..41 31..38
 * Primary:    55..51 61..65 / 85..81 71..75
 */
export function chartOrder(includePrimary = false): string[] {
  const arch = (first: number, last: number, reverse: boolean) => {
    const out: string[] = [];
    const positions = reverse
      ? ["8", "7", "6", "5", "4", "3", "2", "1"]
      : ["1", "2", "3", "4", "5", "6", "7", "8"];
    for (let q = first; q <= last; q++) {
      for (const p of positions) out.push(`${q}${p}`);
    }
    return out;
  };

  if (!includePrimary) {
    return [...arch(1, 2, true), ...arch(4, 3, false)];
  }

  const primaryArch = (first: number, last: number, reverse: boolean) => {
    const out: string[] = [];
    const positions = reverse
      ? ["E", "D", "C", "B", "A"]
      : ["A", "B", "C", "D", "E"];
    for (let q = first; q <= last; q++) {
      for (const p of positions) out.push(`${q}${p}`);
    }
    return out;
  };

  return [
    ...primaryArch(5, 6, true),
    ...primaryArch(8, 7, false),
    ...arch(1, 2, true),
    ...arch(4, 3, false),
  ];
}

/**
 * Aggregate per-tooth treatment counts for the chart view.
 * Accepts treatment rows and returns code -> count of recorded procedures.
 */
export function countByTooth(
  rows: { tooth_fdi: string | null }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.tooth_fdi) continue;
    for (const part of r.tooth_fdi.split("-")) {
      out[part] = (out[part] ?? 0) + 1;
    }
  }
  return out;
}