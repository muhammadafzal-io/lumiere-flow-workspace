"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, LogOut } from "lucide-react";
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
import { useCurrentUser } from "@/lib/current-user-context";
import { getSupabaseBrowser } from "@/lib/supabase-auth/client";

function initialsFor(name: string, email: string): string {
  const source = name?.trim() || email;
  return source ? source[0]!.toUpperCase() : "?";
}

export function TopBar() {
  const { user } = useCurrentUser();
  const router = useRouter();

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

  const logout = async () => {
    await getSupabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  };

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
              <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium text-white bg-primary">
                {initialsFor(user?.name ?? "", user?.email ?? "")}
              </div>
              <span className="text-sm font-medium hidden sm:inline max-w-[160px] truncate">
                {user?.name || user?.email || "Account"}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
              {user?.email ?? "Signed in"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
