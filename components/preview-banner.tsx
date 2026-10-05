import { isPreviewMode } from "@/lib/preview";

/**
 * PREVIEW-ONLY — THROW AWAY BEFORE SHIPPING.
 *
 * Renders a fixed banner when GDCMAS_PREVIEW=1 so fabricated records can never
 * be mistaken for real patient data during a demo or screenshot session.
 */
export default function PreviewBanner() {
  if (!isPreviewMode()) return null;

  return (
    <div className="no-print bg-warn px-4 py-2 text-center text-sm font-semibold text-white">
      PREVIEW MODE — all records shown are fabricated sample data. No real
      patient information is present.
    </div>
  );
}