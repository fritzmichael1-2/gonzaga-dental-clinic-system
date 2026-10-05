/**
 * The instant that preview data is anchored to.
 *
 * Preview mode fabricates its records relative to a fixed moment rather than
 * `Date.now()`, so that screenshots, the walkthrough PDF, and a demo given on
 * different days all show the same clinic day. That only works if the
 * application reads the same clock: `clinicNow()` has to resolve to this
 * instant in preview, otherwise "today" is the real current date and the
 * overview renders two branches with an empty schedule and zero counts while
 * the fixtures plainly contain that data.
 *
 * Kept in its own module with no imports because `lib/clinical/schedule.ts` is
 * pulled into client components — importing the fixture module from there would
 * drag the whole fabricated dataset into the browser bundle. The value is the
 * UTC instant; callers apply the clinic offset themselves so the offset stays
 * defined in exactly one place.
 *
 * 2026-04-01T02:15:00Z is 10:15 AM in Asia/Manila — mid-morning, so a preview
 * shows a branch trading rather than "closed".
 */
export const PREVIEW_ANCHOR_ISO = "2026-04-01T02:15:00.000Z";

/** True when the app is serving fabricated preview data. */
export function isPreviewClockPinned(): boolean {
  return process.env.GDCMAS_PREVIEW === "1";
}
