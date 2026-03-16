"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Camera, AlertTriangle, Info } from "lucide-react";

const settingsSections = [
  { id: "profile", label: "Profile" },
  { id: "commission", label: "Commission & Billing" },
  { id: "integrations", label: "Integrations" },
  { id: "pipeline", label: "Pipeline Stages" },
  { id: "notifications", label: "Notifications" },
  { id: "team", label: "Team", comingSoon: true },
];

const integrations = [
  { id: "gmail", name: "Gmail", logo: "G", color: "#EA4335", comingSoon: true },
  { id: "outlook", name: "Outlook", logo: "O", color: "#0078D4", comingSoon: true },
  { id: "whatsapp", name: "WhatsApp", logo: "W", color: "#25D366", comingSoon: true },
  { id: "twilio", name: "Twilio", logo: "T", color: "#F22F46", comingSoon: true },
  { id: "mls", name: "MLS Feed", logo: "M", color: "#6B7280", comingSoon: true },
];

const initialStages = [
  { id: "s1", name: "Lead", color: "#0EA5E9" },
  { id: "s2", name: "Contacted", color: "#0D96D4" },
  { id: "s3", name: "Touring", color: "#0B7DB8" },
  { id: "s4", name: "Offer", color: "#F59E0B" },
  { id: "s5", name: "Under Contract", color: "#22C55E" },
  { id: "s6", name: "Closed", color: "#1E3A5F" },
];

const notificationsData = [
  { id: "stale", label: "Stale lead alerts", enabled: true },
  { id: "newlead", label: "New lead notifications", enabled: true },
  { id: "tasks", label: "Task reminders", enabled: true },
  { id: "ai", label: "AI insight summaries", enabled: false },
  { id: "deals", label: "Deal stage changes", enabled: true },
];

const frequencies = ["Instant", "Daily Digest", "Weekly"];

type UserType = NonNullable<ReturnType<typeof useUser>["user"]>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 flex-1">
      <label className="text-xs font-semibold text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

// ─── Profile section sub-tabs ────────────────────────────────────────────────

