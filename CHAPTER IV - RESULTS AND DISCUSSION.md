# CHAPTER IV
# RESULTS AND DISCUSSION

## 4.1 Implementation

This chapter presents the results of the development and implementation of the Gonzaga Dental Clinic Management Automation System (GDCMAS). It discusses the development tools used, hardware and software requirements, inputs and outputs of the study, results interpretation and analysis, and the system evaluation results.

### 4.1.1 Development Tools

The following development tools were utilized in the creation of the GDCMAS:

| Tool | Purpose |
| :-- | :-- |
| Visual Studio Code | Integrated Development Environment (IDE) for coding and debugging |
| Git and GitHub | Version control and repository management |
| Node.js and npm | JavaScript runtime and package management |
| Next.js 16 | Frontend and backend framework for web application development |
| TypeScript | Programming language for type-safe development |
| Tailwind CSS 4 | CSS framework for UI design and styling |
| Supabase | Backend-as-a-Service providing PostgreSQL database, authentication, and storage |

### 4.1.2 Hardware Requirements

#### For Development
| Component | Minimum Requirement | Recommended |
| :-- | :-- | :-- |
| Processor | Intel Core i5 or equivalent | Intel Core i7/AMD Ryzen 7 or higher |
| RAM | 8 GB | 16 GB or higher |
| Storage | 256 GB SSD | 512 GB SSD or higher |
| Internet Connection | Stable internet connection | Stable high-speed internet connection |

#### For End-Users (Client Side)
| Component | Minimum Requirement |
| :-- | :-- |
| Processor | Intel Core i3 or equivalent |
| RAM | 4 GB |
| Storage | 100 MB free space |
| Browser | Google Chrome, Mozilla Firefox, Microsoft Edge (latest version) |
| Internet Connection | Stable internet connection |

### 4.1.3 Software Requirements

| Software | Purpose |
| :-- | :-- |
| Operating System | Windows 10/11, Linux, or macOS |
| Web Browser | Google Chrome, Mozilla Firefox, or Microsoft Edge (Latest Version) |
| Node.js | Version 18.18.0 or higher |
| Supabase | Cloud-based PostgreSQL database and authentication service |
| Git | Version control system |

## 4.2 Input and Outputs of the Study

### 4.2.1 Inputs
The system requires the following inputs from authorized users:

- Patient registration details (name, birthdate, contact number, address, etc.)
- Medical history, allergies, and medications
- Dental treatment information (tooth number, procedure, surfaces)
- Appointment details (branch, date, time, dentist)
- Consent information
- Staff account details (for administrators)
- Patient booking requests (from public booking page)

### 4.2.2 Outputs
The system generates the following outputs:

- Patient records and profiles
- Treatment history reports
- Appointment schedules per branch
- Daily/branch overview dashboards
- Consent documentation
- Audit logs
- Public booking availability and confirmation messages
- Staff management reports

## 4.3 Results Interpretation and Analysis

The implementation of GDCMAS addressed the identified problems in the Gonzaga Dental Clinic's paper-based system. The results show the following:

1. **Centralized Patient Records** - Patient information is now stored in a single, centralized database accessible to authorized personnel from both branches, eliminating the need to physically transfer records.

2. **Improved Appointment Management** - The system's slot generation and availability checking prevent scheduling conflicts. The cross-branch pending guard ensures proper patient flow across branches.

3. **Enhanced Security and Access Control** - Through the three-layer security approach (Proxy, Server-side validation, and PostgreSQL RLS), data access is strictly controlled based on user roles and branch assignments.

4. **Efficient Patient Booking** - The public booking portal allows patients to request appointments online, reducing phone call traffic and providing convenience to patients.

5. **Accountability and Traceability** - The audit log system tracks all critical actions, providing accountability for all operations performed within the system.

## 4.4 System Evaluation Results

The system was evaluated based on its functionality, usability, and alignment with the identified requirements. The evaluation focused on the core modules and their ability to address the clinic's needs.

| Module | Evaluation Criteria | Result | Remarks |
| :-- | :-- | :-- | :-- |
| Patient Management | Registration, search, duplicate detection | Passed | Successfully manages patient records with duplicate prevention |
| Treatment Records | Tooth chart, procedures, history tracking | Passed | FDI tooth chart implemented with complete treatment documentation |
| Appointment Scheduling | Slot generation, booking, status management | Passed | Efficient scheduling with cross-branch conflict prevention |
| Public Booking | Availability, request submission | Passed | Functional unauthenticated booking portal |
| Staff Management | Roles, permissions, activation | Passed | Role-based access control properly implemented |
| Security & RLS | Data isolation, access control | Passed | Multi-layered security successfully enforced |
| Audit Logging | Action tracking | Passed | All critical actions are logged |

## 4.5 Discussion

The GDCMAS successfully achieves its goal of automating the Gonzaga Dental Clinic's manual processes. By centralizing patient records, streamlining appointment scheduling, and implementing strict access controls, the system addresses all the specific problems identified in Chapter I. 

The implementation of Row Level Security ensures that sensitive patient data remains protected while still allowing necessary access across branches for continuity of care. The role-based access control properly differentiates the responsibilities of Dentists, Secretaries, and Administrators.

While some clinic-specific configurations remain pending validation (consent wording, branch hours, etc.), the core functionality is fully implemented and operational. The system provides a solid foundation for the clinic's digital transformation and can be extended as additional requirements are identified.
