/**
 * API Permission Testing Guide
 *
 * When implementing API-level RBAC, test these scenarios:
 */

// Example test cases for protected API endpoints:
const API_TESTS = {
  "GET /api/customers": {
    admin: "✓ allowed",
    receptionist: "✓ allowed",
    practitioner: "✗ forbidden",
  },
  "POST /api/customers": {
    admin: "✓ allowed",
    receptionist: "✓ allowed",
    practitioner: "✗ forbidden",
  },
  "GET /api/rules": {
    admin: "✓ allowed",
    receptionist: "✗ forbidden",
    practitioner: "✗ forbidden",
  },
  "POST /api/rules": {
    admin: "✓ allowed",
    receptionist: "✗ forbidden",
    practitioner: "✗ forbidden",
  },
  "DELETE /api/rules/:id": {
    admin: "✓ allowed",
    receptionist: "✗ forbidden",
    practitioner: "✗ forbidden",
  },
  "GET /api/activity": {
    admin: "✓ allowed",
    receptionist: "✗ forbidden",
    practitioner: "✗ forbidden",
  },
  "GET /api/calendar/events": {
    admin: "✓ allowed",
    receptionist: "✓ allowed",
    practitioner: "✓ allowed",
  },
  "POST /api/calendar/events": {
    admin: "✓ allowed",
    receptionist: "✓ allowed",
    practitioner: "✗ forbidden",
  },
};

/**
 * To test API permissions, you would:
 *
 * 1. Add a middleware to check user role from request headers
 * 2. Verify permission before executing each endpoint
 * 3. Return 403 Forbidden if access denied
 *
 * Example middleware:
 *
 * function requireRole(roles: UserRole[]) {
 *   return (req: NextRequest) => {
 *     const userRole = req.headers.get('x-user-role') as UserRole;
 *     if (!roles.includes(userRole)) {
 *       return NextResponse.json(
 *         { error: "Forbidden" },
 *         { status: 403 }
 *       );
 *     }
 *   };
 * }
 *
 * Usage in route:
 * export async function POST(req: NextRequest) {
 *   const role = req.headers.get('x-user-role') as UserRole;
 *   if (!canAccessPage(role, '/rules')) {
 *     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 *   }
 *   // ... continue with the endpoint logic
 * }
 */

export const API_PERMISSION_TESTS = API_TESTS;
