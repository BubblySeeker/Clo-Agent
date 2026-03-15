"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Camera, GripVertical, Plus, Trash2, AlertTriangle, Check } from "lucide-react";

const settingsSections = [
  { id: "profile", label: "Profile" },
  { id: "commission", label: "Commission & Billing" },
  { id: "integrations", label: "Integrations" },
  { id: "pipeline", label: "Pipeline Stages" },
  { id: "notifications", label: "Notifications" },
  { id: "team", label: "Team", comingSoon: true },
];

const integrations = [
  { id: "gmail", name: "Gmail", logo: "G", color: "#EA4335", connected: true, lastSync: "5 min ago" },
  { id: "outlook", name: "Outlook", logo: "O", color: "#0078D4", connected: false, lastSync: null },
  { id: "whatsapp", name: "WhatsApp", logo: "W", color: "#25D366", connected: true, lastSync: "1 hr ago" },
  { id: "twilio", name: "Twilio", logo: "T", color: "#F22F46", connected: false, lastSync: null, comingSoon: true },
  { id: "mls", name: "MLS Feed", logo: "M", color: "#6B7280", connected: false, lastSync: null, comingSoon: true },
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

export default function SettingsPage() {
  const { user } = useUser();
  const [activeSection, setActiveSection] = useState("profile");
  const [stages, setStages] = useState(initialStages);
  const [notifs, setNotifs] = useState(notificationsData);
  const [notifFreqs, setNotifFreqs] = useState<Record<string, string>>({
    stale: "Daily Digest", newlead: "Instant", tasks: "Instant", ai: "Weekly", deals: "Instant",
  });
  const [commRate, setCommRate] = useState("2.5");
  const [commSplit, setCommSplit] = useState("70/30");

  const toggleNotif = (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)));
  };

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "A"
    : "A";

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
          {activeSection === "profile" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold mb-5" style={{ color: "#1E3A5F" }}>Profile</h3>
              <div className="flex items-center gap-5 mb-6 pb-6 border-b border-gray-100">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: "#1E3A5F" }}>
                    {initials}
                  </div>
                  <button className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center">
                    <Camera size={13} className="text-gray-500" />
                  </button>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-gray-500">Real Estate Agent · CloAgent CRM</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "First Name", value: user?.firstName ?? "", type: "text" },
                  { label: "Last Name", value: user?.lastName ?? "", type: "text" },
                  { label: "Email Address", value: user?.primaryEmailAddress?.emailAddress ?? "", type: "email" },
                  { label: "Brokerage Name", value: "Premier Realty Group", type: "text" },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">{f.label}</label>
                    <input
                      type={f.type}
                      defaultValue={f.value}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                    />
                  </div>
                ))}
              </div>
              <button className="mt-5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
                Save Changes
              </button>
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
              <button className="mt-5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
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
                        {intg.lastSync && <p className="text-xs text-gray-400">Last synced: {intg.lastSync}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {intg.comingSoon ? (
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-200 text-gray-500">Coming Soon</span>
                      ) : (
                        <>
                          <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${intg.connected ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"}`}>
                            {intg.connected && <Check size={10} />}
                            {intg.connected ? "Connected" : "Not Connected"}
                          </span>
                          <button
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${intg.connected ? "bg-red-50 text-red-500 hover:bg-red-100" : "text-white hover:opacity-90"}`}
                            style={!intg.connected ? { backgroundColor: "#0EA5E9" } : {}}
                          >
                            {intg.connected ? "Disconnect" : "Connect"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline Stages */}
          {activeSection === "pipeline" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold mb-2" style={{ color: "#1E3A5F" }}>Pipeline Stages</h3>
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-5">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">Changing stages may affect existing deals</p>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {stages.map((stage) => (
                  <div key={stage.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <GripVertical size={16} className="text-gray-300 cursor-grab" />
                    <input
                      type="color"
                      value={stage.color}
                      onChange={(e) => setStages((prev) => prev.map((s) => s.id === stage.id ? { ...s, color: e.target.value } : s))}
                      className="w-7 h-7 rounded-lg border-none cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={stage.name}
                      onChange={(e) => setStages((prev) => prev.map((s) => s.id === stage.id ? { ...s, name: e.target.value } : s))}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-white"
                    />
                    <button
                      onClick={() => setStages((prev) => prev.filter((s) => s.id !== stage.id))}
                      className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={13} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStages((prev) => [...prev, { id: `s${Date.now()}`, name: "New Stage", color: "#0EA5E9" }])}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-[#0EA5E9] hover:text-[#0EA5E9] transition-colors w-full justify-center"
              >
                <Plus size={15} /> Add Stage
              </button>
              <button className="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
                Save Stages
              </button>
            </div>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold mb-5" style={{ color: "#1E3A5F" }}>Notifications</h3>
              <div className="flex flex-col gap-1">
                {notifs.map((n) => (
                  <div key={n.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleNotif(n.id)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${n.enabled ? "bg-[#0EA5E9]" : "bg-gray-200"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${n.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                      <span className="text-sm text-gray-700">{n.label}</span>
                    </div>
                    <div className="flex rounded-xl overflow-hidden border border-gray-200">
                      {frequencies.map((f) => (
                        <button
                          key={f}
                          onClick={() => setNotifFreqs((prev) => ({ ...prev, [n.id]: f }))}
                          className={`px-2.5 py-1 text-xs font-semibold transition-colors ${notifFreqs[n.id] === f ? "text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                          style={notifFreqs[n.id] === f ? { backgroundColor: "#1E3A5F" } : {}}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
                Save Preferences
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
