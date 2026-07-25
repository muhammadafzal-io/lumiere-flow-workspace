import type { Metadata } from "next";
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
