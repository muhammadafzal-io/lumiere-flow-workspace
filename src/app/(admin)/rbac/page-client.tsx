"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshCw, Plus, MoreHorizontal, Loader2, ShieldCheck } from "lucide-react";
import { AccessGate } from "@/components/rbac/AccessGate";
import { toast } from "sonner";

type PermissionAction = "View" | "Create" | "Update" | "Delete" | "Manage";
const ACTIONS: PermissionAction[] = ["View", "Create", "Update", "Delete", "Manage"];

interface PermissionRow {
  id: string;
  module: string;
  action: PermissionAction;
}

interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
}

interface RoleDetail extends RoleSummary {
  permissionIds: string[];
}

interface UserSummary {
  id: string;
  name: string;
  email: string;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  roles: { id: string; name: string }[];
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  calendar: "Calendar",
  pending_bookings: "Pending Bookings",
  customers: "Customers",
  forms: "Forms",
  rules: "Rules",
  campaigns: "Campaigns",
  activity: "Activity Log",
  email_logs: "Email Log",
  flows: "Retention Flows",
  checkout: "Checkout",
  settings: "Settings",
  credits: "Credits",
  voice_chat: "Voice / Chat",
};

/** rbac itself is Super Admin-only, always — never shown as an editable row. */
const HIDDEN_MODULES = new Set(["rbac"]);

function moduleLabel(m: string) {
  return MODULE_LABELS[m] ?? m;
}

function randomTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function RoleBadge({ isSystem }: { isSystem: boolean }) {
  return isSystem ? (
    <Badge variant="secondary">System</Badge>
  ) : (
    <Badge variant="outline">Custom</Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "Active" ? (
    <Badge className="bg-success/10 text-success border-success/20" variant="outline">
      Active
    </Badge>
  ) : (
    <Badge className="bg-destructive/10 text-destructive border-destructive/20" variant="outline">
      Disabled
    </Badge>
  );
}

function CreateRoleDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rbac/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create role");
      toast.success("Role created");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add role</DialogTitle>
          <DialogDescription>
            Create a custom role, then open it to grant module permissions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Role name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolePermissionMatrixDialog({
  roleId,
  allPermissions,
  onOpenChange,
  onSaved,
}: {
  roleId: string | null;
  allPermissions: PermissionRow[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [granted, setGranted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!roleId) return;
    setLoading(true);
    fetch(`/api/rbac/roles/${roleId}`)
      .then((r) => r.json())
      .then((data) => {
        setRole(data.role ?? null);
        setGranted(new Set<string>(data.role?.permissionIds ?? []));
      })
      .catch(() => toast.error("Failed to load role"))
      .finally(() => setLoading(false));
  }, [roleId]);

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPermissions) {
      if (!HIDDEN_MODULES.has(p.module)) set.add(p.module);
    }
    return [...set].sort();
  }, [allPermissions]);

  const permissionId = (module: string, action: PermissionAction) =>
    allPermissions.find((p) => p.module === module && p.action === action)?.id;

  const toggle = (module: string, action: PermissionAction) => {
    const id = permissionId(module, action);
    if (!id) return;
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!role) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rbac/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionIds: [...granted] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save permissions");
      toast.success("Permissions updated");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const readOnly = role?.isSystem ?? false;

  return (
    <Dialog open={!!roleId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? role.name : "Role permissions"}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "System roles have full access and can't be edited."
              : "Check every action this role should be allowed to perform, per module."}
          </DialogDescription>
        </DialogHeader>

        {loading || !role ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Module</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="py-2 px-2 font-medium text-center">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{moduleLabel(m)}</td>
                    {ACTIONS.map((a) => {
                      const id = permissionId(m, a);
                      return (
                        <td key={a} className="py-2 px-2 text-center">
                          {id ? (
                            <Checkbox
                              checked={granted.has(id)}
                              onCheckedChange={() => toggle(m, a)}
                              disabled={readOnly}
                              className="mx-auto"
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!readOnly && (
            <Button onClick={save} disabled={saving || loading}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save permissions
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolesTab({
  roles,
  permissions,
  loading,
  reload,
}: {
  roles: RoleSummary[];
  permissions: PermissionRow[];
  loading: boolean;
  reload: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RoleSummary | null>(null);
  const load = reload;

  const removeRole = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/rbac/roles/${deleting.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete role");
      toast.success("Role deleted");
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete role");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          System roles ship with full access and can&apos;t be edited or deleted. Custom roles start
          with zero permissions until granted here.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add role
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Permissions</th>
              <th className="px-4 py-2.5 font-medium">Users</th>
              <th className="px-4 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No roles yet.
                </td>
              </tr>
            ) : (
              roles.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setEditingRoleId(r.id)}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.name}</div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground">{r.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <RoleBadge isSystem={r.isSystem} />
                  </td>
                  <td className="px-4 py-2.5">{r.permissionCount}</td>
                  <td className="px-4 py-2.5">{r.userCount}</td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingRoleId(r.id)}>
                          {r.isSystem ? "View permissions" : "Edit permissions"}
                        </DropdownMenuItem>
                        {!r.isSystem && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleting(r)}
                          >
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateRoleDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
      <RolePermissionMatrixDialog
        roleId={editingRoleId}
        allPermissions={permissions}
        onOpenChange={(v) => !v && setEditingRoleId(null)}
        onSaved={load}
      />

      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role?</DialogTitle>
            <DialogDescription>
              {deleting?.userCount
                ? `${deleting.userCount} user(s) currently hold "${deleting.name}" — they'll lose whatever access this role grants.`
                : `This will permanently delete "${deleting?.name}".`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={removeRole}>
              Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RolePicker({
  roles,
  selected,
  onChange,
}: {
  roles: RoleSummary[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
      {roles.map((r) => (
        <label
          key={r.id}
          className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
        >
          <Checkbox
            checked={selected.has(r.id)}
            onCheckedChange={() => {
              const next = new Set(selected);
              if (next.has(r.id)) next.delete(r.id);
              else next.add(r.id);
              onChange(next);
            }}
          />
          {r.name}
        </label>
      ))}
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roles: RoleSummary[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setTempPassword(randomTempPassword());
      setRoleIds(new Set());
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim() || !email.trim() || tempPassword.length < 8) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rbac/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          tempPassword,
          roleIds: [...roleIds],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      if (data.user?.emailSent) {
        toast.success("User created — invite email sent");
      } else {
        toast.error(
          `User created, but the invite email could not be sent${data.user?.emailError ? ` (${data.user.emailError})` : ""}. Use "Resend" from the user list once email delivery is fixed.`,
        );
      }
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            They&apos;ll be emailed this temporary password and prompted to set their own on first
            sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Temporary password</Label>
            <div className="flex gap-2 mt-1.5">
              <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
              <Button
                type="button"
                variant="outline"
                onClick={() => setTempPassword(randomTempPassword())}
              >
                Generate
              </Button>
            </div>
          </div>
          <div>
            <Label>Roles</Label>
            <div className="mt-1.5">
              <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving || !name.trim() || !email.trim() || tempPassword.length < 8}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeRolesDialog({
  user,
  roles,
  onOpenChange,
  onSaved,
}: {
  user: UserSummary | null;
  roles: RoleSummary[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setRoleIds(new Set(user.roles.map((r) => r.id)));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rbac/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds: [...roleIds] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update roles");
      toast.success("Roles updated");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update roles");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? `Roles for ${user.name}` : "Roles"}</DialogTitle>
        </DialogHeader>
        <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersTab({ roles }: { roles: RoleSummary[] }) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRolesFor, setEditingRolesFor] = useState<UserSummary | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rbac/users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleStatus = async (u: UserSummary) => {
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/rbac/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: u.status === "Active" ? "Disabled" : "Active" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update status");
      toast.success(u.status === "Active" ? "User disabled" : "User re-enabled");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const resend = async (u: UserSummary) => {
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/rbac/users/${u.id}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to resend credentials");
      toast.success("New temporary password emailed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend credentials");
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async () => {
    if (!deletingUser) return;
    try {
      const res = await fetch(`/api/rbac/users/${deletingUser.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete user");
      toast.success("User deleted");
      setDeletingUser(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Every login on this dashboard is a Supabase Auth account tied to one row here.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add user
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Roles</th>
              <th className="px-4 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{u.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={u.status} />
                    {u.mustChangePassword && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        pending first sign-in
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No roles</span>
                      ) : (
                        u.roles.map((r) => (
                          <Badge key={r.id} variant="outline" className="text-[11px]">
                            {r.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={busyId === u.id}
                        >
                          {busyId === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingRolesFor(u)}>
                          Change roles
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resend(u)}>
                          Resend credentials
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={u.status === "Active" ? "text-destructive" : ""}
                          onClick={() => toggleStatus(u)}
                        >
                          {u.status === "Active" ? "Disable" : "Re-enable"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeletingUser(u)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={roles}
        onCreated={load}
      />
      <ChangeRolesDialog
        user={editingRolesFor}
        roles={roles}
        onOpenChange={(v) => !v && setEditingRolesFor(null)}
        onSaved={load}
      />
      <Dialog open={!!deletingUser} onOpenChange={(v) => !v && setDeletingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
            <DialogDescription>
              This will permanently delete {deletingUser?.name}'s account ({deletingUser?.email})
              and remove their access. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingUser(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={removeUser}>
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RbacPage() {
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [checking, setChecking] = useState(true);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  const loadRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const res = await fetch("/api/rbac/roles");
      const data = await res.json();
      setRoles(data.roles ?? []);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/rbac/roles")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          setAccessDenied(res.status);
          return null;
        }
        return res.json();
      })
      .then(async (data) => {
        if (!data) return;
        setRoles(data.roles ?? []);
        setLoadingRoles(false);
        const permsRes = await fetch("/api/rbac/permissions");
        const permsData = await permsRes.json();
        setPermissions(permsData.permissions ?? []);
      })
      .catch(() => toast.error("Failed to load roles"))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> RBAC Management
        </h1>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> RBAC Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Roles, permissions, and staff logins. Changes here take effect everywhere within seconds.
        </p>
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
          <TabsTrigger value="users">User Role Assignments</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="mt-4">
          <RolesTab
            roles={roles}
            permissions={permissions}
            loading={loadingRoles}
            reload={loadRoles}
          />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab roles={roles} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
