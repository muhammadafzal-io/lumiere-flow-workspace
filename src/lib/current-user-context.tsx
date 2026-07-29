"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { hasPermissionKey, type PermissionAction } from "@/lib/rbac/shared";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  status: string;
}

interface CurrentUserContextType {
  user: CurrentUser | null;
  clinicName: string | null;
  /** Clinic's configured IANA timezone (e.g. "America/Chicago") — use this, not a
   * hardcoded zone, when formatting any timestamp for display. Null until loaded. */
  timezone: string | null;
  loading: boolean;
  /** 401 = not signed in, 200-ish = loaded (whether or not a user record exists) */
  unauthenticated: boolean;
  /** True if the signed-in user holds `module:action` (action defaults to "View" — the
   * action every page's own initial data fetch actually requires). Same DB-sourced
   * permission set and predicate (`hasPermissionKey`) the API guard evaluates. */
  can: (module: string, action?: PermissionAction) => boolean;
  refetch: () => void;
}

const CurrentUserContext = createContext<CurrentUserContextType | undefined>(undefined);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        setUnauthenticated(true);
        setUser(null);
        setPermissions(new Set());
        return;
      }
      setUnauthenticated(false);
      if (!res.ok) {
        setUser(null);
        setPermissions(new Set());
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
      setClinicName(data.clinicName ?? null);
      setTimezone(data.timezone ?? null);
      setPermissions(new Set<string>(data.permissions ?? []));
    } catch {
      setUser(null);
      setPermissions(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const can = useCallback(
    (module: string, action: PermissionAction = "View") =>
      hasPermissionKey(permissions, module, action),
    [permissions],
  );

  return (
    <CurrentUserContext.Provider
      value={{ user, clinicName, timezone, loading, unauthenticated, can, refetch: load }}
    >
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (!context) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider");
  }
  return context;
}
