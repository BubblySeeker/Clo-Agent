"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listContacts, createContact, type ContactFilters } from "@/lib/api/contacts";
import { createBuyerProfile } from "@/lib/api/buyer-profiles";
import {
  listContactFolders,
  createContactFolder,
  updateContactFolder,
  deleteContactFolder,
  moveContactsToFolder,
  removeContactsFromFolder,
  type ContactFolder,
} from "@/lib/api/contact-folders";
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
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  AlertTriangle,
  Users,
  Check,
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
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  // Main state
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<ActiveFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const filterRef = useRef<HTMLDivElement>(null);

  // Folder state
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = all, "unfiled", or folder ID
  const [folderSearch, setFolderSearch] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deleteFolder, setDeleteFolder] = useState<ContactFolder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Bulk selection state
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Move to folder dropdown
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const moveDropdownRef = useRef<HTMLDivElement>(null);

  // Add contact modal state
  const [showAdd, setShowAdd] = useState(searchParams.get("action") === "new");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newType, setNewType] = useState<"buyer" | "seller" | "both" | "">("");
  const [newNotes, setNewNotes] = useState("");
  const [newBudgetMin, setNewBudgetMin] = useState("");
  const [newBudgetMax, setNewBudgetMax] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newFolderId, setNewFolderId] = useState<string | null>(null);

  // Click-outside handlers
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
        setPendingFilters(activeFilters);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeFilters]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setFolderMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moveDropdownRef.current && !moveDropdownRef.current.contains(e.target as Node)) {
        setShowMoveDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (creatingFolder && newFolderRef.current) newFolderRef.current.focus();
  }, [creatingFolder]);

  useEffect(() => {
    if (renamingFolderId && renameRef.current) renameRef.current.focus();
  }, [renamingFolderId]);

  // Active filter count
  const activeCount =
    activeFilters.sources.length +
    (activeFilters.dateDays ? 1 : 0) +
    (activeFilters.hasEmail ? 1 : 0) +
    (activeFilters.hasPhone ? 1 : 0) +
    (activeFilters.priceMin ? 1 : 0) +
    (activeFilters.priceMax ? 1 : 0) +
    (activeFilters.location ? 1 : 0);

  // API filters
  const apiFilters: ContactFilters = {
    search: search || undefined,
    source: activeFilters.sources.length === 1 ? activeFilters.sources[0] : undefined,
    folder_id: selectedFolder ?? undefined,
    page,
    limit: 25,
  };

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ["contacts", apiFilters],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, apiFilters);
    },
  });

  const { data: foldersData } = useQuery({
    queryKey: ["contact-folders"],
    queryFn: async () => {
      const token = await getToken();
      return listContactFolders(token!);
    },
  });

  const folders = foldersData?.folders ?? [];
  const filteredFolders = folderSearch
    ? folders.filter((f) => f.name.toLowerCase().includes(folderSearch.toLowerCase()))
    : folders;
  const totalFolderContacts = folders.reduce((sum, f) => sum + f.contact_count, 0);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createContact(token!, {
        first_name: newFirst,
        last_name: newLast,
        email: newEmail || undefined,
        phone: newPhone || undefined,
        source: newSource || undefined,
        folder_id: newFolderId || undefined,
      } as Parameters<typeof createContact>[1] & { folder_id?: string });
    },
    onSuccess: async (createdContact) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-folders"] });
      if (newBudgetMin || newBudgetMax || newLocation) {
        try {
          const token = await getToken();
          await createBuyerProfile(token!, createdContact.id, {
            budget_min: newBudgetMin ? Number(newBudgetMin) : undefined,
            budget_max: newBudgetMax ? Number(newBudgetMax) : undefined,
            locations: newLocation ? [newLocation] : undefined,
          });
        } catch { /* optional */ }
      }
      setShowAdd(false);
      setNewFirst(""); setNewLast(""); setNewEmail(""); setNewPhone(""); setNewSource(""); setNewType(""); setNewNotes(""); setNewBudgetMin(""); setNewBudgetMax(""); setNewLocation(""); setNewFolderId(null);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = await getToken();
      return createContactFolder(token!, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-folders"] });
      setCreatingFolder(false);
      setNewFolderName("");
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const token = await getToken();
      return updateContactFolder(token!, id, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-folders"] });
      setRenamingFolderId(null);
      setRenamingValue("");
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async ({ id, confirmName }: { id: string; confirmName: string }) => {
      const token = await getToken();
      return deleteContactFolder(token!, id, confirmName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-folders"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      if (deleteFolder && selectedFolder === deleteFolder.id) setSelectedFolder(null);
      setDeleteFolder(null);
      setDeleteConfirmText("");
    },
  });

  const moveMutation = useMutation({
    mutationFn: async (folderId: string) => {
      const token = await getToken();
      return moveContactsToFolder(token!, folderId, Array.from(selectedContacts));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-folders"] });
      setSelectedContacts(new Set());
      setShowMoveDropdown(false);
    },
  });

  const unfileMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const ids = Array.from(selectedContacts);
      // Find which folders these contacts are in and remove them
      const contactsData = data?.contacts ?? [];
      const folderIds = new Set(contactsData.filter((c) => ids.includes(c.id) && c.folder_id).map((c) => c.folder_id!));
      for (const fid of Array.from(folderIds)) {
        const contactsInFolder = ids.filter((id) => contactsData.find((c) => c.id === id)?.folder_id === fid);
        await removeContactsFromFolder(token!, fid, contactsInFolder);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-folders"] });
      setSelectedContacts(new Set());
      setShowMoveDropdown(false);
    },
  });

  // Client-side filtering
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

  function applyFilters() { setActiveFilters(pendingFilters); setPage(1); setFilterOpen(false); }
  function clearFilters() { setActiveFilters(DEFAULT_FILTERS); setPendingFilters(DEFAULT_FILTERS); setPage(1); setFilterOpen(false); }
  function togglePendingSource(s: string) {
    setPendingFilters((f) => ({
      ...f,
      sources: f.sources.includes(s) ? f.sources.filter((x) => x !== s) : [...f.sources, s],
    }));
  }

  function toggleSelectContact(id: string) {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ===== Folder Sidebar ===== */}
      <div className="w-[240px] shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search folders..."
              value={folderSearch}
              onChange={(e) => setFolderSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs outline-none focus:border-[#0EA5E9] transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {/* All Contacts */}
          <button
            onClick={() => { setSelectedFolder(null); setPage(1); setSelectedContacts(new Set()); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
              selectedFolder === null ? "bg-blue-50 text-[#0EA5E9] font-semibold" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Users size={15} className={selectedFolder === null ? "text-[#0EA5E9]" : "text-gray-400"} />
            <span className="flex-1 truncate">All Contacts</span>
            <span className="text-xs text-gray-400">{total}</span>
          </button>

          {/* Unfiled */}
          <button
            onClick={() => { setSelectedFolder("unfiled"); setPage(1); setSelectedContacts(new Set()); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
              selectedFolder === "unfiled" ? "bg-blue-50 text-[#0EA5E9] font-semibold" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <FileText size={15} className={selectedFolder === "unfiled" ? "text-[#0EA5E9]" : "text-gray-400"} />
            <span className="flex-1 truncate">Unfiled</span>
          </button>

          {/* Divider */}
          {filteredFolders.length > 0 && <div className="mx-3 my-1.5 border-t border-gray-100" />}

          {/* User Folders */}
          {filteredFolders.map((f) => (
            <div key={f.id} className="relative group">
              {renamingFolderId === f.id ? (
                <div className="px-3 py-1.5">
                  <input
                    ref={renameRef}
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renamingValue.trim()) {
                        renameFolderMutation.mutate({ id: f.id, name: renamingValue.trim() });
                      }
                      if (e.key === "Escape") { setRenamingFolderId(null); setRenamingValue(""); }
                    }}
                    onBlur={() => { setRenamingFolderId(null); setRenamingValue(""); }}
                    className="w-full px-2 py-1 rounded-lg border border-[#0EA5E9] text-sm outline-none bg-white"
                  />
                </div>
              ) : (
                <button
                  onClick={() => { setSelectedFolder(f.id); setPage(1); setSelectedContacts(new Set()); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                    selectedFolder === f.id ? "bg-blue-50 text-[#0EA5E9] font-semibold" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {selectedFolder === f.id ? (
                    <FolderOpen size={15} className="text-[#0EA5E9] shrink-0" />
                  ) : (
                    <Folder size={15} className="text-gray-400 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-gray-400">{f.contact_count}</span>

                  {/* Three-dot menu */}
                  <div
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); setFolderMenuId(folderMenuId === f.id ? null : f.id); }}
                  >
                    <MoreHorizontal size={14} className="text-gray-400 hover:text-gray-600" />
                  </div>
                </button>
              )}

              {/* Context menu */}
              {folderMenuId === f.id && (
                <div
                  ref={folderMenuRef}
                  className="absolute right-2 top-full z-50 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 overflow-hidden"
                >
                  <button
                    onClick={() => { setRenamingFolderId(f.id); setRenamingValue(f.name); setFolderMenuId(null); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Pencil size={13} /> Rename
                  </button>
                  <button
                    onClick={() => { setDeleteFolder(f); setFolderMenuId(null); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Create folder */}
          {creatingFolder ? (
            <div className="px-3 py-1.5">
              <input
                ref={newFolderRef}
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFolderName.trim()) {
                    createFolderMutation.mutate(newFolderName.trim());
                  }
                  if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                }}
                onBlur={() => { if (!newFolderName.trim()) { setCreatingFolder(false); setNewFolderName(""); } }}
                className="w-full px-2 py-1 rounded-lg border border-[#0EA5E9] text-sm outline-none bg-white"
              />
            </div>
          ) : (
            <button
              onClick={() => setCreatingFolder(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-[#0EA5E9] hover:bg-gray-50 transition-colors"
            >
              <Plus size={14} /> New Folder
            </button>
          )}
        </div>
      </div>

      {/* ===== Main Content ===== */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>
              {selectedFolder === null ? "All Contacts" : selectedFolder === "unfiled" ? "Unfiled Contacts" : folders.find((f) => f.id === selectedFolder)?.name ?? "Contacts"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} contacts</p>
          </div>
          <button
            onClick={() => { setShowAdd(true); setNewFolderId(selectedFolder && selectedFolder !== "unfiled" ? selectedFolder : null); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            <Plus size={16} /> Add Contact
          </button>
        </div>

        {/* Bulk selection toolbar */}
        {selectedContacts.size > 0 && (
          <div className="bg-[#1E3A5F] rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3 text-white text-sm">
            <Check size={16} />
            <span className="font-semibold">{selectedContacts.size} selected</span>
            <div className="flex-1" />

            {/* Move to folder dropdown */}
            <div className="relative" ref={moveDropdownRef}>
              <button
                onClick={() => setShowMoveDropdown((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
              >
                <Folder size={14} /> Move to Folder <ChevronDown size={12} />
              </button>
              {showMoveDropdown && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-1 max-h-60 overflow-y-auto">
                  <button
                    onClick={() => unfileMutation.mutate()}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <FileText size={14} className="text-gray-400" /> Unfiled
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => moveMutation.mutate(f.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Folder size={14} className="text-gray-400" /> {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedContacts(new Set())}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
            >
              Deselect All
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4">
          <div className="flex items-center gap-3">
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
              <span key={s} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {s}
                <button onClick={() => { const next = { ...activeFilters, sources: activeFilters.sources.filter((x) => x !== s) }; setActiveFilters(next); setPendingFilters(next); }}>
                  <X size={10} />
                </button>
              </span>
            ))}
            {activeFilters.dateDays && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                Last {activeFilters.dateDays}d
                <button onClick={() => { const next = { ...activeFilters, dateDays: null }; setActiveFilters(next); setPendingFilters(next); }}><X size={10} /></button>
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

                {filterOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>Filters</span>
                      {activeCount > 0 && (
                        <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-600 font-medium">Clear all</button>
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
                              <button key={s} onClick={() => togglePendingSource(s)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${on ? "bg-[#1E3A5F] text-white border-[#1E3A5F]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                              >{s}</button>
                            );
                          })}
                        </div>
                      </div>
                      {/* Date */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date Added</p>
                        <div className="flex flex-col gap-1">
                          {DATE_OPTIONS.map((opt) => (
                            <label key={opt.label} className="flex items-center gap-2.5 cursor-pointer group">
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${pendingFilters.dateDays === opt.days ? "border-[#0EA5E9] bg-[#0EA5E9]" : "border-gray-300 group-hover:border-gray-400"}`}
                                onClick={() => setPendingFilters((f) => ({ ...f, dateDays: opt.days }))}
                              >
                                {pendingFilters.dateDays === opt.days && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className="text-sm text-gray-700" onClick={() => setPendingFilters((f) => ({ ...f, dateDays: opt.days }))}>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {/* Budget */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Budget Range</p>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                            <input type="number" placeholder="Min" value={pendingFilters.priceMin} onChange={(e) => setPendingFilters((f) => ({ ...f, priceMin: e.target.value }))} className="w-full pl-6 pr-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
                          </div>
                          <span className="text-gray-400 text-xs shrink-0">to</span>
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                            <input type="number" placeholder="Max" value={pendingFilters.priceMax} onChange={(e) => setPendingFilters((f) => ({ ...f, priceMax: e.target.value }))} className="w-full pl-6 pr-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
                          </div>
                        </div>
                      </div>
                      {/* Location */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</p>
                        <input type="text" placeholder="City, neighborhood, or zip..." value={pendingFilters.location} onChange={(e) => setPendingFilters((f) => ({ ...f, location: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
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
                              <div onClick={() => setPendingFilters((f) => ({ ...f, [key]: !f[key] }))} className={`w-9 h-5 rounded-full transition-colors relative ${pendingFilters[key] ? "bg-[#0EA5E9]" : "bg-gray-200"}`}>
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${pendingFilters[key] ? "translate-x-4" : "translate-x-0.5"}`} />
                              </div>
                              <span className="text-sm text-gray-700">{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-4">
                      <button onClick={applyFilters} className="w-full py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>Apply Filters</button>
                    </div>
                  </div>
                )}
              </div>

              {/* View toggle */}
              <div className="flex rounded-xl overflow-hidden border border-gray-200">
                <button onClick={() => setView("table")} className={`p-2 transition-colors ${view === "table" ? "text-white" : "bg-white text-gray-400"}`} style={view === "table" ? { backgroundColor: "#1E3A5F" } : {}}>
                  <List size={16} />
                </button>
                <button onClick={() => setView("grid")} className={`p-2 transition-colors ${view === "grid" ? "text-white" : "bg-white text-gray-400"}`} style={view === "grid" ? { backgroundColor: "#1E3A5F" } : {}}>
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
              {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-gray-50 rounded-xl" />)}
            </div>
          </div>
        ) : view === "table" ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={contacts.length > 0 && selectedContacts.size === contacts.length}
                      onChange={selectAll}
                      className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] accent-[#0EA5E9] cursor-pointer"
                    />
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Phone</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Source</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Folder</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Added</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                      {activeCount > 0 ? "No contacts match these filters." : "No contacts yet — add your first one!"}
                    </td>
                  </tr>
                ) : (
                  contacts.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-b border-gray-50 cursor-pointer hover:bg-blue-50/40 transition-colors ${
                        i % 2 !== 0 ? "bg-gray-50/40" : ""
                      } ${selectedContacts.has(c.id) ? "bg-blue-50/60" : ""}`}
                    >
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedContacts.has(c.id)}
                          onChange={() => toggleSelectContact(c.id)}
                          className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] accent-[#0EA5E9] cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3" onClick={() => router.push(`/dashboard/contacts/${c.id}`)}>
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
                      <td className="px-4 py-3 text-sm text-gray-600" onClick={() => router.push(`/dashboard/contacts/${c.id}`)}>{c.email ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600" onClick={() => router.push(`/dashboard/contacts/${c.id}`)}>{c.phone ?? "—"}</td>
                      <td className="px-4 py-3" onClick={() => router.push(`/dashboard/contacts/${c.id}`)}>
                        {c.source ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{c.source}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={() => router.push(`/dashboard/contacts/${c.id}`)}>
                        {c.folder_name ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                            {c.folder_name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500" onClick={() => router.push(`/dashboard/contacts/${c.id}`)}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-blue-100 transition-colors" title="Call" onClick={() => c.phone && window.open("tel:" + c.phone)}>
                            <Phone size={13} className="text-gray-500" />
                          </button>
                          <button className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-blue-100 transition-colors" title="Email" onClick={() => c.email && window.open("mailto:" + c.email)}>
                            <Mail size={13} className="text-gray-500" />
                          </button>
                          <button className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-blue-100 transition-colors" title="View Profile" onClick={() => router.push(`/dashboard/contacts/${c.id}`)}>
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
              <span className="text-xs text-gray-500">Showing {contacts.length} of {total} contacts</span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-40">Prev</button>
                <span className="text-xs text-gray-500 px-2">{page} / {Math.max(1, totalPages)}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-40">Next</button>
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
                  <div className="flex items-start justify-between">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: getColor(c.id) }}
                    >
                      {initials(c.first_name, c.last_name)}
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(c.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelectContact(c.id); }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] accent-[#0EA5E9] cursor-pointer"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{c.first_name} {c.last_name}</p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {c.source && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{c.source}</span>
                      )}
                      {c.folder_name && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">{c.folder_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-gray-500">{c.email ?? "No email"}</p>
                    <p className="text-xs text-gray-500">{c.phone ?? "No phone"}</p>
                  </div>
                  <button className="w-full py-2 rounded-xl text-xs font-semibold text-white" style={{ backgroundColor: "#1E3A5F" }}>
                    View Profile
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ===== Add Contact Modal ===== */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Add New Contact</h3>
                <p className="text-xs text-gray-400 mt-0.5">Fill in the details to add a new lead or client</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
              {/* Contact Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Contact Type</label>
                <div className="flex gap-2">
                  {([{ value: "buyer", label: "Buyer" }, { value: "seller", label: "Seller" }, { value: "both", label: "Both" }] as const).map((t) => (
                    <button key={t.value} onClick={() => setNewType(newType === t.value ? "" : t.value)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${newType === t.value ? "bg-[#1E3A5F] text-white border-[#1E3A5F]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                    >{t.label}</button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Full Name <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="First name" value={newFirst} onChange={(e) => setNewFirst(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors" />
                  <input placeholder="Last name" value={newLast} onChange={(e) => setNewLast(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors" />
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Contact Information</label>
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="email" placeholder="Email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors" />
                  </div>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="tel" placeholder="Phone number" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors" />
                  </div>
                </div>
              </div>

              {/* Folder */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Folder</label>
                <select
                  value={newFolderId ?? ""}
                  onChange={(e) => setNewFolderId(e.target.value || null)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                >
                  <option value="">Unfiled</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Lead Source */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Lead Source</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCES.map((s) => (
                    <button key={s} onClick={() => setNewSource(newSource === s ? "" : s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${newSource === s ? "bg-[#0EA5E9] text-white border-[#0EA5E9]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                    >{s}</button>
                  ))}
                </div>
              </div>

              {/* Budget Range */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Budget Range</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <input type="number" placeholder="Min" value={newBudgetMin} onChange={(e) => setNewBudgetMin(e.target.value)} className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors" />
                  </div>
                  <span className="text-gray-400 text-xs shrink-0">to</span>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <input type="number" placeholder="Max" value={newBudgetMax} onChange={(e) => setNewBudgetMax(e.target.value)} className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors" />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Preferred Location</label>
                <input type="text" placeholder="City, neighborhood, or zip code" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors" />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Notes</label>
                <textarea placeholder="Any initial notes about this contact..." value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors resize-none" />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
              <button
                disabled={!newFirst || !newLast || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                {createMutation.isPending ? "Creating..." : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Delete Folder Confirmation Modal ===== */}
      {deleteFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Delete Folder</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone.</p>
                </div>
              </div>

              <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
                <p className="text-sm text-red-800">
                  <strong>{deleteFolder.contact_count}</strong> contact{deleteFolder.contact_count !== 1 ? "s" : ""} will be moved to <strong>Unfiled</strong>.
                  The folder <strong>&quot;{deleteFolder.name}&quot;</strong> will be permanently deleted.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Type <span className="text-red-600 font-bold">{deleteFolder.name}</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteFolder.name}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-red-400 bg-gray-50 focus:bg-white transition-colors"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => { setDeleteFolder(null); setDeleteConfirmText(""); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirmText !== deleteFolder.name || deleteFolderMutation.isPending}
                onClick={() => deleteFolderMutation.mutate({ id: deleteFolder.id, confirmName: deleteConfirmText })}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-30 transition-opacity bg-red-600 hover:bg-red-700"
              >
                {deleteFolderMutation.isPending ? "Deleting..." : "Delete Folder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
