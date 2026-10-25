import { PREVIEW_ANCHOR_ISO } from "./clock";
/**
 * ============================================================================
 * PREVIEW-ONLY FIXTURE DATA — THROW AWAY BEFORE SHIPPING
 * ============================================================================
 *
 * Fabricated patient records used solely to render the UI for design review
 * when no Supabase project is configured. Every name, contact number, and
 * clinical detail below is invented. There are no real patients here.
 *
 * Enabled only when GDCMAS_PREVIEW=1. See lib/preview/index.ts.
 */

const DAY = 86_400_000;
const MIN = 60_000;

/** Fixed clock so screenshots are deterministic. Anchored to clinic time. */
export const PREVIEW_NOW = PREVIEW_ANCHOR_ISO;

/**
 * Anchor, expressed on the clinic wall clock.
 *
 * The subtraction below has to be measured from where the anchor actually sits
 * on that clock (10:15), not from midnight. Treating it as midnight made every
 * fabricated appointment land 2h15m later than the time it names, so a booking
 * labelled 09:00 rendered as 11:15 and the walkthrough PDF showed it.
 */
const ANCHOR_CLOCK_MIN =
  new Date(PREVIEW_NOW).getUTCHours() * 60 +
  new Date(PREVIEW_NOW).getUTCMinutes() +
  8 * 60; // Asia/Manila is a fixed UTC+8 with no DST.

function at(daysFromNow: number, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const base = new Date(PREVIEW_NOW).getTime();
  return new Date(
    base + daysFromNow * DAY + (h * 60 + m - ANCHOR_CLOCK_MIN) * MIN,
  ).toISOString();
}

export const previewBranches = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    code: "MAIN",
    name: "Main Branch",
    address: "TODO(CLINIC): main branch address",
    phone: "TODO(CLINIC)",
    opens_at: "09:00",
    closes_at: "18:00",
    is_active: true,
  },
  {
    id: "b0000000-0000-4000-8000-000000000002",
    code: "SECOND",
    name: "Second Branch",
    address: "TODO(CLINIC): second branch address",
    phone: "TODO(CLINIC)",
    opens_at: "09:00",
    closes_at: "18:00",
    is_active: true,
  },
];

const MAIN = previewBranches[0].id;
const SECOND = previewBranches[1].id;

