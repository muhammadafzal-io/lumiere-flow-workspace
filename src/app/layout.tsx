import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { getClinicConfig } from "@/lib/clinic-config";

/**
 * The app's typeface, self-hosted by next/font rather than fetched from a CDN at runtime.
 *
 * Until now `--font-sans` named Inter without anything ever loading it, so every surface —
 * including the client-facing widget — rendered in the browser's default UI font, and `font-serif`
 * fell back to Times. Poppins now carries both roles: headings and running text.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

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
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
