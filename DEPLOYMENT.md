# GDCMAS Deployment Guide

This guide provides step-by-step instructions for setting up and deploying the Gonzaga Dental Clinic Management Automation System (GDCMAS).

## Table of Contents
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Supabase Database Setup](#supabase-database-setup)
- [Authentication & First Admin Setup](#authentication--first-admin-setup)
- [Building for Production](#building-for-production)
- [Deployment](#deployment)
- [Post-Deployment Checklist](#post-deployment-checklist)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) v18.18.0 or later (v22.x recommended)
- [npm](https://www.npmjs.com/) v9+ or [pnpm](https://pnpm.io/)
- [Git](https://git-scm.com/)
- A [Supabase](https://supabase.com/) account and project

## Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/fritzmichael1-2/gonzaga-dental-clinic-system.git
   cd gonzaga-dental-clinic-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables** (see [Environment Variables](#environment-variables))

4. **Set up the database** (see [Supabase Database Setup](#supabase-database-setup))

5. **Run the development server**
   ```bash
   npm run dev
   ```
   
   The application will be available at [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Preview Mode (set to 0 for production/real auth)
GDCMAS_PREVIEW=0
GDCMAS_PREVIEW_ROLE=admin
GDCMAS_PREVIEW_UNASSIGNED=0
```

### Where to find these values:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project → Settings → API
3. Copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (Keep this secret!)

> **Warning:** Never commit `.env.local` or expose the service role key to the browser. It has full database access.

## Supabase Database Setup

1. **Open the SQL Editor**
   - Go to your Supabase Dashboard → SQL Editor → New query

2. **Run the schema**
   - Copy the contents of `supabase/schema.sql` and run it in the SQL editor
   - This creates all tables, functions, triggers, RLS policies, and permissions

3. **Run the seed data**
   - Copy the contents of `supabase/seed.sql` and run it in the SQL editor
   - This creates branches, clinic settings, and the `promote_to_admin()` bootstrap function

4. **Verify the setup**
   - Check that tables exist in Table Editor (branches, staff, patients, appointments, etc.)
   - Verify RLS is enabled on all tables

## Authentication & First Admin Setup

The system uses Supabase Auth. Every new user gets an inactive staff row via trigger and must be activated by an admin.

### Create the first admin:

1. **Create auth user**
   - Go to Authentication → Users → Add user
   - Enter email and password
   - Check "Auto Confirm User"

2. **Promote to admin**
   - Go to SQL Editor and run:
   ```sql
   SELECT public.promote_to_admin('your-admin-email@example.com', 'admin');
   ```
   - This will activate the account and grant admin role
   - Note: `promote_to_admin()` can only be used once (while no active admin exists)

3. **Sign in**
   - Navigate to `/login` on your app
   - Sign in with the credentials you just created

### Adding additional staff:

Once logged in as an admin, go to the Staff page (`/staff`) to invite additional staff members. They will be created as active users with assigned roles and branches.

## Building for Production

Test your production build locally before deploying:

```bash
npm run build
```

If the build succeeds with no errors, you're ready to deploy. You can test the production build with:

```bash
npm run start
```

## Deployment

### Deploying to Vercel

Vercel auto-detects everything about this app; the only manual step is the
environment variables.

1. **Push to GitHub** (already the case — `main` is the deploy branch)
2. **Import the repository**
   - [vercel.com](https://vercel.com) → **New Project** → import
     `fritzmichael1-2/gonzaga-dental-clinic-system`
   - Framework preset: Next.js (detected), build `npm run build`, no output dir
3. **Environment variables** (Project → Settings → Environment Variables), for
   Production and Preview:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-only; admin and backup screens need it |
   | `GDCMAS_PREVIEW` | **Do not set it.** `1` fakes a signed-in identity and skips `cookies()` |

4. **Deploy** — every push to `main` then redeploys automatically.

> **Note on the existing project.** `gonzaga-dental-clinic-system.vercel.app`
> lives under a different Vercel account and is currently blocked behind a paid
> plan, so that URL serves an old build with no intake form. Creating a new
> project from the same repository (step 2) costs nothing on Hobby.

### Other hosts

Any platform that runs Next.js 16 on Node works, with the same variables:

- [Netlify](https://www.netlify.com/) — free tier, Next.js runtime
- [Cloudflare Pages](https://pages.cloudflare.com/) — free tier, via the Next adapter
- [Railway](https://railway.app/) / [Render](https://render.com/) — paid beyond the trial
- Self-hosted with Docker or PM2

### Checking the build before deploying

```bash
npm run build     # must pass; the deploy runs the same command
npm run start     # http://localhost:3000, same build with the same env
```

## Post-Deployment Checklist

- [ ] App loads without errors
- [ ] Can log in with admin account
- [ ] Staff page accessible to admin only
- [ ] Can create patients, appointments, treatments
- [ ] Public booking page (`/book`) works
- [ ] Role-based permissions working correctly
- [ ] Branch scoping enforced (secretary sees only their branch)
- [ ] Audit logs are being recorded
- [ ] RLS policies are active (test with different roles)

## Troubleshooting

### "Not permitted" errors
- Ensure the user is active in the `staff` table (`is_active = true`)
- Check that the user has been assigned a role
- Verify RLS policies are properly set up

### Authentication issues
- Confirm `NEXT_PUBLIC_SUPABASE_URL` and keys are correct
- Make sure `GDCMAS_PREVIEW` is set to `0` in production
- Check Supabase Auth settings (email confirmation settings)

### Database connection issues
- Verify all SQL scripts ran successfully
- Check that service role key has the correct permissions
- Ensure RLS isn't blocking service role operations (service role bypasses RLS by default)

### Build errors
- Run `npm run lint` to check for linting issues
- Ensure all environment variables are set
- Check Node.js version compatibility

---

For additional support, refer to the [README.md](README.md) or the documentation in the `docs/` folder.
