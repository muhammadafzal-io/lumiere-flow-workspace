import type { Metadata } from "next";
import { getClinicConfig } from "@/lib/clinic-config";
import { AccountShell } from "@/components/account/AccountShell";

/**
 * The authenticated account pages only — home, book, appointments, history, offers, profile.
 * Deliberately a route group (the parens don't add a URL segment, so this page is still /account)
 * so its sibling /account/sign-in stays completely outside AccountShell. It used to live one level
 * up, at account/layout.tsx, which meant it wrapped sign-in too: AccountShell's own "no session ->
 * redirect away" check fired before the sign-in page ever rendered, so a signed-out visitor could
 * never actually reach it — every attempt bounced straight back out.
 */
export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return { title: `My account — ${clinic.clinicName}` };
}

export default function AccountAppLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
