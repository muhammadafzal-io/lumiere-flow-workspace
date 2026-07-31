"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
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

  const logout = async () => {
    await getSupabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="h-14 border-b bg-background flex items-center gap-3 px-4 sticky top-0 z-30">
      <SidebarTrigger />
      <div className="flex-1" />
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
