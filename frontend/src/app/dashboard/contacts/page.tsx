"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listContacts, createContact, type ContactFilters } from "@/lib/api/contacts";
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  Phone,
  Mail,
  FileText,
  SlidersHorizontal,
  X,
  ChevronDown,
} from "lucide-react";

type ViewMode = "table" | "grid";

const SOURCES = ["Zillow", "Referral", "Cold Call", "Open House", "WhatsApp"];
const DATE_OPTIONS = [
  { label: "Any time",    days: null },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days",days: 30 },
  { label: "Last 90 days",days: 90 },
];

interface ActiveFilters {
  sources: string[];
  dateDays: number | null;
  hasEmail: boolean;
  hasPhone: boolean;
  priceMin: string;
  priceMax: string;
  location: string;
}

const DEFAULT_FILTERS: ActiveFilters = {
  sources: [],
  dateDays: null,
  hasEmail: false,
  hasPhone: false,
  priceMin: "",
  priceMax: "",
  location: "",
};

const AVATAR_COLORS = [
  "#0EA5E9", "#22C55E", "#F59E0B", "#8B5CF6",
  "#EF4444", "#1E3A5F", "#06B6D4", "#EC4899",
];

function getColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export default function ContactsPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<ActiveFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newSource, setNewSource] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
        // discard pending changes
        setPendingFilters(activeFilters);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeFilters]);

  // Count active filters for badge
  const activeCount =
    activeFilters.sources.length +
    (activeFilters.dateDays ? 1 : 0) +
    (activeFilters.hasEmail ? 1 : 0) +
    (activeFilters.hasPhone ? 1 : 0) +
    (activeFilters.priceMin ? 1 : 0) +
    (activeFilters.priceMax ? 1 : 0) +
    (activeFilters.location ? 1 : 0);

  const apiFilters: ContactFilters = {
    search: search || undefined,
    // send first source only (API supports single value); full multi-filter handled client-side
    source: activeFilters.sources.length === 1 ? activeFilters.sources[0] : undefined,
    page,
    limit: 25,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", apiFilters],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, apiFilters);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createContact(token!, {
        first_name: newFirst,
        last_name: newLast,
        email: newEmail || undefined,
        phone: newPhone || undefined,
        source: newSource || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setShowAdd(false);
      setNewFirst(""); setNewLast(""); setNewEmail(""); setNewPhone(""); setNewSource("");
    },
  });

  // Client-side filtering for multi-source, date, has-field, price, and location
  const allContacts = data?.contacts ?? [];
  const contacts = allContacts.filter((c) => {
    if (activeFilters.sources.length > 1) {
      if (!activeFilters.sources.includes(c.source ?? "")) return false;
    }
    if (activeFilters.dateDays) {
      const cutoff = Date.now() - activeFilters.dateDays * 86400000;
      if (new Date(c.created_at).getTime() < cutoff) return false;
    }
    if (activeFilters.hasEmail && !c.email) return false;
    if (activeFilters.hasPhone && !c.phone) return false;
    // Price range: filter on buyer_profile budget if available in contact data
    if (activeFilters.priceMin) {
      const min = Number(activeFilters.priceMin);
      const budget = (c as unknown as Record<string, unknown>).budget_max as number | undefined;
      if (budget !== undefined && budget < min) return false;
    }
    if (activeFilters.priceMax) {
      const max = Number(activeFilters.priceMax);
      const budget = (c as unknown as Record<string, unknown>).budget_min as number | undefined;
      if (budget !== undefined && budget > max) return false;
    }
    // Location: filter on buyer_profile locations if available
    if (activeFilters.location) {
      const locs = (c as unknown as Record<string, unknown>).locations as string[] | undefined;
      if (locs !== undefined) {
        const query = activeFilters.location.toLowerCase();
        if (!locs.some((l) => l.toLowerCase().includes(query))) return false;
      }
    }
    return true;
  });

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  function applyFilters() {
    setActiveFilters(pendingFilters);
    setPage(1);
    setFilterOpen(false);
  }

  function clearFilters() {
    setActiveFilters(DEFAULT_FILTERS);
    setPendingFilters(DEFAULT_FILTERS);
    setPage(1);
    setFilterOpen(false);
  }

  function togglePendingSource(s: string) {
    setPendingFilters((f) => ({
      ...f,
      sources: f.sources.includes(s) ? f.sources.filter((x) => x !== s) : [...f.sources, s],
    }));
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total contacts</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          <Plus size={16} /> Add Contact
        </button>
      </div>

      {/* Add Contact Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold mb-4" style={{ color: "#1E3A5F" }}>New Contact</h3>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="First name *"
                  value={newFirst}
                  onChange={(e) => setNewFirst(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9]"
                />
                <input
                  placeholder="Last name *"
                  value={newLast}
                  onChange={(e) => setNewLast(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9]"
                />
              </div>
              <input
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9]"
              />
              <input
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9]"
              />
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-white text-gray-700"
              >
                <option value="">Source (optional)</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={!newFirst || !newLast || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                {createMutation.isPending ? "Creating..." : "Create Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
            />
          </div>

          {/* Active filter chips */}
          {activeFilters.sources.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100"
            >
              {s}
              <button onClick={() => {
                const next = { ...activeFilters, sources: activeFilters.sources.filter((x) => x !== s) };
                setActiveFilters(next); setPendingFilters(next);
              }}>
                <X size={10} />
              </button>
            </span>
          ))}
          {activeFilters.dateDays && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
              Last {activeFilters.dateDays}d
              <button onClick={() => {
                const next = { ...activeFilters, dateDays: null };
                setActiveFilters(next); setPendingFilters(next);
              }}>
                <X size={10} />
              </button>
            </span>
          )}
          {activeFilters.hasEmail && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-100">
              Has email
              <button onClick={() => {
                const next = { ...activeFilters, hasEmail: false };
                setActiveFilters(next); setPendingFilters(next);
              }}>
                <X size={10} />
              </button>
            </span>
          )}
          {activeFilters.hasPhone && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-100">
              Has phone
              <button onClick={() => {
                const next = { ...activeFilters, hasPhone: false };
                setActiveFilters(next); setPendingFilters(next);
              }}>
                <X size={10} />
              </button>
            </span>
          )}
          {(activeFilters.priceMin || activeFilters.priceMax) && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
              {activeFilters.priceMin && activeFilters.priceMax
                ? `$${Number(activeFilters.priceMin).toLocaleString()} – $${Number(activeFilters.priceMax).toLocaleString()}`
                : activeFilters.priceMin
                ? `≥ $${Number(activeFilters.priceMin).toLocaleString()}`
                : `≤ $${Number(activeFilters.priceMax).toLocaleString()}`}
              <button onClick={() => {
                const next = { ...activeFilters, priceMin: "", priceMax: "" };
                setActiveFilters(next); setPendingFilters(next);
              }}>
                <X size={10} />
              </button>
            </span>
          )}
          {activeFilters.location && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100">
              {activeFilters.location}
              <button onClick={() => {
                const next = { ...activeFilters, location: "" };
                setActiveFilters(next); setPendingFilters(next);
              }}>
                <X size={10} />
              </button>
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* Filter button */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => { setPendingFilters(activeFilters); setFilterOpen((o) => !o); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                  filterOpen || activeCount > 0
                    ? "border-[#0EA5E9] text-[#0EA5E9] bg-blue-50"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                }`}
              >
                <SlidersHorizontal size={15} />
                Filters
                {activeCount > 0 && (
                  <span className="w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: "#0EA5E9" }}>
                    {activeCount}
                  </span>
                )}
                <ChevronDown size={13} className={`transition-transform ${filterOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Filter panel */}
              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                  <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>Filters</span>
                    {activeCount > 0 && (
                      <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-600 font-medium">
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="p-4 flex flex-col gap-5">
                    {/* Source */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Lead Source</p>
                      <div className="flex flex-wrap gap-1.5">
                        {SOURCES.map((s) => {
                          const on = pendingFilters.sources.includes(s);
                          return (
                            <button
                              key={s}
                              onClick={() => togglePendingSource(s)}
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                                on
                                  ? "bg-[#1E3A5F] text-white border-[#1E3A5F]"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                              }`}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Date added */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date Added</p>
                      <div className="flex flex-col gap-1">
                        {DATE_OPTIONS.map((opt) => (
                          <label key={opt.label} className="flex items-center gap-2.5 cursor-pointer group">
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                pendingFilters.dateDays === opt.days
                                  ? "border-[#0EA5E9] bg-[#0EA5E9]"
                                  : "border-gray-300 group-hover:border-gray-400"
                              }`}
                              onClick={() => setPendingFilters((f) => ({ ...f, dateDays: opt.days }))}
                            >
                              {pendingFilters.dateDays === opt.days && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <span
                              className="text-sm text-gray-700"
                              onClick={() => setPendingFilters((f) => ({ ...f, dateDays: opt.days }))}
                            >
                              {opt.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Price Range */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Budget Range</p>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                          <input
                            type="number"
                            placeholder="Min"
                            value={pendingFilters.priceMin}
                            onChange={(e) => setPendingFilters((f) => ({ ...f, priceMin: e.target.value }))}
                            className="w-full pl-6 pr-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50"
                          />
                        </div>
                        <span className="text-gray-400 text-xs shrink-0">to</span>
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                          <input
                            type="number"
                            placeholder="Max"
                            value={pendingFilters.priceMax}
                            onChange={(e) => setPendingFilters((f) => ({ ...f, priceMax: e.target.value }))}
                            className="w-full pl-6 pr-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Location */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</p>
                      <input
                        type="text"
                        placeholder="City, neighborhood, or zip..."
                        value={pendingFilters.location}
                        onChange={(e) => setPendingFilters((f) => ({ ...f, location: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50"
                      />
                    </div>

                    {/* Contact info toggles */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contact Info</p>
                      <div className="flex flex-col gap-2">
                        {[
                          { key: "hasEmail" as const, label: "Has email address" },
                          { key: "hasPhone" as const, label: "Has phone number" },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                            <div
                              onClick={() => setPendingFilters((f) => ({ ...f, [key]: !f[key] }))}
                              className={`w-9 h-5 rounded-full transition-colors relative ${
                                pendingFilters[key] ? "bg-[#0EA5E9]" : "bg-gray-200"
                              }`}
                            >
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                pendingFilters[key] ? "translate-x-4" : "translate-x-0.5"
                              }`} />
                            </div>
                            <span className="text-sm text-gray-700">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Apply */}
                  <div className="px-4 pb-4">
                    <button
                      onClick={applyFilters}
                      className="w-full py-2 rounded-xl text-white text-sm font-semibold"
                      style={{ backgroundColor: "#0EA5E9" }}
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* View toggle */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              <button
                onClick={() => setView("table")}
                className={`p-2 transition-colors ${view === "table" ? "text-white" : "bg-white text-gray-400"}`}
                style={view === "table" ? { backgroundColor: "#1E3A5F" } : {}}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setView("grid")}
                className={`p-2 transition-colors ${view === "grid" ? "text-white" : "bg-white text-gray-400"}`}
                style={view === "grid" ? { backgroundColor: "#1E3A5F" } : {}}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table / Grid */}
      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="animate-pulse space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-50 rounded-xl" />
            ))}
          </div>
        </div>
      ) : view === "table" ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Phone</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Source</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Added</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                    {activeCount > 0 ? "No contacts match these filters." : "No contacts yet — add your first one!"}
                  </td>
                </tr>
              ) : (
                contacts.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/dashboard/contacts/${c.id}`)}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-blue-50/40 transition-colors ${
                      i % 2 !== 0 ? "bg-gray-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: getColor(c.id) }}
                        >
                          {initials(c.first_name, c.last_name)}
                        </div>
                        <span className="text-sm font-semibold text-gray-800">
                          {c.first_name} {c.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      {c.source ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {c.source}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-blue-100 transition-colors" title="Call">
                          <Phone size={13} className="text-gray-500" />
                        </button>
                        <button className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-blue-100 transition-colors" title="Email">
                          <Mail size={13} className="text-gray-500" />
                        </button>
                        <button
                          className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-blue-100 transition-colors"
                          title="View Profile"
                          onClick={() => router.push(`/dashboard/contacts/${c.id}`)}
                        >
                          <FileText size={13} className="text-gray-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              Showing {contacts.length} of {total} contacts
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-xs text-gray-500 px-2">{page} / {Math.max(1, totalPages)}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {contacts.length === 0 ? (
            <div className="col-span-4 text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              {activeCount > 0 ? "No contacts match these filters." : "No contacts yet — add your first one!"}
            </div>
          ) : (
            contacts.map((c) => (
              <div
                key={c.id}
                onClick={() => router.push(`/dashboard/contacts/${c.id}`)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-[#0EA5E9]/40 hover:shadow-md cursor-pointer transition-all flex flex-col gap-3"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: getColor(c.id) }}
                >
                  {initials(c.first_name, c.last_name)}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{c.first_name} {c.last_name}</p>
                  {c.source && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {c.source}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-gray-500">{c.email ?? "No email"}</p>
                  <p className="text-xs text-gray-500">{c.phone ?? "No phone"}</p>
                </div>
                <button
                  className="w-full py-2 rounded-xl text-xs font-semibold text-white"
                  style={{ backgroundColor: "#1E3A5F" }}
                >
                  View Profile
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
