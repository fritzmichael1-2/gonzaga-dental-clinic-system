import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/** Page heading with optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="hint mt-1">{description}</p>}
      </div>
      {/* `no-print` so action buttons are excluded from a printed chart. */}
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="hint max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Inline warning. Used for the duplicate-record check and slot conflicts. */
export function Callout({
  tone = "warn",
  title,
  children,
}: {
  tone?: "warn" | "danger" | "info";
  title: string;
  children?: ReactNode;
}) {
  const tones = {
    warn: "border-warn/30 bg-warn-tint text-warn",
    danger: "border-danger/30 bg-danger-tint text-danger",
    info: "border-info/30 bg-info-tint text-info",
  } as const;

  return (
    <div className={`rounded-lg border px-4 py-3 ${tones[tone]}`} role="alert">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlert size={16} aria-hidden />
        {title}
      </p>
      {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

/** Label + value pair for read-only detail views. */
export function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="label">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="hint mt-1">{hint}</p>}
    </div>
  );
}