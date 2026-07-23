# RBAC Implementation Plan — Lumière Flow Workspace

## 1. Current State

No real authentication exists today. What looks like "roles" is a client-side-only
mock:

- `src/lib/auth-context.tsx` stores a role (`admin` / `receptionist` / `practitioner`)
  in `localStorage`, defaulting to `admin`. Anyone can change it via devtools.
- `src/lib/permissions.ts` maps those three roles to a static list of allowed page
  paths (`ROLE_PAGES`) — used only to decide what to *show* in the sidebar/pages.
- **Zero API routes check permissions.** All ~46 routes are open to anyone who can
  reach them.
- `Practitioners.Role` (DB column: "Admin" / "Practitioner") is a free-text field
  used only for display — not linked to any login or enforcement.
- There is no `Users` table, no sessions, no password storage, no middleware.

This plan replaces the mock with real, database-driven RBAC, enforced on both
frontend and backend.

## 2. Decisions Assumed (confirm before Phase 1)

- **Auth provider: Supabase Auth** (already our DB — skips building password
  hashing/session management from scratch). Flag if you'd rather hand-roll this.
- **Multiple roles per user: supported** via a join table, even if v1 only ever
  assigns one role to each user.
- **`Practitioners` stays separate from `Users`.** A practitioner login is a `Users`
  row with a nullable `practitioner_id` pointing at their `Practitioners` row (booking
  qualifications/hours live there); a Receptionist has no `Practitioners` row at all.

## 3. Database Schema (additive — no existing table is modified or dropped)

```sql
-- Staff/login accounts. id matches auth.users.id (Supabase Auth owns credentials).
CREATE TABLE "Users" (
  id uuid PRIMARY KEY,                     -- = auth.users.id
  "Name" text NOT NULL,
  "Email" text NOT NULL UNIQUE,
  "Status" text NOT NULL DEFAULT 'Invited', -- Invited | Active | Disabled
  "MustChangePassword" boolean NOT NULL DEFAULT true,
  "PractitionerId" uuid REFERENCES "Practitioners"(id),
  "InvitedAt" timestamptz,
  "InvitedBy" uuid REFERENCES "Users"(id),
  "LastLoginAt" timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE "Roles" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" text NOT NULL UNIQUE,             -- "Super Admin", "Admin", "Receptionist", "Practitioner", custom...
  "Description" text,
  "IsSystem" boolean NOT NULL DEFAULT false, -- true for Super Admin — blocks delete/edit of the role itself
  created_at timestamptz DEFAULT now()
);

CREATE TABLE "Permissions" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Module" text NOT NULL,                  -- see module list below
  "Action" text NOT NULL,                  -- View | Create | Update | Delete | Manage
  created_at timestamptz DEFAULT now(),
  UNIQUE ("Module", "Action")
);

CREATE TABLE "Role_Permissions" (
  role_id uuid NOT NULL REFERENCES "Roles"(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES "Permissions"(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE "User_Roles" (
  user_id uuid NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES "Roles"(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
```

`Practitioners.Role` (the old free-text field) is left in place but stops being read
for access decisions — removing it is a separate future cleanup, not part of this
change.

## 4. Permission Modules (derived from the actual app surface)

