/** Sign-in sits outside the shell: there is no session to build a nav from yet. */
export default function AccountSignInLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