export const previewStaff = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "lezly.gonzaga@gdcmas.test",
    full_name: "Dr. Lezly S. Gonzaga",
    role: "dentist",
    branch_id: MAIN,
    is_active: true,
    created_at: at(-400, "09:00"),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "a.delacruz@gdcmas.test",
    full_name: "Ana Dela Cruz",
    role: "secretary",
    branch_id: MAIN,
    is_active: true,
    created_at: at(-380, "09:00"),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "r.santos@gdcmas.test",
    full_name: "Rina Santos",
    role: "secretary",
    branch_id: SECOND,
    is_active: true,
    created_at: at(-200, "09:00"),
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    email: "admin@gdcmas.test",
    full_name: "Clinic Administrator",
    role: "admin",
    branch_id: null,
    is_active: true,
    created_at: at(-500, "09:00"),
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    email: "j.pending@gdcmas.test",
    full_name: "Jose Pending",
    role: "secretary",
    branch_id: null,
    is_active: false,
    created_at: at(-5, "14:20"),
  },
  // Test accounts - 3 per role
  // Dentists
  {
    id: "d1111111-1111-4111-8111-111111111111",
    email: "dentist1@gdcmas.test",
    full_name: "Dr. Test Dentist One",
    role: "dentist",
    branch_id: MAIN,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
  {
    id: "d2222222-2222-4222-8222-222222222222",
    email: "dentist2@gdcmas.test",
    full_name: "Dr. Test Dentist Two",
    role: "dentist",
    branch_id: SECOND,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
  {
    id: "d3333333-3333-4333-8333-333333333333",
    email: "dentist3@gdcmas.test",
    full_name: "Dr. Test Dentist Three",
    role: "dentist",
    branch_id: MAIN,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
  // Secretaries
  {
    id: "s1111111-1111-4111-8111-111111111111",
    email: "secretary1@gdcmas.test",
    full_name: "Secretary Test One",
    role: "secretary",
    branch_id: MAIN,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
  {
    id: "s2222222-2222-4222-8222-222222222222",
    email: "secretary2@gdcmas.test",
    full_name: "Secretary Test Two",
    role: "secretary",
    branch_id: SECOND,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
  {
    id: "s3333333-3333-4333-8333-333333333333",
    email: "secretary3@gdcmas.test",
    full_name: "Secretary Test Three",
    role: "secretary",
    branch_id: MAIN,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
  // Admins
  {
    id: "a1111111-1111-4111-8111-111111111111",
    email: "admin1@gdcmas.test",
    full_name: "Admin Test One",
    role: "admin",
    branch_id: null,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
  {
    id: "a2222222-2222-4222-8222-222222222222",
    email: "admin2@gdcmas.test",
    full_name: "Admin Test Two",
    role: "admin",
    branch_id: null,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
  {
    id: "a3333333-3333-4333-8333-333333333333",
    email: "admin3@gdcmas.test",
    full_name: "Admin Test Three",
    role: "admin",
    branch_id: null,
    is_active: true,
    created_at: at(-100, "09:00"),
  },
];

type Seed = {
  no: string;
  last: string;
  first: string;
  middle?: string | null;
  birthdate: string | null;
  sex: "male" | "female" | "other" | null;
  civil?: string | null;
  contact: string;
  email?: string | null;
  address?: string | null;
  branch: string;
  allergies?: string | null;
  history?: string | null;
  meds?: string | null;
  status?: "active" | "archived";
  archivedReason?: string | null;
  createdDaysAgo: number;
};

const PATIENT_SEED: Seed[] = [
  { no: "0001", last: "Dela Cruz", first: "Juan", middle: "Ramirez", birthdate: "1988-04-12", sex: "male", civil: "Married", contact: "0917 555 0142", email: "juan.dc@example.test", address: "12 Katipunan Ave, Quezon City", branch: MAIN, allergies: "Penicillin — rash", history: "Hypertension, controlled. BP meds since 2019.", meds: "Amlodipine 5mg once daily", createdDaysAgo: 380 },
  { no: "0002", last: "Reyes", first: "Maria", middle: "Lopez", birthdate: "1995-09-03", sex: "female", civil: "Single", contact: "0918 555 0277", email: "maria.reyes@example.test", address: "8 Session Rd, Pasig City", branch: MAIN, allergies: null, history: "No known medical history.", meds: null, createdDaysAgo: 340 },
  { no: "0003", last: "Bautista", first: "Carlos", middle: null, birthdate: "1975-01-22", sex: "male", civil: "Married", contact: "0920 555 0918", email: null, address: "221 Katipunan Ave, Quezon City", branch: SECOND, allergies: "Latex", history: "Type 2 diabetes.", meds: "Metformin 500mg BID", createdDaysAgo: 300 },
  { no: "0004", last: "Villanueva", first: "Sofia", middle: "Cruz", birthdate: "2001-06-18", sex: "female", civil: "Single", contact: "0917 555 0364", email: "sofia.v@example.test", address: "44 Kalusugan St, Quezon City", branch: MAIN, allergies: null, history: "Third-trimmer pregnancy (24 weeks).", meds: "Folic acid", createdDaysAgo: 120 },
  { no: "0005", last: "Ocampo", first: "Miguel", middle: null, birthdate: "1954-11-30", sex: "male", civil: "Widowed", contact: "0919 555 0451", email: null, address: "77 Liberty St, Mandaluyong", branch: SECOND, allergies: "Aspirin, Ibuprofen", history: "Atrial fibrillation. Warfarin — bleeding risk.", meds: "Warfarin 5mg", createdDaysAgo: 260 },
  { no: "0006", last: "Garcia", first: "Andrea", middle: "Tan", birthdate: "1998-02-14", sex: "female", civil: "Single", contact: "0965 555 0789", email: "andrea.g@example.test", address: "15 Katipunan Ave, Quezon City", branch: MAIN, allergies: null, history: null, meds: null, createdDaysAgo: 90 },
  { no: "0007", last: "Mendoza", first: "Pedro", middle: null, birthdate: "1969-08-05", sex: "male", civil: "Annulled", contact: "0917 555 0123", email: null, address: "90 Corregidor Ave, Quezon City", branch: SECOND, allergies: "Codeine", history: "Prior extraction complication 2015.", meds: null, createdDaysAgo: 210 },
  { no: "0008", last: "Aquino", first: "Grace", middle: "Lim", birthdate: "1985-12-25", sex: "female", civil: "Married", contact: "0918 555 0666", email: "grace.aquino@example.test", address: "3 Kamuning Rd, Quezon City", branch: MAIN, allergies: null, history: "Migraine, seasonal.", meds: null, createdDaysAgo: 2 },
  { no: "0009", last: "Ramos", first: "Tomas", middle: null, birthdate: null, sex: "male", civil: null, contact: "0921 555 0399", email: null, address: null, branch: SECOND, allergies: null, history: null, meds: null, createdDaysAgo: 2 },
  { no: "0010", last: "Cruz", first: "Liezl", middle: null, birthdate: "2011-03-08", sex: "female", civil: "Single", contact: "0917 555 0555", email: "guardian.cruz@example.test", address: "22 Times St, Quezon City", branch: MAIN, allergies: "Amoxicillin", history: "Pediatric patient. Parent consent on file.", meds: null, createdDaysAgo: 5 },
  { no: "0011", last: "Santos", first: "Amador", middle: null, birthdate: null, sex: null, civil: null, contact: "0917 555 0100", email: null, address: null, branch: MAIN, allergies: null, history: null, meds: null, status: "archived", archivedReason: "Duplicate of GDC-2026-0001", createdDaysAgo: 150 },
  { no: "0012", last: "Diaz", first: "Perlita", middle: "Young", birthdate: "1939-07-19", sex: "female", civil: "Widowed", contact: "0922 555 0730", email: null, address: "5 Aurora St, Quezon City", branch: SECOND, allergies: "Sulfa drugs", history: "Hypertensive. Requires short appointments.", meds: "Amlodipine, Metformin", createdDaysAgo: 5 },
];

function pid(no: string): string {
  const n = no.replace(/\D/g, "").padStart(4, "0");
  return `${n}-0000-4000-8000-${n.padStart(12, "0")}`;
}

export const previewPatients = PATIENT_SEED.map((s, i) => ({
  id: pid(s.no),
  patient_no: `GDC-2026-${s.no}`,
  last_name: s.last,
  first_name: s.first,
  middle_name: s.middle ?? null,
  suffix: null,
  nickname: null,
  birthdate: s.birthdate,
  sex: s.sex,
  civil_status: s.civil ?? null,
  contact_no: s.contact,
  email: s.email ?? null,
  address: s.address ?? null,
  emergency_contact_name: i % 3 === 0 ? "Ana Dela Cruz (spouse)" : null,
  emergency_contact_no: i % 3 === 0 ? "0917 555 0188" : null,
  allergies: s.allergies ?? null,
  medical_history: s.history ?? null,
  medications: s.meds ?? null,
  branch_id: s.branch,
  status: s.status ?? "active",
  archived_reason: s.archivedReason ?? null,
  created_by: previewStaff[1].id,
  created_at: at(-s.createdDaysAgo, "10:15"),
  updated_by: previewStaff[1].id,
  updated_at: at(-Math.min(s.createdDaysAgo, 30), "14:02"),
}));

export const previewAppointments = (() => {
  const rows: Record<string, unknown>[] = [];
  const reasons = [
    "Routine check-up and scaling",
    "Tooth pain, right lower quadrant",
    "Post-op review — extraction site",
    "Filling follow-up",
    "New patient consultation",
    "Crown fitting adjustment",
    "Orthodontic adjustment",
    "Root canal therapy — session 2 of 3",
  ];
  const statuses = ["scheduled", "confirmed", "scheduled", "requested", "scheduled", "confirmed"];
  const times = ["09:00", "09:30", "10:00", "10:30", "11:00", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];

  // A dense week so the calendar and day grid look realistic.
  for (let d = -3; d <= 6; d++) {
    const howMany = d === 0 ? 9 : 4 + ((d + 7) % 4);
    for (let k = 0; k < howMany; k++) {
      const p = previewPatients[(d + k * 3 + 12) % previewPatients.length];
      const start = times[(k * 2 + Math.abs(d)) % times.length];
      const [h, m] = start.split(":").map(Number);
      rows.push({
        id: `ap00000${String(d + 4).padStart(2, "0")}-0000-4000-8000-${String(k).padStart(12, "0")}`,
        patient_id: p.id,
        // Patients are normally seen at the branch that holds their record.
        // The previous `k % 3` alternation booked people at the other branch
        // often enough that almost everyone qualified as a "visitor", so the
        // secretary preview showed the whole clinic and demonstrated nothing.
        // One deliberate cross-branch visit today keeps the
        // `can_access_patient` exception visible without erasing the scoping.
        branch_id:
          d === 0 && k === 1
            ? p.branch_id === MAIN
              ? SECOND
              : MAIN
            : p.branch_id,
        dentist_id: previewStaff[0].id,
        starts_at: at(d, start),
        ends_at: at(d, `${String(h).padStart(2, "0")}:${String(m + 30).padStart(2, "0")}`),
        status: statuses[(k + Math.abs(d)) % statuses.length],
        reason: reasons[(k + d + 8) % reasons.length],
        notes: null,
        created_by: previewStaff[1].id,
        created_at: at(d - 5, "09:00"),
        updated_by: previewStaff[1].id,
        updated_at: at(d - 5, "09:00"),
      });
    }
  }
  return rows as Record<string, unknown>[];
})();

type Tx = {
  patient: string;
  tooth: string | null;
  surfaces: string | null;
  code: string;
  name: string;
  daysAgo: number;
  notes?: string | null;
};

const TREATMENT_SEED: Tx[] = [
  { patient: "0001", tooth: "16", surfaces: "MO", code: "D2391", name: "Composite restoration, one surface", daysAgo: 12 },
  { patient: "0001", tooth: "36", surfaces: "MOD", code: "D2392", name: "Composite restoration, two surfaces", daysAgo: 40 },
  { patient: "0001", tooth: "46", surfaces: null, code: "D7140", name: "Extraction, erupted tooth", daysAgo: 96, notes: "No complications. Healing well." },
  { patient: "0002", tooth: "18", surfaces: "O", code: "D1110", name: "Adult prophylaxis", daysAgo: 30 },
  { patient: "0002", tooth: "27", surfaces: "MO", code: "D2391", name: "Composite restoration, one surface", daysAgo: 8 },
  { patient: "0003", tooth: "45", surfaces: "MOD", code: "D2393", name: "Composite restoration, three surfaces", daysAgo: 55 },
  { patient: "0003", tooth: "17", surfaces: null, code: "D3310", name: "Root canal therapy, anterior", daysAgo: 20, notes: "Session 1 of 2 completed." },
  { patient: "0004", tooth: null, surfaces: null, code: "D0150", name: "Periodic oral evaluation", daysAgo: 14 },
  { patient: "0005", tooth: "31", surfaces: null, code: "D4341", name: "Periodontal scaling and root planing, per quadrant", daysAgo: 21 },
  { patient: "0006", tooth: "21", surfaces: "MO", code: "D2391", name: "Composite restoration, one surface", daysAgo: 6 },
  { patient: "0007", tooth: "38", surfaces: null, code: "D3220", name: "Surgical extraction, soft tissue impact", daysAgo: 33, notes: "Referred due to anticipated difficulty." },
  { patient: "0008", tooth: "14", surfaces: "B", code: "D2391", name: "Composite restoration, one surface", daysAgo: 18 },
  { patient: "0009", tooth: null, surfaces: null, code: "D0120", name: "Oral evaluation, limited", daysAgo: 5 },
  { patient: "0012", tooth: "22", surfaces: null, code: "D6010", name: "Endosteal implant placement", daysAgo: 64 },
];

export const previewTreatments = TREATMENT_SEED.map((t, i) => {
  const p = previewPatients.find((x) => x.patient_no.endsWith(t.patient))!;
  return {
    id: `tr000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    patient_id: p.id,
    appointment_id: null,
    branch_id: p.branch_id,
    tooth_fdi: t.tooth,
    tooth_surfaces: t.surfaces,
    procedure_code: t.code,
    procedure_name: t.name,
    notes: t.notes ?? null,
    performed_by: previewStaff[0].id,
    performed_at: at(-t.daysAgo, "11:00"),
    created_by: previewStaff[0].id,
    created_at: at(-t.daysAgo, "11:05"),
    updated_by: previewStaff[0].id,
    updated_at: at(-t.daysAgo, "11:05"),
  };
}) as Record<string, unknown>[];

const CONSENT_SEED = [
  { patient: "0001", type: "surgery", version: "1.0", daysAgo: 96 },
  { patient: "0001", type: "treatment", version: "1.0", daysAgo: 96 },
  { patient: "0003", type: "surgery", version: "1.0", daysAgo: 33 },
  { patient: "0004", type: "treatment", version: "1.0", daysAgo: 14 },
  { patient: "0007", type: "surgery", version: "1.1", daysAgo: 33 },
  { patient: "0012", type: "surgery", version: "1.0", daysAgo: 64 },
];

export const previewConsents = CONSENT_SEED.map((c, i) => {
  const p = previewPatients.find((x) => x.patient_no.endsWith(c.patient))!;
  return {
    id: `cn000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    patient_id: p.id,
    consent_type: c.type,
    version: c.version,
    body:
      "I, the undersigned patient, have been informed of the proposed procedure, its intended benefits, the material risks, and the available alternatives in understandable language. I have had the opportunity to ask questions and received satisfactory answers. I consent to proceed.\n\nTODO(CLINIC): confirm the exact wording the clinic uses and the versioning scheme.",
    signature_type: "typed",
    recorded_by: previewStaff[1].id,
    recorded_at: at(-c.daysAgo, "10:30"),
  };
}) as Record<string, unknown>[];

export const previewAuditLogs = (() => {
  const rows: Record<string, unknown>[] = [];
  const actions = [
    ["patient.view", "patient", "Viewed patient record"],
    ["patient.create", "patient", "Registered new patient"],
    ["patient.update", "patient", "Updated patient details"],
    ["appointment.create", "appointment", "Booked appointment"],
    ["appointment.update", "appointment", "Changed appointment status"],
    ["treatment.create", "treatment", "Recorded treatment"],
    ["consent.create", "consent", "Captured consent"],
    ["staff.update", "staff", "Updated staff account"],
  ] as const;
  for (let i = 0; i < 22; i++) {
    const [action, entity, label] = actions[i % actions.length];
    const isPatient = entity === "patient";
    rows.push({
      id: `au000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      actor_id: i % 7 === 0 ? previewStaff[3].id : i % 3 === 0 ? previewStaff[2].id : previewStaff[1].id,
      actor_email: i % 7 === 0 ? previewStaff[3].email : i % 3 === 0 ? previewStaff[2].email : previewStaff[1].email,
      action,
      entity_type: entity,
      entity_id: isPatient ? previewPatients[i % previewPatients.length].id : `0000000${i}-0000-4000-8000-000000000000`,
      details: { note: label },
      ip: "192.168.1.24",
      created_at: at(-Math.floor(i / 3), `${String(8 + (i % 9)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`),
    });
  }
  return rows;
})();

export const previewBackups = (() => {
  const rows: Record<string, unknown>[] = [];
  const kinds = ["manual_export", "restore_drill", "manual_export", "pitr_note"];
  const outcomes = ["ok", "ok", "partial", "failed"];
  const notes = [
    null,
    "Full restore into an isolated database, verified row counts.",
    null,
    "Recovery point R-14 confirmed and restorable.",
  ];
  for (let i = 0; i < 9; i++) {
    rows.push({
      id: `bk0000${String(i).padStart(2, "0")}-0000-4000-8000-${String(i).padStart(12, "0")}`,
      performed_by: i % 3 === 0 ? previewStaff[3].id : previewStaff[1].id,
      performed_at: at(-i, "02:00"),
      kind: kinds[i % kinds.length],
      // Path or restore-point label only — never patient data.
      reference: `gdcmas-2026-0${(i % 3) + 3}-${String(i + 1).padStart(2, "0")}.dump`,
      outcome: outcomes[i % outcomes.length],
      notes: notes[i % notes.length],
      created_at: at(-i, "02:05"),
    });
  }
  return rows;
})();

export const previewSettings = {
  // getClinicSettings() reads the single-row table with `.eq("id", true)`.
  id: true,
  clinic_name: "Gonzaga Dental Clinic",
  clinic_address: "TODO(CLINIC): main branch address",
  clinic_phone: "TODO(CLINIC)",
  slot_minutes: 30,
  opening_hours: {
    "0": null,
    "1": ["09:00", "18:00"],
    "2": ["09:00", "18:00"],
    "3": ["09:00", "18:00"],
    "4": ["09:00", "18:00"],
    "5": ["09:00", "18:00"],
    "6": ["09:00", "13:00"],
  },
} as const;

/** Tables, in the shape the mock query engine serves them. */
export const previewTables: Record<string, Record<string, unknown>[]> = {
  branches: previewBranches as unknown as Record<string, unknown>[],
  staff: previewStaff as unknown as Record<string, unknown>[],
  patients: previewPatients as unknown as Record<string, unknown>[],
  appointments: previewAppointments,
  treatment_records: previewTreatments,
  consent_records: previewConsents,
  audit_logs: previewAuditLogs,
  backup_logs: previewBackups,
  clinic_settings: [previewSettings as unknown as Record<string, unknown>],
};