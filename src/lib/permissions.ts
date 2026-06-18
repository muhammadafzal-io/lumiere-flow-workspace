export type UserRole = "admin" | "receptionist" | "practitioner";

export const ROLE_PAGES: Record<UserRole, string[]> = {
  admin: [
    "/",
    "/rules",
    "/calendar",
    "/customers",
    "/activity",
    "/flows",
    "/checkout",
    "/settings",
  ],
  receptionist: ["/", "/calendar", "/customers", "/checkout"],
  practitioner: ["/", "/calendar"],
};

export function canAccessPage(role: UserRole, page: string): boolean {
  const allowedPages = ROLE_PAGES[role];
  const normalizedPage = page === "/dashboard" ? "/" : page;
  return allowedPages.some((allowed) =>
    allowed === "/" ? normalizedPage === "/" : normalizedPage.startsWith(allowed),
  );
}