One row per module × action in `Permissions`. Actions: `View`, `Create`, `Update`,
`Delete`, `Manage` (Manage = full control, including the module's own settings).

| Module | Maps to |
|---|---|
| `dashboard` | `/` |
| `calendar` | `/calendar`, `calendar/*` routes |
| `pending_bookings` | `/pending-bookings`, `booking-completions`, `booking/complete` |
| `customers` | `/customers`, `customers` route |
| `rules` | `/rules`, `/rules/[id]`, `rule*` routes |
| `campaigns` | `/campaigns`, `/campaigns/[id]`, `campaigns*` routes |
| `activity` | `/activity` |
| `email_logs` | `/email-logs` |
| `flows` | `/flows`, `admin/run-flow` |
| `checkout` | `/checkout` |
| `settings` | `/settings`, `settings/*` routes |
| `credits` | `credits/*` routes |
| `voice_chat` | `chat`, `voice/*` routes (system-level, not typically end-user-role-gated) |
| `rbac` | Roles/Permissions/Users management screens themselves — **Super Admin only, always** |

Cron routes (`cron/*`) and the Discord/webhook routes stay protected by their
existing `CRON_SECRET`/signature checks, not user RBAC — they're not user-triggered.

## 5. Enforcement Strategy

- **Middleware** (`middleware.ts`, new): validates the Supabase Auth session on every
  request to `(admin)` routes and API routes; redirects unauthenticated requests to
  `/login`.
- **Server-side guard helper** (new, e.g. `requirePermission(module, action)`): called
  at the top of every API route handler; returns 403 JSON if the caller's roles don't
  grant it. This is the actual authority — never trust the UI alone.
- **Frontend**: `useAuth()`/`usePermissions()` hook (replacing the current
  localStorage mock) hides nav items/buttons the user can't use, and pages render a
  **403 Access Denied** view instead of their content when a direct URL visit isn't
  permitted.
- **Session/permission refresh**: changing a user's roles or a role's permissions
  invalidates their cached permission set immediately (short server-side cache with
  explicit invalidation, same pattern already used for clinic hours/timezone caching
  in this codebase) — no need to force a full logout, just a refetch.

## 6. User Creation & Login Flow

1. Super Admin creates a user in the Users screen: **name, email, a temporary
   password they set directly** (not a magic link), and one or more roles.
2. Server creates the Supabase Auth user with that temporary password (via
   Supabase's Admin API), and stores the `Users` row with `Status = 'Active'`,
   `MustChangePassword = true`, plus the role assignment(s) in `User_Roles`.
3. Email sent via the existing provider chain (`sendRetentionEmail` — already
   supports SendGrid/Gmail/Resend fallback) containing the email, the temporary
   password, assigned role(s), and login instructions.
4. On first login with those credentials, the app forces a password-change screen
   before allowing access anywhere else; `MustChangePassword` flips to `false` once
   completed.

## 7. Admin UI

Modeled on the reference screenshots provided (staging.mayfairhighstreet.com/admin
pattern) — a dedicated **RBAC Management** page, not spread across Settings:

- New sidebar item: **RBAC Management**, visible only to roles with the `rbac`
  permission (Super Admin always has it).
- Two tabs on that page:
  - **Roles & Permissions** — a "System Roles" table (Role name, Status badge
    [`System` for built-ins like Super Admin vs `Custom` for anything the Super Admin
    creates], number of permissions assigned, Edit/Delete actions) with an **"Add
    Role"** button top-right. Editing a role opens the permission matrix (modules ×
    View/Create/Update/Delete/Manage) to check on/off.
  - **User Role Assignments** — list of Users (name, email, status, assigned
    role(s)), with actions to create a user (the form in §6), change their role(s),
    resend credentials, or disable them.
- System roles (`IsSystem = true`) can't be deleted and their permissions can't be
  edited — matches the reference UI's implied distinction between `System` and
  `Custom` status badges.

## 8. Phased Workflow & ETA

| Phase | Work | Est. sessions |
|---|---|---|
| 1 | Supabase Auth wiring, login page, middleware skeleton (not yet enforcing) | 1 |
| 2 | Schema migration (5 tables above), seed Super Admin + default roles/permissions | 1 |
| 3 | Permission engine + `requirePermission` guard, tested in isolation | 1 |
| 4 | Retrofit routes/pages module-by-module, verifying after each batch; middleware + nav enforcement enabled last | 2–3 |
| 5 | Admin UI: Roles, Permissions, Users screens | 1 |
| 6 | Invitation email flow + forced password change | 1 |
| 7 | Full regression pass: booking, voice, chat, settings, all cron jobs, under live enforcement | 1 |

**Total: 5–8 focused sessions.**

## 9. Rollout Checkpoints (explicit stop-and-confirm points)

- **Before Phase 4's global middleware/nav enforcement goes live** — this is the
  moment current access could be affected if a role/permission is misconfigured.
  Confirm with the user first.
- **Before seeding the first Super Admin account** — confirm the actual email/identity
  to use, since this account can never be locked out by design.

## 10. Out of Scope for This Pass

- Removing `Practitioners.Role` (leave as unread legacy field).
- Dropping the stale lowercase `bookingcompletions` table (separate housekeeping
  item, unrelated to RBAC — flagged, not actioned here).
- Rate limiting / brute-force login protection (worth a follow-up, not blocking RBAC
  itself).
