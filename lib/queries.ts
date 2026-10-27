import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Appointment, PatientIntake, TreatmentRecord } from "@/lib/types";

/**
 * Typed data-access layer.
 *
 * The Supabase client is untyped until `supabase gen types` is run against the
 * signed-off schema, so embedded relations arrive as loose objects. Rather than
 * scatter casts through the pages, every relational read lives here with an
 * explicit shape.
 */

export type NameRef = {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
};

export type BranchRef = { id: string; name: string };

export type AppointmentWithRefs = Appointment & {
  patients: NameRef[] | null;
  branches: BranchRef[] | null;
  staff: { id: string; full_name: string }[] | null;
};

export type TreatmentWithRefs = TreatmentRecord & {
  patients: NameRef[] | null;
  branches: BranchRef[] | null;
  staff: { id: string; full_name: string }[] | null;
};

/** Supabase returns a to-one embed as an array when the FK is not detected. */
export function one<T>(v: T[] | T | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const APPOINTMENT_SELECT = `
  id, patient_id, branch_id, dentist_id, starts_at, ends_at, status,
  reason, notes, created_by, created_at, updated_at,
  patients ( first_name, last_name, middle_name ),
  branches ( id, name ),
  staff ( id, full_name )
`;

const TREATMENT_SELECT = `
  id, patient_id, appointment_id, branch_id, tooth_fdi, tooth_surfaces,
  procedure_code, procedure_name, notes, performed_by, performed_at,
  created_by, created_at, updated_at,
  patients ( first_name, last_name, middle_name ),
  branches ( id, name ),
  staff ( id, full_name )
`;

/** Appointments in a window, with patient/branch/dentist joined. */
export async function listAppointments(opts: {
  fromIso?: string;
  toIso?: string;
  branchId?: string;
  patientId?: string;
  limit?: number;
}): Promise<AppointmentWithRefs[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .order("starts_at");

  if (opts.fromIso) q = q.gte("starts_at", opts.fromIso);
  if (opts.toIso) q = q.lte("starts_at", opts.toIso);
  if (opts.branchId) q = q.eq("branch_id", opts.branchId);
  if (opts.patientId) q = q.eq("patient_id", opts.patientId);
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(`appointments query failed: ${error.message}`);
  return (data ?? []) as AppointmentWithRefs[];
}

export async function listTreatmentsForPatient(
  patientId: string
): Promise<TreatmentWithRefs[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("treatment_records")
    .select(TREATMENT_SELECT)
    .eq("patient_id", patientId)
    .order("performed_at", { ascending: false });

  if (error) throw new Error(`treatments query failed: ${error.message}`);
  return (data ?? []) as TreatmentWithRefs[];
}

export async function listRecentTreatments(
  limit = 6
): Promise<TreatmentWithRefs[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("treatment_records")
    .select(TREATMENT_SELECT)
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`treatments query failed: ${error.message}`);
  return (data ?? []) as TreatmentWithRefs[];
}

/**
 * Directory search.
 *
 * A blank query returns a recent-activity page so the secretary always has
 * something to click into. Otherwise it matches patient_no exactly, or name /
 * contact with a trigram-friendly `ilike`.
 */
export async function searchPatients(opts: {
  q?: string;
  branchId?: string;
  includeArchived?: boolean;
  limit?: number;
}): Promise<
  {
    id: string;
    patient_no: string;
    last_name: string;
    first_name: string;
    middle_name: string | null;
    birthdate: string | null;
    contact_no: string | null;
    status: string;
    branch_id: string | null;
    allergies: string | null;
    updated_at: string;
    branches: BranchRef[] | null;
  }[]
