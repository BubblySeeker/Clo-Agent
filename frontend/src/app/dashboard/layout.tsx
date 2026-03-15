"use client";

import { useState, useRef, useEffect } from "react";
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
  Bell,
  Workflow,
  Menu,
  LogOut,
  UserCircle,
  Phone,
  Home,
  Calendar,
  GitMerge,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AIChatBubble from "@/components/shared/AIChatBubble";
import { useUIStore } from "@/store/ui-store";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", exact: true },
  { icon: Users,           label: "Contacts",  href: "/dashboard/contacts" },
  { icon: GitBranch,       label: "Pipeline",  href: "/dashboard/pipeline" },
  { icon: Bot,             label: "AI Chat",   href: "/dashboard/chat" },
  { icon: Activity,        label: "Activities",href: "/dashboard/activities" },
  { icon: CheckSquare,     label: "Tasks",     href: "/dashboard/tasks" },
  { icon: BarChart2,       label: "Reports",   href: "/dashboard/analytics" },
  { icon: Workflow,        label: "Workflows", href: "/dashboard/workflows" },
];


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const NOTIFICATIONS = [
    {
      id: 1,
      icon: AlertCircle,
      iconBg: "#FEF3C7",
      iconColor: "#F59E0B",
      title: "Follow-up needed",
      body: "Sarah Johnson hasn't been contacted in 9 days.",
      time: "2h ago",
      href: "/dashboard/contacts",
    },
    {
      id: 2,
      icon: GitMerge,
      iconBg: "#EDE9FE",
      iconColor: "#8B5CF6",
      title: "Deal moved to Offer",
      body: "123 Maple St deal advanced to the Offer stage.",
      time: "4h ago",
      href: "/dashboard/pipeline",
    },
    {
      id: 3,
      icon: Phone,
      iconBg: "#E0F2FE",
      iconColor: "#0EA5E9",
      title: "Call logged",
      body: "Activity logged for Marcus Rivera — call, 12 min.",
      time: "Yesterday",
      href: "/dashboard/activities",
    },
    {
      id: 4,
      icon: Home,
      iconBg: "#DCFCE7",
      iconColor: "#22C55E",
      title: "Showing scheduled",
      body: "Showing booked with Emily & Tom Chen at 2:30 PM.",
      time: "Yesterday",
      href: "/dashboard/contacts",
    },
    {
      id: 5,
      icon: Calendar,
      iconBg: "#FEE2E2",
      iconColor: "#EF4444",
      title: "Task due today",
      body: "Send pre-approval docs to David Kim by end of day.",
      time: "Today",
      href: "/dashboard/tasks",
    },
  ];

  const unreadCount = NOTIFICATIONS.filter((n) => !readIds.has(n.id)).length;

  function markAllRead() {
    setReadIds(new Set(NOTIFICATIONS.map((n) => n.id)));
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "A"
    : "A";

  const sidebarW = sidebarCollapsed ? "72px" : "220px";

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ backgroundColor: "#F5F7FA", fontFamily: "'Inter', sans-serif" }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className="flex flex-col h-full shrink-0 transition-all duration-200 ease-in-out overflow-hidden"
        style={{ width: sidebarW, backgroundColor: "#0F1E36" }}
      >
        {/* User avatar at top */}
        <Link
          href="/dashboard/settings"
          className="flex items-center h-16 border-b border-white/10 shrink-0 px-3 gap-3 overflow-hidden hover:bg-white/5 transition-colors"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            {initials}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate leading-tight">
                {user?.firstName ?? "Agent"} {user?.lastName ?? ""}
              </p>
              <p className="text-white/40 text-xs truncate">Real Estate Agent</p>
            </div>
          )}
        </Link>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-0.5 py-3 px-2 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl transition-all cursor-pointer group relative overflow-hidden
                  ${sidebarCollapsed ? "w-12 h-12 justify-center mx-auto" : "px-3 py-2.5"}
                  ${active ? "bg-[#0EA5E9]/20" : "hover:bg-white/10"}`}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full"
                    style={{ backgroundColor: "#0EA5E9" }}
                  />
                )}
                <item.icon
                  size={18}
                  className={`shrink-0 ${active ? "text-[#0EA5E9]" : "text-white/50 group-hover:text-white/80"}`}
                />
                {!sidebarCollapsed && (
                  <span
                    className={`text-sm font-medium truncate ${
                      active ? "text-[#0EA5E9]" : "text-white/60 group-hover:text-white/90"
                    }`}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Settings at bottom */}
        <div className="shrink-0 px-2 pb-4 flex flex-col gap-0.5">
          <Link
            href="/dashboard/settings"
            title={sidebarCollapsed ? "Settings" : undefined}
            className={`flex items-center gap-3 rounded-xl transition-all group
              ${sidebarCollapsed ? "w-12 h-12 justify-center mx-auto" : "px-3 py-2.5"}
              ${isActive("/dashboard/settings") ? "bg-[#0EA5E9]/20" : "hover:bg-white/10"}`}
          >
            <Settings
              size={18}
              className={isActive("/dashboard/settings") ? "text-[#0EA5E9]" : "text-white/50 group-hover:text-white/80"}
            />
            {!sidebarCollapsed && (
              <span className={`text-sm font-medium ${isActive("/dashboard/settings") ? "text-[#0EA5E9]" : "text-white/60 group-hover:text-white/90"}`}>
                Settings
              </span>
            )}
          </Link>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Right side                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* Top bar — hamburger + bell + profile only */}
        <div className="flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-100 shrink-0">
          <button
            onClick={toggleSidebar}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors shrink-0"
          >
            <Menu size={18} />
          </button>

          <div className="flex-1" />

          {/* Bell + user avatar */}
          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setUserMenuOpen(false);
                }}
                className={`relative w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                  notifOpen
                    ? "bg-amber-50 border-amber-200 text-amber-600"
                    : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                }`}
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white px-0.5"
                    style={{ backgroundColor: "#F59E0B" }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>Notifications</span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: "#F59E0B" }}>
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs font-medium text-[#0EA5E9] hover:text-[#0284C7] transition-colors"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Notification list */}
                  <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-50">
                    {NOTIFICATIONS.map((n) => {
                      const isUnread = !readIds.has(n.id);
                      return (
                        <Link
                          key={n.id}
                          href={n.href}
                          onClick={() => {
                            setReadIds((prev) => { const s = new Set(prev); s.add(n.id); return s; });
                            setNotifOpen(false);
                          }}
                          className={`flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors ${isUnread ? "bg-blue-50/30" : ""}`}
                        >
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                            style={{ backgroundColor: n.iconBg }}
                          >
                            <n.icon size={14} style={{ color: n.iconColor }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-xs font-semibold truncate ${isUnread ? "text-gray-900" : "text-gray-600"}`}>
                                {n.title}
                              </p>
                              <span className="text-[10px] text-gray-400 shrink-0">{n.time}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.body}</p>
                          </div>
                          {isUnread && (
                            <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: "#0EA5E9" }} />
                          )}
                        </Link>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                    <Link
                      href="/dashboard/activities"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs font-medium text-[#0EA5E9] hover:text-[#0284C7] transition-colors"
                    >
                      View all activity →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User avatar + dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: "#1E3A5F" }}
                >
                  {initials}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">
                    {user?.firstName ?? "Agent"}
                  </p>
                  <p className="text-xs text-gray-400">Real Estate Agent</p>
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-800">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {user?.primaryEmailAddress?.emailAddress}
                    </p>
                  </div>
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <UserCircle size={15} className="text-gray-400" />
                    <span className="text-sm text-gray-700">Profile & Settings</span>
                  </Link>
                  <button
                    onClick={() => signOut(() => router.push("/"))}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors group"
                  >
                    <LogOut size={15} className="text-gray-400 group-hover:text-red-500" />
                    <span className="text-sm text-gray-700 group-hover:text-red-500">Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
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
