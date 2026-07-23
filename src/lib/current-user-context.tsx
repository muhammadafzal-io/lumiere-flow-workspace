"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  status: string;
}

interface CurrentUserContextType {
  user: CurrentUser | null;
  loading: boolean;
  /** 401 = not signed in, 200-ish = loaded (whether or not a user record exists) */
  unauthenticated: boolean;
  refetch: () => void;
}

const CurrentUserContext = createContext<CurrentUserContextType | undefined>(undefined);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        setUnauthenticated(true);
        setUser(null);
        return;
      }
      setUnauthenticated(false);
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <CurrentUserContext.Provider value={{ user, loading, unauthenticated, refetch: load }}>
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
