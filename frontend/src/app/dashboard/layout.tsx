"use client";

import { useState, useRef, useEffect } from "react";
import { useClerk, useUser, useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Bot,
  Activity as ActivityIcon,
  Building,
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
  Mail,
  StickyNote,
  Plus,
  FileText,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AIChatBubble from "@/components/shared/AIChatBubble";
import CitationViewer from "@/components/shared/CitationViewer";
import CommandPalette from "@/components/shared/CommandPalette";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { useUIStore } from "@/store/ui-store";
import { listAllActivities, type Activity } from "@/lib/api/activities";
import { getGmailStatus, syncGmail } from "@/lib/api/gmail";
import { listLeadSuggestions } from "@/lib/api/lead-suggestions";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", exact: true },
  { icon: Users,           label: "Contacts",  href: "/dashboard/contacts" },
  { icon: GitBranch,       label: "Pipeline",  href: "/dashboard/pipeline" },
  { icon: Building,        label: "Properties", href: "/dashboard/properties" },
  { icon: Bot,             label: "AI Chat",   href: "/dashboard/chat" },
  { icon: Phone,            label: "Comms",     href: "/dashboard/communication" },
  { icon: ActivityIcon,     label: "Activities",href: "/dashboard/activities" },
  { icon: CheckSquare,     label: "Tasks",     href: "/dashboard/tasks" },
  { icon: BarChart2,       label: "Reports",   href: "/dashboard/analytics" },
  { icon: Workflow,        label: "Workflows", href: "/dashboard/workflows" },
  { icon: FileText,        label: "Documents", href: "/dashboard/documents" },
];

