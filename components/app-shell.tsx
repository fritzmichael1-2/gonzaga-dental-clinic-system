import Link from "next/link";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  DatabaseBackup,
  LayoutDashboard,
  ScrollText,
  Toothbrush,
  UserCog,
  Users,
} from "lucide-react";
import { requireStaff, type Session } from "@/lib/security/session";
import type { StaffRole } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/utils";
import SignOutButton from "@/components/sign-out-button";
import PreviewBanner from "@/components/preview-banner";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Absent means every role. Present means an allow-list. */
  roles?: StaffRole[];
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} aria-hidden /> },
  { href: "/branches", label: "Both branches", icon: <Building2 size={17} aria-hidden />, roles: ["dentist", "admin"] },
  { href: "/patients", label: "Patients", icon: <Users size={17} aria-hidden /> },
  { href: "/appointments", label: "Appointments", icon: <CalendarDays size={17} aria-hidden /> },
  { href: "/staff", label: "Staff", icon: <UserCog size={17} aria-hidden />, roles: ["admin"] },
  { href: "/backups", label: "Backups", icon: <DatabaseBackup size={17} aria-hidden />, roles: ["admin"] },
  { href: "/audit-log", label: "Audit log", icon: <ScrollText size={17} aria-hidden />, roles: ["admin"] },
];

/**
 * Authenticated shell: sidebar + header. Every page under app/(app) inherits
 * this, so the staff check runs once per navigation.
 */
export default async function AppShell({ children }: { children: ReactNode }) {
  const session = await requireStaff();
  const items = NAV.filter((n) => !n.roles || n.roles.includes(session.role));

  return (
    <div className="flex min-h-screen flex-col">
      <PreviewBanner />
      <div className="flex flex-1">
      <aside className="no-print hidden w-60 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
        <Brand />
        <nav className="flex-1 p-3">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} icon={item.icon} label={item.label} />
              </li>
            ))}
          </ul>
        </nav>
        <BranchFooter session={session} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print border-b border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <p className="hidden text-xs text-muted lg:block">
              Access is logged. Handle patient information per clinic policy.
            </p>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm font-medium sm:inline">
                {session.fullName}
              </span>
              <SignOutButton />
            </div>
          </div>
          {/* Horizontal nav on narrow screens; the sidebar is hidden below lg. */}
          <nav className="overflow-x-auto border-t border-line px-3 py-2 lg:hidden">
            <ul className="flex gap-1">
              {items.map((item) => (
                <li key={item.href} className="shrink-0">
                  <NavLink
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    compact
                  />
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main className="flex-1 p-5 lg:p-6">{children}</main>
      </div>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={`flex items-center gap-2 border-line ${
        compact ? "min-h-11 px-3" : "border-b px-5 py-4"
      }`}
    >
      <Toothbrush size={compact ? 18 : 20} className="text-brand" aria-hidden />
      <span className="text-sm font-semibold">
        {compact ? "GDCMAS" : "Gonzaga Dental Clinic"}
      </span>
    </Link>
  );
}

function NavLink({
  href,
  icon,
  label,
  compact = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink ${
        compact ? "min-h-11 px-2.5 py-2 text-xs" : "px-3 py-2 text-sm"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

/**
 * The secretary works at one branch but records are clinic-wide, so this is
 * labelled "your branch" to keep that distinction obvious in the UI.
 */
async function BranchFooter({ session }: { session: Session }) {
  const supabase = await createSupabaseServerClient();
  const { data: branch } = session.branchId
    ? await supabase
        .from("branches")
        .select("name")
        .eq("id", session.branchId)
        .maybeSingle()
    : { data: null };

  return (
    <div className="border-t border-line p-4 text-xs">
      <p className="font-semibold text-ink">{session.fullName}</p>
      <p className="hint">{ROLE_LABEL[session.role]}</p>
      {branch ? (
        <p className="hint mt-1">Your branch: {branch.name}</p>
      ) : session.role === "secretary" ? (
        <p className="mt-1 text-warn">
          No branch assigned — branch records are hidden until an
          administrator assigns you.
        </p>
      ) : null}
      <p className="hint mt-1">
        {/* With no branch assigned there is no "own branch", so claiming so
            would contradict the warning directly above it. */}
        {session.role !== "secretary"
          ? "You can see records for both branches."
          : session.branchId
            ? "You see records for your own branch only."
            : "Nothing is visible to you until a branch is assigned."}
      </p>
    </div>
  );
}