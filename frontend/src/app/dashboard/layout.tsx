"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Bot,
  Activity,
  CheckSquare,
  BarChart2,
  Settings,
  Building2,
  Bell,
  Search,
  Plus,
  FileText,
  Briefcase,
  Workflow,
  LogOut,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import AIChatBubble from "@/components/shared/AIChatBubble";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", exact: true },
  { icon: Users, label: "Contacts", href: "/dashboard/contacts" },
  { icon: GitBranch, label: "Pipeline", href: "/dashboard/pipeline" },
  { icon: Bot, label: "AI Chat", href: "/dashboard/chat" },
  { icon: Activity, label: "Activities", href: "/dashboard/activities" },
  { icon: CheckSquare, label: "Tasks", href: "/dashboard/tasks" },
  { icon: BarChart2, label: "Reports", href: "/dashboard/analytics" },
  { icon: Workflow, label: "Workflows", href: "/dashboard/workflows" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/contacts": "Contacts",
  "/dashboard/pipeline": "Pipeline",
  "/dashboard/chat": "AI Chat",
  "/dashboard/activities": "Activities",
  "/dashboard/tasks": "Tasks",
  "/dashboard/analytics": "Reports",
  "/dashboard/workflows": "Workflows",
  "/dashboard/settings": "Settings",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const base = "/" + pathname.split("/").slice(1, 3).join("/");
  const pageTitle = pageTitles[base] || "CloAgent";

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "A"
    : "A";

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ backgroundColor: "#F5F7FA", fontFamily: "'Inter', sans-serif", minWidth: 1200 }}
    >
      {/* Sidebar — dark, icon-only, 72px */}
      <aside
        className="flex flex-col h-full w-[72px] shrink-0"
        style={{ backgroundColor: "#0F1E36" }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center h-16 border-b border-white/10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            <Building2 size={20} className="text-white" />
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col items-center gap-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer group relative ${
                  active ? "bg-[#0EA5E9]/20" : "hover:bg-white/10"
                }`}
              >
                <item.icon
                  size={20}
                  className={active ? "text-[#0EA5E9]" : "text-white/50 group-hover:text-white/80"}
                />
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                    style={{ backgroundColor: "#0EA5E9" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User account menu */}
        <div className="flex flex-col items-center pb-4 gap-2 relative">
          <button
            onClick={() => setAccountMenuOpen((v) => !v)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold hover:ring-2 hover:ring-white/30 transition-all"
            style={{ backgroundColor: "#1E3A5F" }}
            title="Account"
          >
            {initials}
          </button>

          {accountMenuOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAccountMenuOpen(false)}
              />
              {/* Dropdown (opens upward, anchored to left edge) */}
              <div
                className="absolute bottom-12 left-0 z-50 w-56 rounded-xl shadow-xl border border-white/10 overflow-hidden"
                style={{ backgroundColor: "#0F1E36" }}
              >
                {/* User info */}
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-sm font-semibold text-white leading-tight truncate">
                    {user?.firstName ?? ""} {user?.lastName ?? ""}
                  </p>
                  <p className="text-xs text-white/50 truncate">
                    {user?.emailAddresses[0]?.emailAddress ?? ""}
                  </p>
                </div>
                {/* Actions */}
                <button
                  onClick={() => { setAccountMenuOpen(false); router.push("/dashboard/settings?section=profile"); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
                >
                  <UserCircle size={16} />
                  Manage Account
                </button>
                <button
                  onClick={() => signOut({ redirectUrl: "/" })}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-white/10 transition-colors"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Right side: TopBar + content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* TopBar */}
        <div className="flex flex-col gap-3 px-6 pt-4 pb-3 bg-white border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-4">
            {/* Page title */}
            <div className="flex items-center gap-3 min-w-[140px]">
              <span className="text-lg font-bold" style={{ color: "#1E3A5F" }}>
                {pageTitle}
              </span>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md mx-auto">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search contacts, deals, properties..."
                  className="w-full pl-9 pr-4 py-2 rounded-full border border-gray-200 bg-gray-50 text-sm text-gray-700 outline-none focus:border-[#0EA5E9] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="flex-1" />

            {/* Notifications */}
            <div className="flex items-center gap-3">
              <button className="relative w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <Bell size={18} className="text-gray-600" />
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                  style={{ backgroundColor: "#F59E0B" }}
                />
              </button>
            </div>
          </div>

          {/* Quick actions — only on dashboard */}
          {pathname === "/dashboard" && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-500 mr-1">Quick:</span>
              <Link
                href="/dashboard/contacts"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-700 hover:border-[#1E3A5F] hover:text-[#1E3A5F] transition-colors"
              >
                <Plus size={14} /> Add Contact
              </Link>
              <Link
                href="/dashboard/activities"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-700 hover:border-[#1E3A5F] hover:text-[#1E3A5F] transition-colors"
              >
                <FileText size={14} /> Log Activity
              </Link>
              <Link
                href="/dashboard/pipeline"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-700 hover:border-[#1E3A5F] hover:text-[#1E3A5F] transition-colors"
              >
                <Briefcase size={14} /> Create Deal
              </Link>
              <Link
                href="/dashboard/chat"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm text-white font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                <Bot size={14} /> Start AI Chat
              </Link>
            </div>
          )}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Floating AI chat bubble */}
      <AIChatBubble />
    </div>
  );
}
