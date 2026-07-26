/**
 * Data access for the RBAC Phase 5 admin UI (Roles & Permissions, User Role
 * Assignments). Kept separate from src/lib/rbac/permissions.ts, which is the
 * read path every request hits — this file is the write/management path, only
 * ever reached through /api/rbac/* routes gated on the `rbac` permission.
 */
import "server-only";
import { getSupabase } from "@/lib/supabase";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { sendWhatsAppNotification } from "@/lib/integrations/whatsapp-send";
import { whatsappTemplates } from "@/lib/messaging/whatsapp-templates";
import { invalidateUserPermissionsCache } from "@/lib/rbac/permissions";
import { getClinicConfig } from "@/lib/clinic-config";
import { Console } from "console";

export interface PermissionRow {
  id: string;
  module: string;
  action: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
}

export interface RoleDetail extends RoleSummary {
  permissionIds: string[];
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  roles: { id: string; name: string }[];
}

export interface CreateUserResult extends UserSummary {
  /** Whether the invite email actually left the server — the account is created either way. */
  emailSent: boolean;
  emailError?: string;
  /** Whether the invite WhatsApp message actually left the server — only attempted if a phone was given. */
  whatsappSent: boolean;
  whatsappError?: string;
}

/** The `rbac` module can never be granted to anything but the Super Admin system role. */
const PROTECTED_MODULE = "rbac";

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function listPermissions(): Promise<PermissionRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("Permissions")
    .select("id,Module,Action")
    .order("Module")
    .order("Action");
  if (error) throw new Error(`listPermissions: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, module: r.Module, action: r.Action }));
}

export async function listRoles(): Promise<RoleSummary[]> {
  const sb = getSupabase();
  const { data: roles, error } = await sb
    .from("Roles")
    .select("id,Name,Description,IsSystem")
    .order("IsSystem", { ascending: false })
    .order("Name");
  if (error) throw new Error(`listRoles: ${error.message}`);

  const { data: rolePerms } = await sb.from("Role_Permissions").select("role_id");
  const { data: userRoles } = await sb.from("User_Roles").select("role_id");

  const permCounts = new Map<string, number>();
  for (const rp of rolePerms ?? []) {
    permCounts.set(rp.role_id, (permCounts.get(rp.role_id) ?? 0) + 1);
  }
  const userCounts = new Map<string, number>();
  for (const ur of userRoles ?? []) {
    userCounts.set(ur.role_id, (userCounts.get(ur.role_id) ?? 0) + 1);
  }

  return (roles ?? []).map((r) => ({
    id: r.id,
    name: r.Name,
    description: r.Description,
    isSystem: r.IsSystem,
    permissionCount: permCounts.get(r.id) ?? 0,
    userCount: userCounts.get(r.id) ?? 0,
  }));
}

export async function getRole(roleId: string): Promise<RoleDetail | null> {
  const sb = getSupabase();
  const { data: role, error } = await sb
    .from("Roles")
    .select("id,Name,Description,IsSystem")
    .eq("id", roleId)
    .maybeSingle();
  if (error) throw new Error(`getRole: ${error.message}`);
  if (!role) return null;

  const { data: rolePerms } = await sb
    .from("Role_Permissions")
    .select("permission_id")
    .eq("role_id", roleId);
  const { data: userRoles } = await sb.from("User_Roles").select("user_id").eq("role_id", roleId);

  return {
    id: role.id,
    name: role.Name,
    description: role.Description,
    isSystem: role.IsSystem,
    permissionCount: rolePerms?.length ?? 0,
    userCount: userRoles?.length ?? 0,
    permissionIds: (rolePerms ?? []).map((rp) => rp.permission_id),
  };
}

export async function createRole(name: string, description: string): Promise<RoleSummary> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("Roles")
    .insert({ Name: name, Description: description || null, IsSystem: false })
    .select("id,Name,Description,IsSystem")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    name: data.Name,
    description: data.Description,
    isSystem: data.IsSystem,
    permissionCount: 0,
    userCount: 0,
  };
}

export async function updateRole(
  roleId: string,
  fields: { name?: string; description?: string; permissionIds?: string[] },
): Promise<RoleDetail> {
  const sb = getSupabase();
  const { data: existing, error: fetchErr } = await sb
    .from("Roles")
    .select("id,IsSystem")
    .eq("id", roleId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error("Role not found");
  if (existing.IsSystem) throw new Error("System roles cannot be modified");

  if (fields.name !== undefined || fields.description !== undefined) {
    const patch: Record<string, unknown> = {};
    if (fields.name !== undefined) patch.Name = fields.name;
    if (fields.description !== undefined) patch.Description = fields.description || null;
    const { error } = await sb.from("Roles").update(patch).eq("id", roleId);
    if (error) throw new Error(error.message);
  }

  if (fields.permissionIds !== undefined) {
    // The `rbac` module is Super Admin-only, always — strip it out even if somehow submitted.
    const allPerms = await listPermissions();
    const protectedIds = new Set(
      allPerms.filter((p) => p.module === PROTECTED_MODULE).map((p) => p.id),
    );
    const safeIds = fields.permissionIds.filter((id) => !protectedIds.has(id));

    const { error: delErr } = await sb.from("Role_Permissions").delete().eq("role_id", roleId);
    if (delErr) throw new Error(delErr.message);
    if (safeIds.length > 0) {
      const { error: insErr } = await sb
        .from("Role_Permissions")
        .insert(safeIds.map((permission_id) => ({ role_id: roleId, permission_id })));
      if (insErr) throw new Error(insErr.message);
    }
    invalidateUserPermissionsCache();
  }

  const updated = await getRole(roleId);
  if (!updated) throw new Error("Role not found after update");
  return updated;
}

export async function deleteRole(roleId: string): Promise<void> {
  const sb = getSupabase();
  const { data: existing, error: fetchErr } = await sb
    .from("Roles")
    .select("id,IsSystem")
    .eq("id", roleId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error("Role not found");
  if (existing.IsSystem) throw new Error("System roles cannot be deleted");

  const { error } = await sb.from("Roles").delete().eq("id", roleId);
  if (error) throw new Error(error.message);
  invalidateUserPermissionsCache();
}

export async function listUsers(): Promise<UserSummary[]> {
  const sb = getSupabase();
  const { data: users, error } = await sb
    .from("Users")
    .select("id,Name,Email,Phone,Status,MustChangePassword,LastLoginAt")
    .order("Name");
  if (error) throw new Error(`listUsers: ${error.message}`);

  const { data: userRoles } = await sb.from("User_Roles").select("user_id,Roles(id,Name)");
  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of userRoles ?? []) {
    const r = row as unknown as { user_id: string; Roles: { id: string; Name: string } | null };
    if (!r.Roles) continue;
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push({ id: r.Roles.id, name: r.Roles.Name });
    rolesByUser.set(r.user_id, list);
  }

  return (users ?? []).map((u) => ({
    id: u.id,
    name: u.Name,
    email: u.Email,
    phone: u.Phone ?? null,
    status: u.Status,
    mustChangePassword: u.MustChangePassword,
    lastLoginAt: u.LastLoginAt,
    roles: rolesByUser.get(u.id) ?? [],
  }));
}

export async function createUser(params: {
  name: string;
  email: string;
  phone?: string;
  tempPassword: string;
  roleIds: string[];
  invitedBy: string | null;
}): Promise<CreateUserResult> {
  const sb = getSupabase();

  const { data: created, error: authErr } = await sb.auth.admin.createUser({
    email: params.email,
    password: params.tempPassword,
    email_confirm: true,
  });
  if (authErr || !created.user) {
    throw new Error(authErr?.message ?? "Failed to create login");
  }

  const { error: rowErr } = await sb.from("Users").insert({
    id: created.user.id,
    Name: params.name,
    Email: params.email,
    Phone: params.phone?.trim() || null,
    Status: "Active",
    MustChangePassword: true,
    InvitedAt: new Date().toISOString(),
    InvitedBy: params.invitedBy,
  });
  if (rowErr) {
    await sb.auth.admin.deleteUser(created.user.id);
    throw new Error(rowErr.message);
  }

  if (params.roleIds.length > 0) {
    const { error: roleErr } = await sb
      .from("User_Roles")
      .insert(params.roleIds.map((role_id) => ({ user_id: created.user.id, role_id })));
    if (roleErr) throw new Error(roleErr.message);
  }

  const { clinicName } = await getClinicConfig();
  let emailSent = false;
  let emailError: string | undefined;
  try {
    const outcome = await sendRetentionEmail({
      to: params.email,
      subject: `Your ${clinicName} staff account`,
      flowType: "general",
      logMeta: {
        category: "general",
        triggerType: "system",
        clientId: created.user.id,
        clientName: params.name,
      },
      text: [
        `Hi ${params.name},`,
        ``,
        `An account has been created for you on the ${clinicName} admin dashboard.`,
        ``,
        `Email: ${params.email}`,
        `Temporary password: ${params.tempPassword}`,
        ``,
        `Sign in and you'll be asked to set your own password before doing anything else.`,
        `— The ${clinicName} Team`,
      ].join("\n"),
    });
    emailSent = outcome.sent;
    emailError = outcome.sent ? undefined : outcome.error;
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
  }
  if (!emailSent) {
    console.error(`[rbac] invite email to ${params.email} was not sent:`, emailError);
  }

  // WhatsApp is independent of email — only attempted if a phone was given, never blocks or is
  // blocked by the email result. Deliberately doesn't include the temp password (unlike email) —
  // just points them to check email for login details.
  let whatsappSent = false;
  let whatsappError: string | undefined;
  const invitePhone = params.phone?.trim();
  if (invitePhone) {
    const outcome = await sendWhatsAppNotification({
      to: invitePhone,
      text: whatsappTemplates.teamInvite({ name: params.name, clinicName }),
      logMeta: {
        category: "general",
        triggerType: "system",
        clientId: created.user.id,
        clientName: params.name,
      },
    });
    whatsappSent = outcome.sent;
    whatsappError = outcome.sent ? undefined : outcome.error;
    if (!whatsappSent) {
      console.error(`[rbac] invite whatsapp to ${invitePhone} was not sent:`, whatsappError);
    }
  }

  const users = await listUsers();
  const user = users.find((u) => u.id === created.user.id);
  if (!user) throw new Error("User created but could not be reloaded");
  return { ...user, emailSent, emailError, whatsappSent, whatsappError };
}


