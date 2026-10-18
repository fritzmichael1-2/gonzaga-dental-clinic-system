import Image from "next/image";
import {
  getPublicAvailability,
  listPublicBranches,
  type PublicAvailability,
} from "@/lib/public/availability";
import { clinicInstantNow, clinicTodayKey, shiftDateKey } from "@/lib/clinical/schedule";
import BookingForm from "./booking-form";

export const metadata = { title: "Book an appointment" };

type Params = { branch?: string; date?: string };

/**
 * Public, unauthenticated booking page.
 *
 * No session, no patient picker, no read access to patient data: everything on
 * screen comes from the anon-callable public_* RPCs. Bookings land as
 * 'requested' for the clinic to confirm.
 *
 * `searchParams` makes this route dynamic, so it is never prerendered against
 * the database at build time.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const today = clinicTodayKey();
  const maxDate = shiftDateKey(today, 60);

  const branches = await listPublicBranches().catch(() => []);
  const branch = params.branch ?? branches[0]?.id ?? "";
  const date = params.date ?? "";

  let availability: PublicAvailability | null = null;
  if (branch && date) {
    try {
      availability = await getPublicAvailability(branch, date);
    } catch {
      availability = { ok: false, message: "Availability is temporarily unavailable." };
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-5 sm:p-8">
      <header className="flex items-center gap-2.5 text-brand">
        <Image src="/clinic-logo.png" alt="" width={30} height={30} priority />
        <div>
          <p className="text-sm font-semibold tracking-wide uppercase">
            Gonzaga Dental Clinic
          </p>
          <h1 className="text-lg font-semibold text-ink">Book an appointment</h1>
        </div>
      </header>

      <section className="panel p-5">
        <h2 className="panel-title mb-3">Choose a branch and date</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="branch">
              Branch
            </label>
            <select id="branch" name="branch" defaultValue={branch} className="field">
              {branches.length === 0 && <option value="">No branches available</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-44 flex-1">
            <label className="label" htmlFor="date">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              min={today}
              max={maxDate}
              defaultValue={date || today}
              className="field"
            />
          </div>
          <button type="submit" className="btn-ghost">
            View open times
          </button>
        </form>
      </section>

      <section className="panel p-5">
        <h2 className="panel-title mb-4">Request a slot</h2>
        <BookingForm
          branchId={branch}
          date={date}
          availability={availability}
          nowIso={clinicInstantNow().toISOString()}
        />
      </section>

      <p className="hint">
        This page shows only which times are open. It never shows other
        patients. Your appointment is a request until the clinic confirms it.
      </p>
    </main>
  );
}
