"use client";

import { useState } from "react";
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
} from "lucide-react";

type Filter = "all" | "zillow" | "referral" | "cold_call";
type ViewMode = "table" | "grid";

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
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newSource, setNewSource] = useState("");

  const filters: ContactFilters = {
    search: search || undefined,
    source: filter !== "all" ? filter : undefined,
    page,
    limit: 25,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", filters],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, filters);
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
      setNewFirst("");
      setNewLast("");
      setNewEmail("");
      setNewPhone("");
      setNewSource("");
    },
  });

  const contacts = data?.contacts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

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
              <input
                placeholder="Source (zillow, referral, cold_call...)"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9]"
              />
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
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
            />
          </div>

          <div className="flex gap-1.5">
            {(["all", "zillow", "referral", "cold_call"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                  filter === f ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={filter === f ? { backgroundColor: "#1E3A5F" } : {}}
              >
                {f === "cold_call" ? "Cold Call" : f}
              </button>
            ))}
          </div>

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
                    No contacts yet — add your first one!
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
              <span className="text-xs text-gray-500 px-2">
                {page} / {Math.max(1, totalPages)}
              </span>
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
              No contacts yet — add your first one!
            </div>
          ) : (
            contacts.map((c) => (
              <div
                key={c.id}
                onClick={() => router.push(`/dashboard/contacts/${c.id}`)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-[#0EA5E9]/40 hover:shadow-md cursor-pointer transition-all flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: getColor(c.id) }}
                  >
                    {initials(c.first_name, c.last_name)}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    {c.first_name} {c.last_name}
                  </p>
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
