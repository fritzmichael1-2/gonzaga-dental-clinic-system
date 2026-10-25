# GDCMAS - Gonzaga Dental Clinic Management Automation System
## Final Defense Presentation

---

## Slide 1: Title Page
**GONZAGA DENTAL CLINIC MANAGEMENT AUTOMATION SYSTEM (GDCMAS)**

*A Business Process Automation Plan for Streamlining Patient Records, Appointment Scheduling, and Dental Clinic Operations at Gonzaga Dental Clinic*

Presented by:
- Amor, Khent Vincent C.
- Galve, Fritz Michael G.
- Gayem, Vince
- Jeruta, John Paul
- Perez, Godwin
- Simba, Via Marie
- Suasin, Ela
- Tamba, Mon Wilbert

Presented to:
- Marlo Kyn B. Bunda, BAM – 285, Project Lead
- Seth D. Nono, MSCS, Dean
- Panel Members

PHINMA University of Iloilo
College of Information Technology Education
October 2026

---

## Slide 2: Business Problem
**THE PROBLEM**

Gonzaga Dental Clinic currently uses a **paper-based system** for its operations:

- Patient records stored in **physical envelopes, binders, and cabinets**
- Appointment information maintained in a **logbook**
- Treatment updates recorded on **index cards**
- Records are **not accessible between branches** (Main Branch & Second Branch)
- **No backup system** for physical records
- Risk of **duplicate patient records**
- Difficulty in checking schedule availability
- Reliance on sharing photos/messages of records between branches

---

## Slide 3: Current Process
**AS-IS PROCESS**

1. **Patient Registration** - Fill out paper intake forms and consent documents
2. **Record Storage** - Documents placed in labeled envelopes and stored in cabinets
3. **Consultation** - Dentist reviews patient history from physical files
4. **Treatment Recording** - Updates written on index cards
5. **Appointment Booking** - Recorded manually in a logbook
6. **Inter-Branch Coordination** - Done through text messages or sharing photos of records

---

## Slide 4: Problems Identified
**KEY ISSUES**

- **Fragmented Records** - Patient files scattered across physical storage
- **Limited Accessibility** - Cannot access records instantly between branches
- **Manual Tracking** - Time-consuming search for patient records
- **Scheduling Conflicts** - Risk of double-booking due to manual logbook
- **No Data Backup** - Records vulnerable to loss or damage
- **Duplicate Records** - Created when existing files cannot be located
- **Lack of Accountability** - No audit trail of who accessed/modified records
- **Inefficient Coordination** - Delays caused by inter-branch record sharing

---

## Slide 5: Proposed Solution
**GDCMAS - THE SOLUTION**

**Gonzaga Dental Clinic Management Automation System (GDCMAS)**

A centralized, web-based management system that digitizes and automates:

- **Patient Records Management** - Centralized digital patient profiles
- **Treatment History Tracking** - Digital dental chart with FDI notation
- **Appointment Scheduling** - Automated slot generation and calendar management
- **Consent Documentation** - Digital versioned consent forms
- **Inter-Branch Access** - Unified records accessible across both branches
- **Role-Based Access Control** - Secure, authorized access only
- **Public Booking Portal** - Online appointment requests

---

## Slide 6: Future-State Process
**TO-BE PROCESS**

1. **Patient Registration/Retrieval** → Search or register patient in centralized system
2. **Appointment Booking** → Schedule via system with automatic availability checking
3. **Consultation & Treatment** → Access digital records, update treatment using digital tooth chart
4. **Record Management** → All data automatically stored and synced across branches
5. **Consent Documentation** → Digital consent captured with audit trail
6. **Reporting & Monitoring** → Real-time overview of appointments and operations

**Key Improvement:** *Standardized, automated, and centralized process with full traceability*

---

## Slide 7: System Features & Benefits
**BUSINESS BENEFITS**

| Benefit | Description |
| :-- | :-- |
| **Centralization** | Single source of truth for all patient records across both branches |
| **Accessibility** | Instant access to patient records from any authorized device |
| **Efficiency** | Faster record retrieval, automated scheduling, reduced manual work |
| **Accountability** | Complete audit trail of all system activities |
| **Data Security** | Multi-layered security with role-based access and RLS |
| **Accuracy** | Duplicate detection prevents fragmented patient histories |
| **Convenience** | Public booking portal for patient appointment requests |
| **Data Integrity** | Structured, consistent records with proper validation |

---

## Slide 8: Technology Stack & Security
**SYSTEM ARCHITECTURE**

**Technology Stack:**
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend/Database:** Supabase (PostgreSQL, Auth, Row Level Security)
- **Validation:** Zod

**Security Measures (3-Layer Protection):**
1. **Proxy Layer** - Initial session check
2. **Server Layer** - Database-validated session and role checking
3. **Database Layer (RLS)** - Row Level Security as the real security boundary

**User Roles:** Dentist, Secretary, Administrator

---

## Slide 9: Conclusion
**CONCLUSION**

- **Process Standardization:** The problem is not just the absence of software, but the lack of a standardized, centralized process.
- **Business Process Automation:** By standardizing the workflow first and automating it through technology, GDCMAS addresses all identified issues.
- **Improved Operations:** The system enhances efficiency, accessibility, security, and accountability in clinic operations.
- **Better Patient Care:** Centralized records enable better continuity of care across both branches.
- **Ready for Implementation:** The system provides a solid foundation for the clinic's digital transformation.

**"Business Process Automation allows the organization to standardize the process first and then use technology to support and automate it."**

---

## Slide 10: Q & A
**THANK YOU!**

**Questions and Answers**

*Gonzaga Dental Clinic Management Automation System (GDCMAS)*

PHINMA University of Iloilo
College of Information Technology Education