> {
  const supabase = await createSupabaseServerClient();
  const limit = opts.limit ?? 50;

  let q = supabase
    .from("patients")
    .select(
      `id, patient_no, last_name, first_name, middle_name, birthdate,
       contact_no, status, branch_id, allergies, updated_at,
       branches ( id, name )`
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (!opts.includeArchived) q = q.eq("status", "active");
  if (opts.branchId) q = q.eq("branch_id", opts.branchId);

  const term = opts.q?.trim();
  if (term) {
    // Escape % and _ so a patient name cannot act as a wildcard.
    const safe = term.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.or(
      `patient_no.ilike.%${safe}%,` +
        `last_name.ilike.%${safe}%,` +
        `first_name.ilike.%${safe}%,` +
        `contact_no.ilike.%${safe}%`
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(`patients query failed: ${error.message}`);
  return (data ?? []) as never;
}

export type PatientWithBranch = {
  id: string;
  patient_no: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  suffix: string | null;
  nickname: string | null;
  birthdate: string | null;
  sex: string | null;
  civil_status: string | null;
  contact_no: string | null;
  email: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_no: string | null;
  allergies: string | null;
  medical_history: string | null;
  medications: string | null;
  branch_id: string | null;
  status: string;
  archived_reason: string | null;
  created_at: string;
  updated_at: string;
  branches: BranchRef[] | null;
};

export async function listPatientsForPicker(limit = 200) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, patient_no, last_name, first_name, middle_name, contact_no")
    .eq("status", "active")
    .order("last_name")
    .limit(limit);
  if (error) throw new Error(`patient picker query failed: ${error.message}`);
  return data ?? [];
}

export async function getPatient(id: string): Promise<PatientWithBranch | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .select("*, branches ( id, name )")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`patient query failed: ${error.message}`);
  return (data ?? null) as PatientWithBranch | null;
}

/**
 * The digitised paper intake form for one patient. Returns null for records
 * created before the form existed, which the record page renders as an
 * explicit "not captured yet" state rather than an empty table.
 */
export async function getPatientIntake(
  patientId: string
): Promise<PatientIntake | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patient_intake")
    .select("*")
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) throw new Error(`intake query failed: ${error.message}`);
  return (data ?? null) as PatientIntake | null;
}

export async function listBranches() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`branches query failed: ${error.message}`);
  return data ?? [];
}

/** Active clinicians who can be assigned to an appointment. */
export async function listAssignableDentists() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name, role")
    .eq("is_active", true)
    .in("role", ["dentist", "admin"])
    .order("full_name");
  if (error) throw new Error(`staff query failed: ${error.message}`);
  return data ?? [];
}

export async function getClinicSettings() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinic_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`settings query failed: ${error.message}`);
  return data;
}

export async function listStaff() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, email, full_name, role, branch_id, is_active, created_at, branches ( id, name )")
    .order("full_name");
  if (error) throw new Error(`staff query failed: ${error.message}`);
  return data ?? [];
}
/**
 * Per-branch figures for the two-branch overview.
 *
 * Deliberately counted with one `head: true` request per branch per measure
 * rather than a single grouped query. PostgREST has no GROUP BY, so the
 * alternative is pulling every matching row and counting in JS — fine for two
 * branches, wrong the moment the clinic grows, and it would drag patient rows
 * across the wire to produce four integers. Branch is already the RLS
 * boundary, so these counts also respect it automatically: a secretary sees
 * their own branch and the other comes back as zero.
 */
export type BranchStat = {
  branchId: string;
  activePatients: number;
  appointmentsToday: number;
  treatmentsThisWeek: number;
  newPatientsThisWeek: number;
};

export async function listBranchStats(opts: {
  branchIds: string[];
  todayRange: { fromIso: string; toIso: string };
  weekAgoIso: string;
}): Promise<BranchStat[]> {
  const supabase = await createSupabaseServerClient();
  const { fromIso, toIso } = opts.todayRange;

  return Promise.all(
    opts.branchIds.map(async (branchId) => {
      const [patients, newPatients, appointments, treatments] = await Promise.all([
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", branchId)
          .eq("status", "active"),
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", branchId)
          .gte("created_at", opts.weekAgoIso),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", branchId)
          .gte("starts_at", fromIso)
          .lte("starts_at", toIso),
        supabase
          .from("treatment_records")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", branchId)
          .gte("performed_at", opts.weekAgoIso),
      ]);

      for (const [label, r] of [
        ["activePatients", patients],
        ["newPatientsThisWeek", newPatients],
        ["appointmentsToday", appointments],
        ["treatmentsThisWeek", treatments],
      ] as const) {
        if (r.error) {
          throw new Error(`${label} count failed for branch: ${r.error.message}`);
        }
      }

      return {
        branchId,
        activePatients: patients.count ?? 0,
        appointmentsToday: appointments.count ?? 0,
        treatmentsThisWeek: treatments.count ?? 0,
        newPatientsThisWeek: newPatients.count ?? 0,
      };
    }),
  );
}
