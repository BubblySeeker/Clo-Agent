"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, FileText, Building2, Clock, User, Mail, Phone } from "lucide-react";
import {
  portalAuth,
  type PortalAuthResponse,
} from "@/lib/api/portal";

const tabs = [
  { id: "overview", label: "Overview", icon: Home, path: "" },
  { id: "deals", label: "Deals", icon: FileText, path: "/deals" },
  { id: "properties", label: "Properties", icon: Building2, path: "/properties" },
  { id: "timeline", label: "Timeline", icon: Clock, path: "/timeline" },
];

export default function PortalTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const token = params.token as string;

  const [authData, setAuthData] = useState<PortalAuthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    portalAuth(token)
      .then(setAuthData)
      .catch(() => {
        setError(true);
        router.replace("/portal/expired");
      })
      .finally(() => setLoading(false));
  }, [token, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !authData) return null;

  const basePath = `/portal/${token}`;
  const currentTab = pathname === basePath ? "overview" : pathname.replace(basePath + "/", "");

  const agentPhone = authData.settings.agent_phone;
  const agentEmail = authData.settings.agent_email || authData.agent.email;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#1E3A5F] flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  {authData.agent.name?.charAt(0)?.toUpperCase() || "A"}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {authData.agent.name}
                </p>
                <p className="text-xs text-gray-500">Your Agent</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {agentPhone && (
                <a
                  href={`tel:${agentPhone}`}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{agentPhone}</span>
                </a>
              )}
              {agentEmail && (
                <a
                  href={`mailto:${agentEmail}`}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{agentEmail}</span>
                </a>
              )}
            </div>
          </div>

          {/* Welcome */}
          <div className="pb-4">
            <h1 className="text-lg font-bold text-gray-900">
              Welcome, {authData.contact.first_name}
            </h1>
            {authData.settings.welcome_message && (
              <p className="text-sm text-gray-600 mt-1">
                {authData.settings.welcome_message}
              </p>
            )}
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 -mb-px">
            {tabs.map((tab) => {
              // Hide properties tab if disabled
              if (tab.id === "properties" && !authData.settings.show_properties) return null;
              if (tab.id === "timeline" && !authData.settings.show_activities) return null;

              const isActive = currentTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => router.push(basePath + tab.path)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-[#0EA5E9] text-[#0EA5E9]"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-gray-400">
          <span>Powered by CloAgent</span>
          <div className="flex items-center gap-4">
            {agentPhone && (
              <a href={`tel:${agentPhone}`} className="hover:text-gray-600">
                {agentPhone}
              </a>
            )}
            {agentEmail && (
              <a href={`mailto:${agentEmail}`} className="hover:text-gray-600">
                {agentEmail}
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
