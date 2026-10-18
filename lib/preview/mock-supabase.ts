/**
 * ============================================================================
 * PREVIEW MODE — THROW AWAY BEFORE SHIPPING
 * ============================================================================
 *
 * A read-only, in-memory stand-in for the Supabase query builder so the UI can
 * be reviewed without a database. It implements just enough of the PostgREST
 * chain (select/eq/gte/lte/order/limit/or/ilike/maybeSingle/single) to satisfy
 * this app's queries.
 *
 * What it deliberately does NOT do:
 *   - honour RLS, roles, or auth (getSession() short-circuits separately)
 *   - enforce the booking exclusion constraints
 *   - persist anything; writes return an error rather than pretending to work
 *
 * Never enable GDCMAS_PREVIEW against a real Supabase project.
 */

import { previewTables } from "./fixtures";

export function isPreviewMode(): boolean {
  return process.env.GDCMAS_PREVIEW === "1";
}

type Row = Record<string, unknown>;

type Filter = (row: Row) => boolean;
type Sorter = (a: Row, b: Row) => number;

const PREVIEW_ERROR =
  "Preview mode is read-only. Configure Supabase to make changes.";

/** Resolve `a.b.c` against a row, following embedded relations. */
function resolvePath(row: Row, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function asComparable(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  return String(v);
}

/** Compare two column values the way Postgres would for ORDER BY. */
function cmp(a: unknown, b: unknown): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an && bn) return 0;
  // Postgres defaults NULLS LAST for ASC.
  if (an) return 1;
  if (bn) return -1;
  const av = asComparable(a);
  const bv = asComparable(b);
  if (av === bv) return 0;
  return av! < bv! ? -1 : 1;
}

/**
 * Embed alias -> { foreign key column, target table }.
 *
 * PostgREST infers these from actual foreign keys. The preview mock has no
 * schema, so they are declared here. Getting them wrong is not cosmetic: a
 * mis-resolved embed silently renders an empty name in the UI, which is exactly
 * the kind of defect a screenshot would hide.
 */
const EMBEDS: Record<string, Record<string, { fk: string; target: string }>> = {
  appointments: {
    patients: { fk: "patient_id", target: "patients" },
    branches: { fk: "branch_id", target: "branches" },
    staff: { fk: "dentist_id", target: "staff" },
  },
  treatment_records: {
    patients: { fk: "patient_id", target: "patients" },
    branches: { fk: "branch_id", target: "branches" },
    staff: { fk: "performed_by", target: "staff" },
  },
  patients: { branches: { fk: "branch_id", target: "branches" } },
  staff: { branches: { fk: "branch_id", target: "branches" } },
  backup_logs: { staff: { fk: "performed_by", target: "staff" } },
  audit_logs: { staff: { fk: "actor_id", target: "staff" } },
};

/**
 * Materialise embedded relations declared in a `select()` string, e.g.
 * `patients ( first_name, last_name )`. Always returns an array because this
 * app types every embed as T[] | null.
 */
function attachEmbeds(row: Row, table: string, select: string): Row {
  const out: Row = { ...row };
  const map = EMBEDS[table] ?? {};
  const re = /([a-z_]+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select)) !== null) {
    const alias = m[1];
    const cols = m[2]
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const spec = map[alias];
    // Unknown alias: fall back to a same-named column, else leave it absent so
    // the "—" placeholder shows rather than a wrong value.
    const fk = spec?.fk ?? alias;
    const target = spec?.target;

    const fkValue = row[fk];
    if (fkValue === null || fkValue === undefined) {
      out[alias] = null;
      continue;
    }
    const linked = target ? previewTables[target] : undefined;
    const match = linked?.find((r) => r.id === fkValue);
    if (!match) {
      out[alias] = null;
      continue;
    }
    out[alias] = [
      cols.length
        ? Object.fromEntries(cols.map((c) => [c, match[c] ?? null]))
        : match,
    ];
  }
  return out;
}

/**
 * Restrict a row to the columns named in a `select()` string.
 *
 * `*` means "every real column". PostgREST combines it with explicit embeds, so
 * `select("*, staff ( full_name )")` returns the whole row plus the embed — it
 * must not be reduced to just the embed, which is how `r.id` once went missing
 * and React reported a keyless list.
 */
function project(row: Row, select: string): Row {
  const parts = select
    .split("\n")
    .join(" ")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const names = parts.map((c) => c.split("(")[0].trim());
  const wantsAll = names.includes("*");
  const explicit = names.filter((c) => c && c !== "*");

  if (wantsAll) {
    const out: Row = { ...row };
    for (const n of explicit) if (n in row) out[n] = row[n] ?? null;
    return out;
  }
  if (!explicit.length) return row;
  const out: Row = {};
  for (const n of explicit) out[n] = row[n] ?? null;
  return out;
}

type PreviewResult = { data: unknown; error: null; count: number | null };

/**
 * Tables the database scopes by branch, mirroring the RLS policies in
 * `supabase/schema.sql`.
 */
const BRANCH_SCOPED = new Set([
  "patients",
  "appointments",
  "treatment_records",
  "consent_records",
]);

