# CHAPTER IV
# RESULTS AND DISCUSSION

## 4.1 System Implementation

The Gonzaga Dental Clinic Management Automation System (GDCMAS) was developed as a web-based application using Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, and Supabase (Postgres, Auth, Row Level Security). The system was implemented to address the identified issues in the current paper-based processes of Gonzaga Dental Clinic with branches in two locations.

### 4.1.1 System Features

The implemented system includes the following core modules:

#### Patient Management
- Patient registration with comprehensive intake information (demographics, contact details, allergies, medical history, medications)
- Duplicate detection before saving patient records
- Patient profile viewing and editing with role-based access
- Patient search and filtering capabilities
- Patient archiving functionality

#### Treatment Records
- FDI tooth chart interface for dental charting
- Procedure code recording with surface specifications
- Treatment history tracking per patient
- Recording of who performed treatment and when
- Clinical notes and observations

#### Appointment Management
- Per-branch calendar/day view for appointments
- Automated slot generation based on branch operating hours
- Appointment status management (requested, scheduled, confirmed, completed, cancelled, no-show)
- Cross-branch pending guard to prevent double-booking across branches
- Real-time status updates

#### Consent Management
- Versioned consent forms captured per patient
- Tracking of who recorded consent and when
- Digital consent documentation

#### Public Patient Booking
- Unauthenticated `/book` page for patient self-booking
- Branch and date selection with real-time availability
- Slot availability display
- Self-booking creates requests with "requested" status for staff review

#### Staff Management
- Role-based access control (Dentist, Secretary, Admin)
- Staff account activation/deactivation
- Branch assignment
- User and role management

#### Governance and Security
- Append-only audit log for all critical actions
- Backup log tracking
- Multi-layered security (Proxy, Server-side session validation, PostgreSQL RLS)
- Branch-scoped data access

### 4.1.2 User Interface

The system features a clean, professional interface with:
- Responsive design using Tailwind CSS 4
- Role-based navigation
- Branch overview dashboard for dentists and administrators
- Intuitive forms with validation
- Sage green color theme for a professional dental clinic appearance

## 4.2 Testing and Evaluation

### 4.2.1 Functional Testing

The system was tested against the specific objectives outlined in Chapter I:

| Objective | Status | Remarks |
|---|---|---|
| Document existing clinic processes | Completed | As-Is processes documented using SIPOC and workflow analysis |
| Identify operational problems and gaps | Completed | Issues identified and addressed in the system design |
| Identify stakeholders and their needs | Completed | Roles defined as Dentist, Secretary, and Admin |
| Model current process and analyze | Completed | SIPOC analysis and root-cause analysis conducted |
| Define functional and non-functional requirements | Completed | Requirements implemented with clinic validation noted as pending |
| Design To-Be workflow | Completed | Digital workflows implemented for all core processes |
| Develop system structure and modules | Completed | All planned modules implemented |
| Prepare testing and implementation plan | Completed | Testing conducted throughout development |

### 4.2.2 Security Testing

The multi-layered security approach was implemented and verified:

1. **Proxy Layer** - Redirects unauthenticated users appropriately (convenience check only)
2. **Server Layer** - Validates sessions against database, reads role/is_active from staff table (not from user-editable metadata)
3. **Database Layer (RLS)** - Enforces row-level security policies; cannot be bypassed

Branch scoping is enforced at the RLS level, ensuring secretaries can only access their assigned branch's data, with the exception of patients who have appointments at their branch.

### 4.2.3 Access Control Testing

| Role | Access Rights | Tested |
|---|---|---|
| Dentist | Both branches, all patient operations, treatments, consents, appointments, cannot manage staff | ✓ |
| Secretary | Own branch only, patients/appointments (with cross-branch patient access for appointments at their branch), cannot do treatments/consents/staff management | ✓ |
| Admin | Both branches, full access including staff management, audit logs, backup logs | ✓ |

### 4.2.4 Integration Testing

- Database operations with Supabase Postgres
- Authentication flow with Supabase Auth
- Public booking API endpoints
- Cross-branch appointment guard functionality
- Audit logging for all critical operations

## 4.3 Discussion

### 4.3.1 Addressing the Identified Problems

The implemented system addresses the specific problems identified in Chapter I:

1. **Manual record searching** - Digital patient directory with search functionality eliminates manual cabinet/binder searching
2. **No inter-branch accessibility** - Centralized database allows authorized personnel to access records across both branches with proper access controls
3. **No backup system** - Backup log tracking implemented; Supabase provides database backup capabilities
4. **Duplicate patient records** - Duplicate detection runs before patient creation to prevent fragmentation of patient history
5. **Appointment scheduling issues** - Digital calendar with slot management, availability checking, and cross-branch pending guard prevents double-booking
6. **Index card reliance** - Complete treatment history stored digitally with FDI tooth chart, accessible through patient profiles

### 4.3.2 System Advantages

- **Centralized Access**: Both branches share a unified patient record system
- **Improved Security**: Multi-layered authorization with strict RLS policies
- **Better Organization**: Structured data storage replacing paper-based records
- **Appointment Efficiency**: Automated slot generation and availability checking
- **Accountability**: Comprehensive audit logging of all actions
- **Patient Convenience**: Public booking portal for appointment requests

### 4.3.3 Limitations Encountered

As noted in the system design and Chapter I limitations:
- Some clinic-specific details (consent wording, intake fields, branch hours) are marked as TODO(CLINIC) pending validation
- Public booking requires additional security measures (rate limiting, bot protection) before internet exposure
- Migration of existing paper records would require manual encoding
- Per-branch trading hours not yet fully enforced in public booking flow

## 4.4 Summary

The GDCMAS system has been successfully implemented according to the planned modules and addresses the core issues identified in the current paper-based workflow. The system provides centralized patient record management, appointment scheduling, treatment tracking, and role-based access control across both clinic branches. Security measures have been implemented at multiple levels to protect sensitive patient information. While some clinic-specific configurations remain pending validation, the core functionality is operational and ready for testing and evaluation by the clinic.
