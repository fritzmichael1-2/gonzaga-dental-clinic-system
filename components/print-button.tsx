"use client";

import { Printer } from "lucide-react";

/**
 * Prints the record via the browser dialog. Kept as a client component because
 * the patient record itself is a server component and `window` is unavailable
 * there. A print stylesheet hides the navigation so the output is the chart
 * alone rather than the whole app chrome.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      className="btn-ghost"
      title="Print chart"
      onClick={() => window.print()}
    >
      <Printer size={16} aria-hidden />
      Print
    </button>
  );
}