const MAIN_BRANCH = "b0000000-0000-4000-8000-000000000001";

/**
 * Apply the branch scoping a secretary really has.
 *
 * Without this the mock handed a "secretary" persona every row in the clinic
 * while the sidebar insisted they only see their own branch — the preview then
 * demonstrated the opposite of the security model it exists to review. Mirrors
 * `can_access_branch()` plus the `can_access_patient()` exception: a patient is
 * reachable if the record sits in their branch OR they have an appointment in
 * it, which is what lets a secretary check in a visitor registered elsewhere.
 */
function scopeToBranch(table: string, rows: Row[]): Row[] {
  if (!BRANCH_SCOPED.has(table)) return rows;

  // Only a secretary is branch-restricted. Admin and dentist are both
  // clinic-wide via `is_clinic_wide()`. An earlier `role !== "admin" &&`
  // guard let admin through into the filter below and silently reduced the
  // admin preview to one branch.
  if (process.env.GDCMAS_PREVIEW_ROLE !== "secretary") return rows;

  // An unassigned secretary is granted no branch access, not all of it.
  const branchId =
    process.env.GDCMAS_PREVIEW_UNASSIGNED === "1" ? null : MAIN_BRANCH;
  if (!branchId) return [];

  if (table === "patients") {
    const visiting = new Set(
      previewTables.appointments
        .filter((a) => a.branch_id === branchId)
        .map((a) => a.patient_id as string),
    );
    return rows.filter(
      (r) => r.branch_id === branchId || visiting.has(r.id as string),
    );
  }

  return rows.filter((r) => r.branch_id === branchId);
}

class PreviewQuery implements PromiseLike<PreviewResult> {
  private filters: Filter[] = [];
  private sorters: Sorter[] = [];
  private maxRows: number | null = null;
  private mode: "many" | "maybe" | "one" = "many";
  private selectList: string | null = null;
  /** `select(cols, { count: "exact" })` — report how many rows matched. */
  private wantCount = false;
  /** `select(cols, { head: true })` — skip rows, count only. */
  private headOnly = false;

  constructor(private readonly table: string) {}

