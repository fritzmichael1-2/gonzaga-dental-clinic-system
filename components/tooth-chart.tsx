"use client";

/**
 * FDI dental chart. A visual replacement for the handwritten index card: it
 * shows at a glance which teeth have been treated, so the dentist does not have
 * to read back through a list before working.
 *
 * Two modes:
 *   - read-only (patient record): teeth that have procedures are shaded.
 *   - picker (treatment form): every tooth is a button. A dentist identifies a
 *     tooth by where it sits, not by its two-digit number, so asking them to
 *     type "16" is the slowest possible way to record it.
 *
 * The chart stays a controlled component in picker mode: the selected set is
 * derived from a plain string that the text field also writes to, so tapping a
 * tooth and typing a code are two views of one value and cannot disagree.
 */

type ToothCellProps = {
  n: number;
  count: number;
  selected: boolean;
  interactive: boolean;
  onToggle?: (code: string) => void;
};

function ToothCell({ n, count, selected, interactive, onToggle }: ToothCellProps) {
  const code = String(n);
  const treated = count > 0;
  const title = treated
    ? `Tooth ${code}: ${count} recorded procedure${count === 1 ? "" : "s"}`
    : `Tooth ${code}: nothing recorded`;

  // Selected is deliberately the loudest state: it is what the dentist just
  // chose, and it has to be unmistakable against the "already treated" shading.
  const tone = selected
    ? "border-brand bg-brand text-white"
    : treated
      ? "border-brand/40 bg-brand-tint text-brand-dark"
      : "border-line bg-surface text-muted";

  const className =
    `flex h-11 w-11 flex-col items-center justify-center rounded border text-xs leading-none font-semibold sm:h-9 sm:w-8 sm:text-[11px] ${tone}` +
    // The read-only chart is not interactive, so it must not advertise a target.
    (interactive ? " cursor-pointer transition hover:border-brand" : "");

  const body = (
    <>
      <span>{code}</span>
      {treated && (
        <span className={`text-[9px] font-normal ${selected ? "text-white/80" : ""}`}>
          {count}
        </span>
      )}
    </>
  );

  if (!interactive) {
    return (
      <div className={className} title={title}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-pressed={selected}
      aria-label={`Tooth ${code}${treated ? `, ${count} recorded` : ""}`}
      onClick={() => onToggle?.(code)}
    >
      {body}
    </button>
  );
}

function Arch({
  label,
  teeth,
  counts,
  selected,
  interactive,
  onToggle,
}: {
  label: string;
  teeth: number[];
  counts: Record<string, number>;
  selected: Set<string>;
  interactive: boolean;
  onToggle?: (code: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-1">
        {teeth.map((n) => (
          <ToothCell
            key={n}
            n={n}
            count={counts[String(n)] ?? 0}
            selected={selected.has(String(n))}
            interactive={interactive}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export default function ToothChart({
  counts,
  primary = false,
  selected,
  onToggle,
}: {
  counts: Record<string, number>;
  primary?: boolean;
  /** Selected FDI codes. Only meaningful when `onToggle` is supplied. */
  selected?: Iterable<string>;
  /** Supply to turn the chart into a picker. */
  onToggle?: (code: string) => void;
}) {
  const interactive = typeof onToggle === "function";
  const selectedSet = new Set(selected ?? []);

  return (
    <div className="flex flex-col gap-3">
      {primary && (
        <>
          <Arch label="Upper (primary)" teeth={PRIMARY_UPPER} counts={counts} selected={selectedSet} interactive={interactive} onToggle={onToggle} />
          <Arch label="Lower (primary)" teeth={PRIMARY_LOWER} counts={counts} selected={selectedSet} interactive={interactive} onToggle={onToggle} />
        </>
      )}
      <Arch label="Upper (permanent)" teeth={PERMANENT_UPPER} counts={counts} selected={selectedSet} interactive={interactive} onToggle={onToggle} />
      <Arch label="Lower (permanent)" teeth={PERMANENT_LOWER} counts={counts} selected={selectedSet} interactive={interactive} onToggle={onToggle} />
      <p className="hint">
        {interactive ? (
          <>
            Tap a tooth to select it; tap again to remove it. Use the box below
            for a range such as 11-18 or a tooth not shown.
          </>
        ) : (
          <>
            Shaded teeth have at least one recorded procedure. The number inside
            is the procedure count.
          </>
        )}
      </p>
    </div>
  );
}
