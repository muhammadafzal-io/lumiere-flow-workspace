import type { Metadata } from "next";
// Self-hosted directly from the package rather than next/font/google: next/font still has to
// download these same files from Google once at build/dev-compile time, which is a single point
// of failure whenever that network call doesn't go through (it repeatedly didn't, mid-project).
// @fontsource ships the files in the package itself, so there's nothing to fetch at build time —
// only the one-time `npm install` needs network, same as any other dependency.
import "@fontsource/poppins/latin-300.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "./globals.css";
import { getClinicConfig } from "@/lib/clinic-config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return {
    title: `${clinic.clinicName} — Flow`,
    description: "AI-powered client retention for aesthetic clinics",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