  /**
   * Column list drives projection and the embedded-relation joins.
   *
   * The options argument mirrors PostgREST's `count`/`head`. Both are needed
   * because the two-branch overview counts rows per branch with
   * `head: true`; without this the mock returned full rows and an undefined
   * `count`, which the query layer coerced to 0 — a preview that rendered
   * "0 patients" for a branch with patients on screen.
   */
  select(cols?: string, opts?: { count?: string; head?: boolean }): this {
    this.selectList = cols ?? "*";
    this.wantCount = opts?.count === "exact";
    this.headOnly = opts?.head === true;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((r) => resolvePath(r, column) === value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push((r) => resolvePath(r, column) !== value);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push((r) => cmp(resolvePath(r, column), value) >= 0);
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push((r) => cmp(resolvePath(r, column), value) <= 0);
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push((r) => cmp(resolvePath(r, column), value) > 0);
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push((r) => cmp(resolvePath(r, column), value) < 0);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((r) => values.includes(resolvePath(r, column)));
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.filters.push((r) => matchIlike(resolvePath(r, column), pattern));
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((r) =>
      value === null
        ? resolvePath(r, column) === null
        : resolvePath(r, column) === value
    );
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    const asc = opts?.ascending ?? true;
    this.sorters.push((a, b) => {
      const c = cmp(resolvePath(a, column), resolvePath(b, column));
      return asc ? c : -c;
    });
    return this;
  }

  limit(n: number): this {
    this.maxRows = n;
    return this;
  }

  range(from: number, to: number): this {
    this.maxRows = to - from + 1;
    return this;
  }

  /**
   * PostgREST `or=(...)` syntax as produced by lib/queries.ts, e.g.
   * `patient_no.ilike.%juan%,last_name.ilike.%juan%`. Splitting on commas at
   * the top level is safe here because the app never puts commas inside a
   * pattern.
   */
  or(spec: string): this {
    const clauses = spec.split(",");
    this.filters.push((r) =>
      clauses.some((clause) => {
        const m = clause.trim().match(/^([\w.]+)\.(ilike|eq)\.(.+)$/);
        if (!m) return false;
        const [, column, op, operand] = m;
        if (op === "eq") return resolvePath(r, column) === operand;
        return matchIlike(resolvePath(r, column), operand);
      })
    );
    return this;
  }

  maybeSingle(): this {
    this.mode = "maybe";
    return this;
  }

  single(): this {
    this.mode = "one";
    return this;
  }

  // Writes are intentionally unsupported.
  insert(): PromiseLike<{ data: null; error: { message: string } }> {
    return Promise.resolve({ data: null, error: { message: PREVIEW_ERROR } });
  }
  update(): PromiseLike<{ data: null; error: { message: string } }> {
    return Promise.resolve({ data: null, error: { message: PREVIEW_ERROR } });
  }
  upsert(): PromiseLike<{ data: null; error: { message: string } }> {
    return Promise.resolve({ data: null, error: { message: PREVIEW_ERROR } });
  }
  delete(): PromiseLike<{ data: null; error: { message: string } }> {
    return Promise.resolve({ data: null, error: { message: PREVIEW_ERROR } });
  }

  private run(): Row[] {
    const source = previewTables[this.table] ?? [];
    // Scoping runs first: it stands in for RLS, which the database applies
    // before any WHERE clause the app sends.
    let rows = scopeToBranch(this.table, source).filter((r) =>
      this.filters.every((f) => f(r)),
    );
    if (this.sorters.length) rows = [...rows].sort((a, b) => {
      for (const s of this.sorters) {
        const c = s(a, b);
        if (c !== 0) return c;
      }
      return 0;
    });
    if (this.maxRows !== null) rows = rows.slice(0, this.maxRows);
    return rows;
  }

  then<R1 = PreviewResult, R2 = never>(
    onfulfilled?: ((v: PreviewResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    const select = this.selectList;
    const rows = this.run();

    let data: unknown = this.headOnly
      ? null
      : rows.map((r) => {
          const withEmbeds = select ? attachEmbeds(r, this.table, select) : r;
          return select ? project(withEmbeds, select) : withEmbeds;
        });

    if (!this.headOnly) {
      if (this.mode === "maybe") {
        data = Array.isArray(data) ? (data[0] ?? null) : data;
      } else if (this.mode === "one") {
        const one_ = Array.isArray(data) ? data : [];
        data = one_[0] ?? null;
      }
    }

    return Promise.resolve({
      data,
      error: null,
      count: this.wantCount ? rows.length : null,
    } as PreviewResult).then(onfulfilled, onrejected);
  }

  // Record the select() argument for use in then().
  select$ = (cols: string) => {
    (this as { _select?: string })._select = cols;
    return this;
  }
}

/** SQL LIKE matching: % is any run, _ is any single char, \ escapes. */
function matchIlike(value: unknown, pattern: string): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).toLowerCase();
  const p = pattern.toLowerCase();
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === "\\") {
      re += (p[i + 1] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i++;
    } else if (ch === "%") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`).test(s);
}

/**
 * Read-only stand-in for the Supabase client used in preview mode.
 */
export function createPreviewClient() {
  return {
    from(table: string) {
      return new PreviewQuery(table);
    },
    /**
     * Minimal `rpc()` support for the public booking page's read-only calls.
     * The booking write is rejected like every other preview write.
     */
    rpc(name: string, args?: Record<string, unknown>) {
      if (name === "public_branches") {
        const rows = (previewTables.branches ?? []).filter(
          (b) => b.is_active !== false,
        );
        return Promise.resolve({
          data: rows.map((b) => ({ id: b.id, name: b.name })),
          error: null,
        });
      }
      if (name === "public_branch_availability") {
        return Promise.resolve({
          data: previewAvailability(
            String(args?.p_branch ?? ""),
            String(args?.p_date ?? ""),
          ),
          error: null,
        });
      }
      if (name === "public_request_appointment") {
        return Promise.resolve({
          data: { ok: false, message: PREVIEW_ERROR },
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: { message: `Unknown preview rpc: ${name}` },
      });
    },
    auth: {
      async getUser() {
        return { data: { user: null }, error: null };
      },
      async signInWithPassword() {
        return { data: {}, error: { message: PREVIEW_ERROR } };
      },
    },
  };
}

/** Clinic wall-clock helpers (Asia/Manila is a fixed UTC+8). */
function clinicMinutesAndDay(iso: string): { hhmm: string; day: string } {
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60_000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const day = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  return { hhmm: `${hh}:${mm}`, day };
}

/** Mirror of public.public_branch_availability() over the fixtures. */
function previewAvailability(branchId: string, date: string) {
  const branch = (previewTables.branches ?? []).find((b) => b.id === branchId);
  if (!branch || branch.is_active === false) {
    return { ok: false, message: "Unknown branch." };
  }

  const settings = (previewTables.clinic_settings ?? [])[0] as
    | Record<string, unknown>
    | undefined;
  const openingHours = settings?.opening_hours as
    | Record<string, [string, string] | null>
    | undefined;
  const slotMin = (settings?.slot_minutes as number) ?? 30;

  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return { ok: false, message: "Choose a date." };
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const window = openingHours?.[String(weekday)];
  const open = Array.isArray(window) && window.length === 2;

  const busy = (previewTables.appointments ?? [])
    .filter((a) => a.branch_id === branchId)
    .filter((a) =>
      ["requested", "scheduled", "confirmed"].includes(String(a.status)),
    )
    .map((a) => ({
      start: clinicMinutesAndDay(String(a.starts_at)).hhmm,
      day: clinicMinutesAndDay(String(a.starts_at)).day,
      end: clinicMinutesAndDay(String(a.ends_at)).hhmm,
    }))
    .filter((a) => a.day === date)
    .map((a) => ({ start: a.start, end: a.end }));

  return {
    ok: true,
    branch: { id: branch.id, name: branch.name },
    date,
    open,
    opensAt: open ? (window as [string, string])[0] : null,
    closesAt: open ? (window as [string, string])[1] : null,
    slotMin,
    busy,
  };
}