function InfoTab({ user }: { user: UserType }) {
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [brokerage, setBrokerage] = useState("Premier Realty Group");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "A";

  async function handleSave() {
    setStatus("saving");
    setErrorMsg("");
    try {
      await user.update({ firstName, lastName });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update profile.");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-5 pb-5 border-b border-gray-100">
        <div className="relative">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: "#1E3A5F" }}>
            {initials}
          </div>
          <button className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center">
            <Camera size={13} className="text-gray-500" />
          </button>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">{firstName} {lastName}</p>
          <p className="text-xs text-gray-500">Real Estate Agent · CloAgent CRM</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
          />
        </Field>
        <Field label="Last Name">
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
          />
        </Field>
      </div>
      <Field label="Email Address">
        <input
          value={user.primaryEmailAddress?.emailAddress ?? ""}
          readOnly
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
        />
      </Field>
      <Field label="Brokerage Name">
        <input
          value={brokerage}
          onChange={(e) => setBrokerage(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
        />
      </Field>
      {status === "success" && <p className="text-sm text-green-600 font-medium">Profile updated.</p>}
      {status === "error" && <p className="text-sm text-red-500">{errorMsg}</p>}
      <div>
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          {status === "saving" ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function SecurityTab({ user }: { user: UserType }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave() {
    if (newPassword !== confirmPassword) {
      setStatus("error");
      setErrorMsg("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setStatus("error");
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    setStatus("saving");
    setErrorMsg("");
    try {
      await user.updatePassword({ currentPassword, newPassword, signOutOfOtherSessions: true });
      setStatus("success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update password.");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Current Password">
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
        />
      </Field>
      <Field label="New Password">
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
        />
      </Field>
      <Field label="Confirm New Password">
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
        />
      </Field>
      {status === "success" && <p className="text-sm text-green-600 font-medium">Password updated. Other sessions signed out.</p>}
      {status === "error" && <p className="text-sm text-red-500">{errorMsg}</p>}
      <div>
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          {status === "saving" ? "Saving…" : "Update Password"}
        </button>
      </div>
    </div>
  );
}

function ConnectedAccountsTab({ user }: { user: UserType }) {
  const [disconnectStatus, setDisconnectStatus] = useState<Record<string, "disconnecting">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [connectError, setConnectError] = useState("");

  const accounts = user.externalAccounts;
  const hasPassword = user.passwordEnabled;

  async function handleDisconnect(accountId: string) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    if (!hasPassword && accounts.length <= 1) {
      setErrors((prev) => ({ ...prev, [accountId]: "Cannot disconnect — you have no password set. Add a password first." }));
      return;
    }
    setDisconnectStatus((prev) => ({ ...prev, [accountId]: "disconnecting" }));
    setErrors((prev) => { const n = { ...prev }; delete n[accountId]; return n; });
    try {
      await account.destroy();
    } catch (err: unknown) {
      setErrors((prev) => ({ ...prev, [accountId]: err instanceof Error ? err.message : "Failed to disconnect." }));
      setDisconnectStatus((prev) => { const n = { ...prev }; delete n[accountId]; return n; });
    }
  }

  async function handleConnectGoogle() {
    setConnectError("");
    try {
      await user.createExternalAccount({ strategy: "oauth_google", redirectUrl: window.location.href });
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? err.message : "Failed to connect Google.");
    }
  }

  const providerLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
  const hasGoogle = accounts.some((a) => a.provider === "google" || a.verification?.strategy === "oauth_google");

  return (
    <div className="flex flex-col gap-4">
      {accounts.length === 0 ? (
        <p className="text-sm text-gray-500">No connected accounts.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.map((account) => {
            const isBusy = disconnectStatus[account.id] === "disconnecting";
            return (
              <div key={account.id} className="flex items-center justify-between rounded-xl px-4 py-3 border border-gray-200 bg-gray-50">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{providerLabel(account.provider ?? "unknown")}</p>
                  {account.emailAddress && <p className="text-xs text-gray-400">{account.emailAddress}</p>}
                  {errors[account.id] && <p className="text-xs text-red-500 mt-0.5">{errors[account.id]}</p>}
                </div>
                <button
                  onClick={() => handleDisconnect(account.id)}
                  disabled={isBusy}
                  className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                >
                  {isBusy ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {!hasGoogle && (
        <div>
          <button
            onClick={handleConnectGoogle}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <GoogleIcon />
            Connect Google
          </button>
          {connectError && <p className="text-xs text-red-500 mt-1.5">{connectError}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Main Settings Content ───────────────────────────────────────────────────

function SettingsContent() {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { getToken } = useAuth();

  const [activeSection, setActiveSection] = useState(
    () => searchParams.get("section") ?? "profile"
  );
  const [activeProfileTab, setActiveProfileTab] = useState<"info" | "security" | "accounts">("info");
  const [stages, setStages] = useState(initialStages);

  // Load real pipeline stages from API
  const { data: realStages } = useQuery({
    queryKey: ["deal-stages"],
    queryFn: async () => {
      const token = await getToken();
      return apiRequest<{ id: string; name: string; color: string; position: number }[]>("/deal-stages", token!);
    },
  });

  useEffect(() => {
    if (realStages && realStages.length > 0) {
      setStages(realStages.map((s) => ({ id: s.id, name: s.name, color: s.color || "#0EA5E9" })));
    }
  }, [realStages]);
  const notifs = notificationsData;
  const [notifFreqs, setNotifFreqs] = useState<Record<string, string>>({
    stale: "Daily Digest", newlead: "Instant", tasks: "Instant", ai: "Weekly", deals: "Instant",
  });
  const [commRate, setCommRate] = useState("2.5");
  const [commSplit, setCommSplit] = useState("70/30");
  const [commStatus, setCommStatus] = useState<"idle" | "success">("idle");



  const profileTabs = [
    { id: "info" as const, label: "Info" },
    ...(user?.passwordEnabled ? [{ id: "security" as const, label: "Security" }] : []),
    { id: "accounts" as const, label: "Connected Accounts" },
  ];

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and preferences</p>
      </div>

      <div className="flex gap-5">
        {/* LEFT — Settings Nav */}
        <div className="w-56 shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {settingsSections.map((s) => (
              <button
                key={s.id}
                onClick={() => !s.comingSoon && setActiveSection(s.id)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors border-b border-gray-50 last:border-0 ${
                  activeSection === s.id
                    ? "bg-blue-50 text-[#0EA5E9]"
                    : s.comingSoon
                    ? "text-gray-300 cursor-default"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
                style={activeSection === s.id ? { borderLeft: "3px solid #0EA5E9" } : { borderLeft: "3px solid transparent" }}
              >
                {s.label}
                {s.comingSoon && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Soon</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — Content */}
        <div className="flex-1">

          {/* Profile */}
          {activeSection === "profile" && user && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold mb-5" style={{ color: "#1E3A5F" }}>Profile</h3>

              {/* Sub-tabs */}
              <div className="flex gap-0 border-b border-gray-100 mb-6">
                {profileTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveProfileTab(tab.id)}
                    className="relative px-4 py-2.5 text-sm font-medium transition-colors"
                    style={{ color: activeProfileTab === tab.id ? "#0EA5E9" : "#6B7280" }}
                  >
                    {tab.label}
                    {activeProfileTab === tab.id && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ backgroundColor: "#0EA5E9" }} />
                    )}
                  </button>
                ))}
              </div>

              {activeProfileTab === "info" && <InfoTab user={user} />}
              {activeProfileTab === "security" && user.passwordEnabled && <SecurityTab user={user} />}
              {activeProfileTab === "accounts" && <ConnectedAccountsTab user={user} />}
            </div>
          )}

          {/* Commission */}
          {activeSection === "commission" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold mb-5" style={{ color: "#1E3A5F" }}>Commission & Billing</h3>
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Default Commission Rate (%)</label>
                    <input type="number" value={commRate} onChange={(e) => setCommRate(e.target.value)} step="0.1"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
                    <p className="text-xs text-gray-400 mt-1">Used as default in deal commission calculator</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Commission Split</label>
                    <input type="text" value={commSplit} onChange={(e) => setCommSplit(e.target.value)} placeholder="e.g. 70/30"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
                    <p className="text-xs text-gray-400 mt-1">Agent/Broker split</p>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-2xl p-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800">Starter Plan</p>
                    <p className="text-xs text-gray-500 mt-0.5">Up to 50 contacts · 10 active deals</p>
                  </div>
                  <button className="px-4 py-2 rounded-xl text-white text-xs font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
                    Upgrade to Pro
                  </button>
                </div>
              </div>
              {commStatus === "success" && (
                <div className="flex items-center gap-2 mt-4">
                  <Info size={13} className="text-amber-500" />
                  <p className="text-sm text-amber-600 font-medium">Saved locally to this browser only.</p>
                </div>
              )}
              <button
                className="mt-5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
                style={{ backgroundColor: "#0EA5E9" }}
                onClick={() => {
                  localStorage.setItem("clo_commission", JSON.stringify({ rate: commRate, split: commSplit }));
                  setCommStatus("success");
                  setTimeout(() => setCommStatus("idle"), 2500);
                }}
              >
                Save Changes
              </button>
            </div>
          )}

          {/* Integrations */}
          {activeSection === "integrations" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold mb-5" style={{ color: "#1E3A5F" }}>Integrations</h3>
              <div className="flex flex-col gap-3">
                {integrations.map((intg) => (
                  <div key={intg.id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: intg.color }}>
                        {intg.logo}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{intg.name}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-200 text-gray-500">Coming Soon</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline Stages */}
          {activeSection === "pipeline" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold mb-2" style={{ color: "#1E3A5F" }}>Pipeline Stages</h3>
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-5">
                <Info size={14} className="text-blue-600 shrink-0" />
                <p className="text-xs text-blue-700">Pipeline stages are read-only. Custom stage editing is coming soon.</p>
              </div>
              <div className="flex flex-col gap-2">
                {stages.map((stage, i) => (
                  <div key={stage.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <span className="text-xs text-gray-400 w-5 text-center font-medium">{i + 1}</span>
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm font-medium text-gray-700">{stage.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold mb-4" style={{ color: "#1E3A5F" }}>Notifications</h3>
              <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-amber-200 bg-amber-50 mb-5">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Coming Soon</p>
                  <p className="text-xs text-amber-600 mt-0.5">Notification preferences will be available once the notification system is built. Below is a preview of what&apos;s planned.</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 opacity-60 pointer-events-none">
                {notifs.map((n) => (
                  <div key={n.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <div
                        className={`relative w-10 h-5 rounded-full transition-colors ${n.enabled ? "bg-[#0EA5E9]" : "bg-gray-200"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${n.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                      </div>
                      <span className="text-sm text-gray-700">{n.label}</span>
                    </div>
                    <div className="flex rounded-xl overflow-hidden border border-gray-200">
                      {frequencies.map((f) => (
                        <span
                          key={f}
                          className={`px-2.5 py-1 text-xs font-semibold ${notifFreqs[n.id] === f ? "text-white" : "bg-white text-gray-400"}`}
                          style={notifFreqs[n.id] === f ? { backgroundColor: "#1E3A5F" } : {}}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading settings…</div>}>
      <SettingsContent />
    </Suspense>
  );
}
