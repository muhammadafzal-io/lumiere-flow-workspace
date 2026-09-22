/**
 * A plain pass-through for everything under /account — deliberately does NOT wrap children in
 * AccountShell (see account/(app)/layout.tsx for that). /account/sign-in and
 * /account/auth/callback both need to be reachable with no session at all; nesting them under the
 * shell's own "redirect away if signed out" check is what made sign-in unreachable before.
 */
export default function AccountRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