function activityMeta(type: Activity["type"]): { icon: LucideIcon; bg: string; color: string; label: string } {
  switch (type) {
    case "call":
      return { icon: Phone, bg: "#E0F2FE", color: "#0EA5E9", label: "Call logged" };
    case "email":
      return { icon: Mail, bg: "#EDE9FE", color: "#8B5CF6", label: "Email sent" };
    case "note":
      return { icon: StickyNote, bg: "#FEF3C7", color: "#F59E0B", label: "Note added" };
    case "showing":
      return { icon: Home, bg: "#DCFCE7", color: "#22C55E", label: "Showing" };
    case "task":
      return { icon: CheckSquare, bg: "#FEE2E2", color: "#EF4444", label: "Task" };
    default:
      return { icon: ActivityIcon, bg: "#F3F4F6", color: "#6B7280", label: "Activity" };
  }
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

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
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  // Silent Gmail auto-sync every 30 seconds while on site
  useEffect(() => {
    let cancelled = false;
    const doSync = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const status = await getGmailStatus(token);
        if (!status.connected || cancelled) return;
        await syncGmail(token);
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
        queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
      } catch {
        // Silent — fire-and-forget background sync
      }
    };
    doSync(); // sync immediately on load
    const interval = setInterval(doSync, 30_000); // then every 30s
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch recent activities for notifications
  const { data: recentActivities } = useQuery({
    queryKey: ["recent-activities-notif"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { activities: [], total: 0 };
      return listAllActivities(token, undefined, 5);
    },
    refetchInterval: 60000, // refresh every minute
  });

  // Fetch pending lead suggestions count
  const { data: leadSuggestionsData } = useQuery({
    queryKey: ["lead-suggestions"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { suggestions: [], total: 0 };
      return listLeadSuggestions(token);
    },
    refetchInterval: 60000,
  });
  const leadCount = leadSuggestionsData?.total ?? 0;

  const notifications = recentActivities?.activities ?? [];
  const unreadCount = notifications.filter((a) => !readIds.has(a.id)).length;

  function markAllRead() {
    setReadIds(new Set(notifications.map((a) => a.id)));
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Cmd+K / Ctrl+K opens command palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
      {/* Sidebar */}
      <aside
        className="flex flex-col h-full shrink-0 transition-all duration-200 ease-in-out overflow-hidden"
        style={{ width: sidebarW, backgroundColor: "#0F1E36" }}
      >
        {/* User avatar at top — links to settings */}
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

      {/* Right side */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-100 shrink-0">
          <button
            onClick={toggleSidebar}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors shrink-0"
          >
            <Menu size={18} />
          </button>

          {/* +New quick action */}
          <div className="relative" ref={newMenuRef}>
            <button
              onClick={() => {
                setNewMenuOpen((o) => !o);
                setNotifOpen(false);
                setUserMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                newMenuOpen
                  ? "bg-[#0EA5E9] text-white"
                  : "bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20"
              }`}
            >
              <Plus size={16} />
              <span className="hidden sm:inline">New</span>
            </button>

            {newMenuOpen && (
              <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden">
                {[
                  { icon: Users, label: "New Contact", href: "/dashboard/contacts?action=new" },
                  { icon: GitBranch, label: "New Deal", href: "/dashboard/pipeline?action=new" },
                  { icon: Building, label: "New Property", href: "/dashboard/properties?action=new" },
                  { icon: ActivityIcon, label: "Log Activity", href: "/dashboard/activities?action=new" },
                  { icon: CheckSquare, label: "New Task", href: "/dashboard/tasks?action=new" },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setNewMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <item.icon size={15} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Bell + user avatar */}
          <div className="flex items-center gap-2">
            {/* Lead suggestions badge */}
            {leadCount > 0 && (
              <Link
                href="/dashboard/communication?tab=leads"
                className="relative w-9 h-9 rounded-full border flex items-center justify-center transition-colors bg-green-50 border-green-200 text-green-600 hover:bg-green-100"
                title={`${leadCount} potential lead${leadCount !== 1 ? "s" : ""} detected`}
              >
                <UserPlus size={16} />
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white px-0.5"
                  style={{ backgroundColor: "#22C55E" }}
                >
                  {leadCount}
                </span>
              </Link>
            )}

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
                      <button onClick={markAllRead} className="text-xs font-medium text-[#0EA5E9] hover:text-[#0284C7] transition-colors">
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-50">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell size={24} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-sm text-gray-400">No recent activity</p>
                      </div>
                    ) : (
                      notifications.map((a) => {
                        const isUnread = !readIds.has(a.id);
                        const { icon: Icon, bg, color, label } = activityMeta(a.type);
                        const href = a.type === "task" ? "/dashboard/tasks" : "/dashboard/activities";
                        return (
                          <Link
                            key={a.id}
                            href={href}
                            onClick={() => {
                              setReadIds((prev) => { const s = new Set(prev); s.add(a.id); return s; });
                              setNotifOpen(false);
                            }}
                            className={`flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors ${isUnread ? "bg-blue-50/30" : ""}`}
                          >
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: bg }}>
                              <Icon size={14} style={{ color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs font-semibold truncate ${isUnread ? "text-gray-900" : "text-gray-600"}`}>
                                  {label}{a.contact_name ? ` — ${a.contact_name}` : ""}
                                </p>
                                <span className="text-[10px] text-gray-400 shrink-0">{relativeTime(a.created_at)}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{a.body || "No details"}</p>
                            </div>
                            {isUnread && (
                              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: "#0EA5E9" }} />
                            )}
                          </Link>
                        );
                      })
                    )}
                  </div>

                  <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                    <Link href="/dashboard/activities" onClick={() => setNotifOpen(false)} className="text-xs font-medium text-[#0EA5E9] hover:text-[#0284C7] transition-colors">
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
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{user?.firstName ?? "Agent"}</p>
                  <p className="text-xs text-gray-400">Real Estate Agent</p>
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-800">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
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
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* Floating AI chat bubble — hidden on workflows page (has its own AI panel) */}
      {!pathname?.startsWith("/dashboard/workflows") && <AIChatBubble />}

      {/* Citation source viewer (slides in from right) */}
      <CitationViewer />

      {/* Cmd+K command palette */}
      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />
    </div>
  );
}