export async function updateUserRoles(userId: string, roleIds: string[]): Promise<void> {
  const sb = getSupabase();
  const { error: delErr } = await sb.from("User_Roles").delete().eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);
  if (roleIds.length > 0) {
    const { error: insErr } = await sb
      .from("User_Roles")
      .insert(roleIds.map((role_id) => ({ user_id: userId, role_id })));
    if (insErr) throw new Error(insErr.message);
  }
  invalidateUserPermissionsCache(userId);
}

/** Permanently removes a user: role assignments, the Users row, and the Supabase Auth account. */
export async function deleteUser(userId: string): Promise<void> {
  const sb = getSupabase();

  const { error: roleErr } = await sb.from("User_Roles").delete().eq("user_id", userId);
  if (roleErr) throw new Error(roleErr.message);

  const { error: rowErr } = await sb.from("Users").delete().eq("id", userId);
  if (rowErr) throw new Error(rowErr.message);

  const { error: authErr } = await sb.auth.admin.deleteUser(userId);
  if (authErr) throw new Error(authErr.message);

  invalidateUserPermissionsCache(userId);
}

export async function setUserStatus(userId: string, status: "Active" | "Disabled"): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("Users").update({ Status: status }).eq("id", userId);
  if (error) throw new Error(error.message);

  // Defense in depth: ban at the Supabase Auth layer too, not just our own
  // permission check, so a disabled account can't even start a session.
  await sb.auth.admin.updateUserById(userId, {
    ban_duration: status === "Disabled" ? "876000h" : "none",
  });

  invalidateUserPermissionsCache(userId);
}

export async function resendCredentials(
  userId: string,
  email: string,
  name: string,
): Promise<void> {
  const sb = getSupabase();
  const tempPassword = randomPassword();

  const { error: authErr } = await sb.auth.admin.updateUserById(userId, { password: tempPassword });
  if (authErr) throw new Error(authErr.message);

  const { error } = await sb.from("Users").update({ MustChangePassword: true }).eq("id", userId);
  if (error) throw new Error(error.message);

  const { clinicName } = await getClinicConfig();
  const outcome = await sendRetentionEmail({
    to: email,
    subject: `Your ${clinicName} staff account — new temporary password`,
    flowType: "general",
    logMeta: {
      category: "general",
      triggerType: "manual",
      clientId: userId,
      clientName: name,
    },
    text: [
      `Hi ${name},`,
      ``,
      `Your ${clinicName} admin dashboard password has been reset.`,
      ``,
      `Email: ${email}`,
      `Temporary password: ${tempPassword}`,
      ``,
      `Sign in and you'll be asked to set your own password before doing anything else.`,
      `— The ${clinicName} Team`,
    ].join("\n"),
  });
  if (!outcome.sent) {
    throw new Error(outcome.error ?? "Email delivery failed");
  }

  invalidateUserPermissionsCache(userId);
}
