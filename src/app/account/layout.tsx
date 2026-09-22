import type { Metadata } from "next";
import { getClinicConfig } from "@/lib/clinic-config";
import { AccountShell } from "@/components/account/AccountShell";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return { title: `My account — ${clinic.clinicName}` };
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
