"use client";

import { useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/lib/permissions";

const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: "admin", label: "Admin", color: "bg-destructive" },
  { value: "receptionist", label: "Receptionist", color: "bg-blue-500" },
  { value: "practitioner", label: "Practitioner", color: "bg-green-500" },
];

export function TopBar() {
  const { userRole, setUserRole } = useAuth();
  const roleInfo = ROLES.find((r) => r.value === userRole);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById("global-search") as HTMLInputElement | null;
        el?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="h-14 border-b bg-background flex items-center gap-3 px-4 sticky top-0 z-30">
      <SidebarTrigger />
      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="global-search"
            placeholder="Search customers, rules, activity…"
            className="pl-9 h-9 bg-secondary/60 border-transparent focus-visible:bg-background"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium text-white ${roleInfo?.color || "bg-muted"}`}
              >
                {userRole[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium hidden sm:inline">{roleInfo?.label}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Switch Role (Demo)
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ROLES.map((role) => (
              <DropdownMenuItem key={role.value} onClick={() => setUserRole(role.value)}>
                <div className="flex items-center gap-2 w-full">
                  <div className={`h-4 w-4 rounded-full ${role.color}`} />
                  <span className="text-sm">{role.label}</span>
                  {userRole === role.value && <span className="ml-auto text-xs">✓</span>}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
