import type { Metadata } from "next";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: "Lumière Med Spa — Chat",
  description: "Chat with the Lumière front-desk assistant",
};

/**
 * /widget — embeddable chat page (separate from admin portal).
 * Embed: <iframe src="https://lumiere-flow-workspace-htt1.vercel.app/widget" ... />
 */
export default function WidgetPage() {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-transparent">
      <div className="w-full h-full max-w-md mx-auto shadow-2xl rounded-2xl overflow-hidden">
        <ChatWidget />
      </div>
    </div>
  );
}
