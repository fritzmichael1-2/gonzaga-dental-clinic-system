# EXECUTIVE SUMMARY

This study aimed to analyze, design, and propose a Business Process Automation plan for the Gonzaga Dental Clinic Management Automation System (GDCMAS). The research focused on streamlining patient records, appointment scheduling, and dental clinic operations across the clinic's two branches, namely the Main Branch and the Second Branch.

The clinic currently operates using a paper-based system where patient records are stored in physical envelopes, binders, and cabinets. Appointment schedules are maintained in a logbook, and treatment updates are recorded on index cards. This system presents several challenges including difficulty in locating patient records, lack of accessibility between branches, risk of duplicate records, scheduling conflicts, and the absence of a backup system.

The researchers utilized a descriptive research approach through observation, interviews, and document analysis to understand the clinic's current processes. The As-Is workflow was modeled and analyzed using SIPOC (Suppliers, Inputs, Process, Outputs, Customers) analysis and root-cause analysis to identify process gaps and operational problems.

Based on the findings, the researchers designed and developed a centralized, web-based system using Next.js 16, React 19, TypeScript, Tailwind CSS 4, and Supabase (PostgreSQL, Authentication, and Row Level Security). The proposed system includes modules for patient management, treatment records with FDI tooth charting, appointment scheduling, consent documentation, public patient booking, staff management, and governance features with comprehensive audit logging.

The system implements a three-layer security approach consisting of proxy-level checks, server-side session validation, and PostgreSQL Row Level Security to ensure data protection. Role-based access control was established for three user types: Dentist, Secretary, and Administrator, with appropriate permissions and branch-scoped data access.

The implementation of GDCMAS addresses all identified problems by providing centralized patient records accessible across both branches, automated appointment scheduling with conflict prevention, digital treatment documentation, secure access control, and a public booking portal for patient convenience. The system also ensures accountability through append-only audit logs.

While some clinic-specific configurations such as consent wording and branch operating hours remain pending validation by the clinic, the core functionality has been successfully implemented. The researchers recommend system validation, staff training, data migration planning, and compliance with the Philippine Data Privacy Act before full deployment. With proper implementation, GDCMAS can significantly improve operational efficiency, data security, accessibility, and the overall quality of service at Gonzaga Dental Clinic.
