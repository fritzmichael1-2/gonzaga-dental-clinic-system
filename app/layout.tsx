import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GDCMAS",
    template: "%s · GDCMAS",
  },
  description:
    "Gonzaga Dental Clinic Management Automation System — patient records, treatment history and appointments.",
  // PHI app: keep it out of search results and referrer leakage entirely.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}