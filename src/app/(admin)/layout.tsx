"use client";

import { Providers } from "@/components/Providers";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { AuthGate } from "@/components/AuthGate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AuthGate>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </AuthGate>
    </Providers>
  );
}
