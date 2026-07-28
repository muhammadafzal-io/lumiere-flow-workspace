"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { ClientChannelsSidebar } from "@/components/ClientChannelsPanel";
import { useCurrentUser } from "@/lib/current-user-context";
import { NAV_ITEMS } from "@/lib/nav-items";

export function AppSidebar() {
  const path = usePathname();
  const { clinicName, can } = useCurrentUser();
  const displayName = clinicName ?? "Lumière";
  const isActive = (url: string) => (url === "/" ? path === "/" : path.startsWith(url));

  const visibleItems = NAV_ITEMS.filter((item) => can(item.module));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
            {displayName.trim().charAt(0).toUpperCase() || "L"}
          </div>
          <span className="text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            {displayName}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex flex-col">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((it) => (
                <SidebarMenuItem key={it.url}>
                  <SidebarMenuButton asChild isActive={isActive(it.url)} tooltip={it.title}>
                    <Link href={it.url} className="flex items-center gap-2.5">
                      <it.icon className="h-4 w-4" />
                      <span>{it.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <ClientChannelsSidebar />
      </SidebarContent>
      <SidebarFooter className="border-t p-2 group-data-[collapsible=icon]:hidden">
        <p className="text-[10px] text-center text-muted-foreground px-2">
          Links open in a new tab for client-facing tools.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
