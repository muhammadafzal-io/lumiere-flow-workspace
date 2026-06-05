"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { UserRole } from "./permissions";

type AuthContextType = {
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole>(() => {
    if (typeof window === "undefined") return "admin";
    const saved = localStorage.getItem("lumiere.userRole") as UserRole | null;
    if (saved && ["admin", "receptionist", "practitioner"].includes(saved)) {
      return saved;
    }
    return "admin";
  });

  useEffect(() => {
    localStorage.setItem("lumiere.userRole", userRole);
  }, [userRole]);

  return <AuthContext.Provider value={{ userRole, setUserRole }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
