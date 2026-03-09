"use client";

import { UserButton } from "@clerk/nextjs";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard/contacts", label: "Contacts", icon: ContactRound },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: TrendingUp },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r bg-background transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-4">
          <span
            className={cn(
              "text-lg font-bold tracking-tight transition-opacity duration-200",
              sidebarCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
            )}
          >
            CloAgent
          </span>
          {sidebarCollapsed && (
            <span className="text-lg font-bold">Clo</span>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 p-2 pt-4">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname.startsWith(href)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          ))}
        </nav>

        {/* Bottom: collapse toggle + user */}
        <div className="border-t p-2 space-y-2">
          <div
            className={cn(
              "flex items-center",
              sidebarCollapsed ? "justify-center" : "px-2"
            )}
          >
            <UserButton afterSignOutUrl="/" />
          </div>
          <button
            onClick={toggleSidebar}
            className="flex w-full items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          sidebarCollapsed ? "ml-16" : "ml-60"
        )}
      >
        {children}
      </main>
    </div>
  );
}
