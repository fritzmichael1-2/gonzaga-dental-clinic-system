# GDCMAS Security Features

## Overview
The Gonzaga Dental Clinic Management Automation System (GDCMAS) implements a comprehensive, multi-layered security architecture to protect sensitive patient data and ensure proper access control across both clinic branches.

## Security Implementation

### 1. Database-Level Security
- **Row Level Security (RLS) on every table** — All 9 tables have RLS policies enabled. Even if someone bypasses the UI and queries the database directly, PostgreSQL enforces access restrictions.
- **No table access for anonymous users** — The `anon` role has zero table grants. Public endpoints can only access data through specifically authorized SECURITY DEFINER functions.
- **Records cannot be destroyed** — Deleting a patient with treatment history is refused, not silently cascaded. This preserves data integrity and audit requirements.

### 2. Multi-Layered Authorization
- **Three-layer authorization** — Middleware redirect → Server session check → RLS. The first two layers provide convenience and fast failures, while PostgreSQL RLS is the real security boundary.
- **Roles read from the database, not the login token** — User roles are retrieved from the `staff` table, never trusted from JWT user-editable metadata. This prevents privilege escalation attacks.
- **Active-account gate** — Accounts with `is_active = false` have zero access to clinical data. Every new account starts inactive by default. A deactivated user can log in but sees nothing.
- **No self-promotion** — Users cannot change their own role or privileges. Only administrators can edit the staff table. Self-deactivation is also blocked.

### 3. Branch-Level Isolation
- **Branch isolation** — Secretaries can only see patients and data from their assigned branch. This is enforced at the SQL/RLS level, not just by hiding UI elements.
- **Unassigned = no access** — A secretary with no branch assigned sees no clinical data at all, rather than having unrestricted access.
- **Clinic-wide access** — Dentists and administrators have access to both branches as per their roles.

### 4. Role-Based Access Control
- **Clinical writes restricted** — Only dentists and administrators can record treatments and consents. Secretaries cannot perform these actions, even via direct API calls.
- **Admin-only operations** — Staff management, audit log access, backup log access, patient archiving/deletion, and clinic settings are restricted to administrators only.
- **Least privilege principle** — Each role has only the minimum permissions required to perform their job functions.

### 5. Function & API Security
- **Locked-down database functions** — SECURITY DEFINER functions have their EXECUTE permissions revoked for client roles. Clients cannot call internal functions like `handle_new_user()` to fabricate staff rows.
- **Protected bootstrap function** — `promote_to_admin()` is not callable by clients at all; it can only be used in controlled environments.
- **Service-role key is server-only** — The Supabase service role key is used in exactly two places (staff provisioning and audit writes), imported only in server-only modules. It is never shipped to the browser.
- **Public booking is fenced off** — Anonymous users have zero table access. The `/book` page can only reach three narrow SECURITY DEFINER functions. Availability responses return only occupied time slots, never patient names or appointment details.

### 6. Data Integrity & Constraints
- **No double bookings** — Database exclusion constraints prevent a dentist from being booked twice and prevent a patient from holding two overlapping appointments.
- **Cross-branch booking guard** — A patient with a pending appointment at one branch cannot be booked at the other branch until that appointment is settled (completed, cancelled, or no-show).
- **Records cannot be destroyed** — Deleting a patient with treatment history is refused, not silently cascaded. Historical medical data is preserved.
- **Input validation** — All data is validated with Zod schemas on the server (names, phones, emails, birthdates, FDI tooth numbers, etc.).
- **Password policy** — Enforced minimum requirements: 8+ characters with uppercase, lowercase, digit, and special character.

### 7. Auditing & Compliance
- **Comprehensive audit log** — Every sensitive action is recorded (logins, patient views, treatments, consents, staff changes, etc.). The audit log is append-only.
- **Tamper-proof logging** — Users cannot write to or delete audit log entries. Only administrators can read the audit log.
- **Verified by test script** — The security implementation is verified by `supabase/smoke-test.sql` which runs 25 sections with 9 expected refusals and 0 unexpected errors, confirming denials actually happen as intended.
