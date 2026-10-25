# GDCMAS Test Credentials

All accounts use password: **test1234**

## Dentists (3)
| Email | Full Name | Branch | Role |
|---|---|---|---|
| dentist1@gdcmas.test | Dr. Test Dentist One | Main Branch | dentist |
| dentist2@gdcmas.test | Dr. Test Dentist Two | Second Branch | dentist |
| dentist3@gdcmas.test | Dr. Test Dentist Three | Main Branch | dentist |

## Secretaries (3)
| Email | Full Name | Branch | Role |
|---|---|---|---|
| secretary1@gdcmas.test | Secretary Test One | Main Branch | secretary |
| secretary2@gdcmas.test | Secretary Test Two | Second Branch | secretary |
| secretary3@gdcmas.test | Secretary Test Three | Main Branch | secretary |

## Admins (3)
| Email | Full Name | Branch | Role |
|---|---|---|---|
| admin1@gdcmas.test | Admin Test One | Both (unassigned) | admin |
| admin2@gdcmas.test | Admin Test Two | Both (unassigned) | admin |
| admin3@gdcmas.test | Admin Test Three | Both (unassigned) | admin |

## Original Preview Accounts
| Email | Full Name | Branch | Role |
|---|---|---|---|
| lezly.gonzaga@gdcmas.test | Dr. Lezly S. Gonzaga | Main Branch | dentist |
| a.delacruz@gdcmas.test | Ana Dela Cruz | Main Branch | secretary |
| r.santos@gdcmas.test | Rina Santos | Second Branch | secretary |
| admin@gdcmas.test | Clinic Administrator | Both (unassigned) | admin |

## Notes
- The app is currently in **preview mode** (GDCMAS_PREVIEW=1). In preview mode, authentication is bypassed and you can switch roles via `GDCMAS_PREVIEW_ROLE` in `.env.local`.
- To login with real credentials, you'd need to create these users in Supabase Auth and activate them via the staff management page or `promote_to_admin()` function.

## How to use in Preview Mode (Current Setup)
The app is currently in preview mode (`GDCMAS_PREVIEW=1` in `.env.local`). Authentication is bypassed.

To switch roles:
1. Edit `.env.local` in the project root
2. Change `GDCMAS_PREVIEW_ROLE` to: `admin`, `dentist`, or `secretary`
3. Restart the dev server
4. The session will automatically use that persona

**Note:** The passwords above are for reference if/when using real Supabase Auth. In preview mode, no login is required.
