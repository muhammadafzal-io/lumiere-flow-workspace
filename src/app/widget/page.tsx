import type { Metadata } from "next";
import ChatWidget from "@/components/ChatWidget";
import { getClinicConfig } from "@/lib/clinic-config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return {
    title: `${clinic.clinicName} — Chat`,
    description: `Chat with the ${clinic.clinicName} front-desk assistant`,
  };
}

/**
 * /widget — embeddable chat page (separate from admin portal).
 * Canonical URL: https://lumiere-flow-workspace-htt1.vercel.app/widget
 */
export default async function WidgetPage() {
  const clinic = await getClinicConfig();
  return (
    <div className="w-full h-screen flex items-center justify-center bg-transparent">
      <div className="w-full h-full max-w-md mx-auto shadow-2xl rounded-2xl overflow-hidden">
        <ChatWidget clinicName={clinic.clinicName} location={clinic.location} />
      </div>
    </div>
  );
}
