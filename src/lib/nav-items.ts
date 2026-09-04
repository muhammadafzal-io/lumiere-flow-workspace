import {
  LayoutDashboard,
  Zap,
  Users,
  ScrollText,
  Mail,
  Settings as SettingsIcon,
  Calendar as CalendarIcon,
  Clock,
  ShieldCheck,
  FileText,
  ListPlus,
  TrendingUp,
  Repeat,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** RBAC module (`src/lib/rbac/permissions.ts`) that gates this page's own data fetch —
   * same module every route under it checks via `requireApiPermission`. Single source of
   * truth shared by the sidebar (filters what's shown) and AuthGate (redirects away from
   * "/" when the user can't see the Dashboard). */
  module: string;
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, module: "dashboard" },
  { title: "Rules & Campaigns", url: "/rules", icon: Zap, module: "rules" },
  { title: "Flows", url: "/flows", icon: Repeat, module: "flows" },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon, module: "calendar" },
  {
    title: "Pending Bookings",
    url: "/pending-bookings",
    icon: Clock,
    module: "pending_bookings",
  },
  { title: "Waitlist", url: "/waitlist", icon: ListPlus, module: "waitlist" },
  {
    title: "Offer Performance",
    url: "/offer-performance",
    icon: TrendingUp,
    module: "offer_performance",
  },
  { title: "Customers", url: "/customers", icon: Users, module: "customers" },
  { title: "Forms", url: "/forms", icon: FileText, module: "forms" },
  { title: "Activity Log", url: "/activity", icon: ScrollText, module: "activity" },
  { title: "Email Log", url: "/email-logs", icon: Mail, module: "email_logs" },
  { title: "Settings", url: "/settings", icon: SettingsIcon, module: "settings" },
  { title: "RBAC Management", url: "/rbac", icon: ShieldCheck, module: "rbac" },
];
