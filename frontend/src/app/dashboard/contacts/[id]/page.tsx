"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getContact, updateContact, deleteContact } from "@/lib/api/contacts";
import type { UpdateContactBody } from "@/lib/api/contacts";
import { listActivities, createActivity } from "@/lib/api/activities";
import { listDeals } from "@/lib/api/deals";
import { getBuyerProfile, createBuyerProfile, updateBuyerProfile } from "@/lib/api/buyer-profiles";
import type { CreateBuyerProfileBody } from "@/lib/api/buyer-profiles";
import { getAIProfile, regenerateAIProfile } from "@/lib/api/ai-profiles";
import { createPortalInvite, listPortalInvites, revokePortalInvite, type PortalToken } from "@/lib/api/portal";
import { useUIStore } from "@/store/ui-store";
import {
  Phone,
  Mail,
  MessageSquare,
  FileText,
  ChevronLeft,
  Home,
  ChevronDown,
  ChevronRight,
  Send,
  Edit2,
  Trash2,
  Sparkles,
  Save,
  X,
  DollarSign,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Plus,
  User,
  BedDouble,
  Link2,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";

const typeIconColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#0EA5E9" },
  email: { bg: "#F0FDF4", color: "#22C55E" },
  note: { bg: "#FFFBEB", color: "#F59E0B" },
  showing: { bg: "#EDE9FE", color: "#8B5CF6" },
  task: { bg: "#EFF6FF", color: "#0EA5E9" },
};

const typeIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: FileText,
  showing: Home,
  task: FileText,
};

const stageColors: Record<string, string> = {
  Lead: "#6B7280",
  Contacted: "#0EA5E9",
  Touring: "#8B5CF6",
  Offer: "#F59E0B",
  "Under Contract": "#22C55E",
  Closed: "#1E3A5F",
  Lost: "#EF4444",
};

function getAvatarColor(id: string) {
  const colors = ["#0EA5E9", "#22C55E", "#F59E0B", "#8B5CF6", "#EF4444", "#1E3A5F"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function timeStr(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const tabOptions = ["All Activity", "Calls", "Emails", "Notes", "Showings", "Buyer Profile", "AI Profile"];
const tabTypeMap: Record<string, string> = {
  Calls: "call",
  Emails: "email",
  Notes: "note",
  Showings: "showing",
};

const sourceOptions = ["Zillow", "Referral", "Cold Call", "Open House", "WhatsApp"];
const propertyTypes = ["House", "Condo", "Townhouse", "Multi-family"];
const timelineOptions = ["ASAP", "1-3 months", "3-6 months", "6-12 months", "Just browsing"];

export default function ContactDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const setChatOpen = useUIStore((s) => s.setChatOpen);

  const [activeTab, setActiveTab] = useState("All Activity");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<"call" | "email" | "note" | "showing" | "task">("note");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState<"high" | "medium" | "low">("medium");

  // Edit contact modal
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "", source: "" });

  // Delete confirmation modal
  const [showDelete, setShowDelete] = useState(false);

  // Portal sharing
  const [showPortal, setShowPortal] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalInvites, setPortalInvites] = useState<PortalToken[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Buyer profile editing
  const [editingBuyer, setEditingBuyer] = useState(false);
  const [buyerForm, setBuyerForm] = useState<{
    budget_min: string;
    budget_max: string;
    bedrooms: string;
    bathrooms: string;
    property_type: string;
    pre_approved: boolean;
    timeline: string;
    locations: string;
    must_haves: string;
    deal_breakers: string;
    notes: string;
  }>({
    budget_min: "",
    budget_max: "",
    bedrooms: "",
    bathrooms: "",
    property_type: "",
    pre_approved: false,
    timeline: "",
    locations: "",
    must_haves: "",
    deal_breakers: "",
    notes: "",
  });

  // --- Queries ---
  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const token = await getToken();
      return getContact(token!, id);
    },
  });

  const typeFilter = tabTypeMap[activeTab];
  const { data: activitiesData } = useQuery({
    queryKey: ["activities", id, typeFilter],
    queryFn: async () => {
      const token = await getToken();
      return listActivities(token!, id, typeFilter);
    },
  });

  const { data: dealsData } = useQuery({
    queryKey: ["deals", { contact_id: id }],
    queryFn: async () => {
      const token = await getToken();
      return listDeals(token!, { contact_id: id });
    },
  });

  const { data: buyerProfile, error: buyerProfileError } = useQuery({
    queryKey: ["buyer-profile", id],
    queryFn: async () => {
      const token = await getToken();
      return getBuyerProfile(token!, id);
    },
    retry: false,
  });

  const buyerProfileNotFound = buyerProfileError && (buyerProfileError as Error).message?.includes("404");

  const { data: aiProfile, error: aiProfileError } = useQuery({
    queryKey: ["ai-profile", id],
    queryFn: async () => {
      const token = await getToken();
      return getAIProfile(token!, id);
    },
    retry: false,
  });

  const aiProfileNotFound = aiProfileError && (aiProfileError as Error).message?.includes("404");

  // --- Mutations ---
  const logMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createActivity(token!, id, {
        type: noteType,
        body: note || undefined,
        ...(noteType === "task" ? {
          due_date: taskDueDate || undefined,
          priority: taskPriority,
        } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setNote("");
      setTaskDueDate("");
      setTaskPriority("medium");
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async (body: UpdateContactBody) => {
      const token = await getToken();
      return updateContact(token!, id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      setShowEdit(false);
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return deleteContact(token!, id);
    },
    onSuccess: () => {
      router.push("/dashboard/contacts");
    },
  });

  const createBuyerMutation = useMutation({
    mutationFn: async (body: CreateBuyerProfileBody) => {
      const token = await getToken();
      return createBuyerProfile(token!, id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyer-profile", id] });
      setEditingBuyer(false);
    },
  });

  const updateBuyerMutation = useMutation({
    mutationFn: async (body: CreateBuyerProfileBody) => {
      const token = await getToken();
      return updateBuyerProfile(token!, id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyer-profile", id] });
      setEditingBuyer(false);
    },
  });

  const regenerateAIMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return regenerateAIProfile(token!, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-profile", id] });
    },
  });

  // --- Helpers ---
  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const openEditModal = () => {
    if (!contact) return;
    setEditForm({
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      source: contact.source ?? "",
    });
    setShowEdit(true);
  };

  const handleEditSave = () => {
    const body: UpdateContactBody = {};
    if (editForm.first_name) body.first_name = editForm.first_name;
    if (editForm.last_name) body.last_name = editForm.last_name;
    body.email = editForm.email || undefined;
    body.phone = editForm.phone || undefined;
    body.source = editForm.source || undefined;
    updateContactMutation.mutate(body);
  };

  const openBuyerEdit = (existing?: boolean) => {
    if (existing && buyerProfile) {
      setBuyerForm({
        budget_min: buyerProfile.budget_min?.toString() ?? "",
        budget_max: buyerProfile.budget_max?.toString() ?? "",
        bedrooms: buyerProfile.bedrooms?.toString() ?? "",
        bathrooms: buyerProfile.bathrooms?.toString() ?? "",
        property_type: buyerProfile.property_type ?? "",
        pre_approved: buyerProfile.pre_approved,
        timeline: buyerProfile.timeline ?? "",
        locations: (buyerProfile.locations ?? []).join(", "),
        must_haves: (buyerProfile.must_haves ?? []).join(", "),
        deal_breakers: (buyerProfile.deal_breakers ?? []).join(", "),
        notes: buyerProfile.notes ?? "",
      });
    } else {
      setBuyerForm({
        budget_min: "", budget_max: "", bedrooms: "", bathrooms: "",
        property_type: "", pre_approved: false, timeline: "",
        locations: "", must_haves: "", deal_breakers: "", notes: "",
      });
    }
    setEditingBuyer(true);
  };

  const handleBuyerSave = () => {
    const body: CreateBuyerProfileBody = {};
    if (buyerForm.budget_min) body.budget_min = Number(buyerForm.budget_min);
    if (buyerForm.budget_max) body.budget_max = Number(buyerForm.budget_max);
    if (buyerForm.bedrooms) body.bedrooms = Number(buyerForm.bedrooms);
    if (buyerForm.bathrooms) body.bathrooms = Number(buyerForm.bathrooms);
    if (buyerForm.property_type) body.property_type = buyerForm.property_type;
    body.pre_approved = buyerForm.pre_approved;
    if (buyerForm.timeline) body.timeline = buyerForm.timeline;
    if (buyerForm.locations.trim()) body.locations = buyerForm.locations.split(",").map((s) => s.trim()).filter(Boolean);
    if (buyerForm.must_haves.trim()) body.must_haves = buyerForm.must_haves.split(",").map((s) => s.trim()).filter(Boolean);
    if (buyerForm.deal_breakers.trim()) body.deal_breakers = buyerForm.deal_breakers.split(",").map((s) => s.trim()).filter(Boolean);
    if (buyerForm.notes) body.notes = buyerForm.notes;

    if (buyerProfile && !buyerProfileNotFound) {
      updateBuyerMutation.mutate(body);
    } else {
      createBuyerMutation.mutate(body);
    }
  };

  const activities = activitiesData?.activities ?? [];
  const deals = dealsData?.deals ?? [];

  // --- Action button handlers ---
  // --- Portal helpers ---
  const openPortalModal = async () => {
    setShowPortal(true);
    setPortalLoading(true);
    try {
      const token = await getToken();
      const data = await listPortalInvites(token!);
      setPortalInvites(data.invites.filter((inv) => inv.contact_id === id));
    } catch {
      setPortalInvites([]);
    } finally {
      setPortalLoading(false);
    }
  };

  const generatePortalLink = async () => {
    setPortalLoading(true);
    try {
      const token = await getToken();
      const inv = await createPortalInvite(token!, id);
      setPortalInvites((prev) => [inv, ...prev]);
    } catch {
      // silent
    } finally {
      setPortalLoading(false);
    }
  };

  const revokeLink = async (tokenId: string) => {
    try {
      const token = await getToken();
      await revokePortalInvite(token!, tokenId);
      setPortalInvites((prev) => prev.filter((inv) => inv.id !== tokenId));
    } catch {
      // silent
    }
  };

  const copyPortalUrl = (portalToken: string) => {
    const url = `${window.location.origin}/portal/${portalToken}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(portalToken);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const actionButtons = [
    {
      icon: Phone,
      label: "Call",
      color: "#0EA5E9",
      onClick: () => contact?.phone && window.open("tel:" + contact.phone),
    },
    {
      icon: Mail,
      label: "Email",
      color: "#22C55E",
      onClick: () => contact?.email && window.open("mailto:" + contact.email),
    },
    {
      icon: MessageSquare,
      label: "Message",
      color: "#8B5CF6",
      onClick: () => setChatOpen(true),
    },
    {
      icon: FileText,
      label: "Log",
      color: "#F59E0B",
      onClick: () => {
        const el = document.getElementById("activity-input");
        el?.focus();
        el?.scrollIntoView({ behavior: "smooth" });
      },
    },
  ];

  if (contactLoading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-6 w-32 bg-gray-100 rounded mb-6" />
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-4 space-y-4">
            <div className="h-64 bg-gray-100 rounded-2xl" />
            <div className="h-48 bg-gray-100 rounded-2xl" />
          </div>
          <div className="col-span-8 h-96 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Contact not found.</p>
      </div>
    );
  }

  const avatarColor = getAvatarColor(contact.id);
  const initials = `${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase();

  return (
    <div className="p-6">
      {/* Edit Contact Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Edit Contact</h3>
              <button onClick={() => setShowEdit(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">First Name</label>
                  <input
                    value={editForm.first_name}
                    onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Last Name</label>
                  <input
                    value={editForm.last_name}
                    onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Email</label>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Phone</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Source</label>
                <select
                  value={editForm.source}
                  onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
                >
                  <option value="">Select source...</option>
                  {sourceOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={!editForm.first_name || !editForm.last_name || updateContactMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                <Save size={14} />
                {updateContactMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-2" style={{ color: "#1E3A5F" }}>Delete Contact</h3>
            <p className="text-sm text-gray-500 mb-5">Delete this contact? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteContactMutation.mutate()}
                disabled={deleteContactMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#EF4444" }}
              >
                <Trash2 size={14} />
                {deleteContactMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Share Modal */}
      {showPortal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>
                Share Client Portal
              </h3>
              <button
                onClick={() => setShowPortal(false)}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Generate a portal link so your client can view their deal progress,
              properties, and activity timeline.
            </p>

            {portalLoading && portalInvites.length === 0 ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                {portalInvites.length > 0 ? (
                  <div className="space-y-3 mb-4">
                    {portalInvites.map((inv) => {
                      const url = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${inv.token}`;
                      const expiryDate = new Date(inv.expires_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      return (
                        <div
                          key={inv.id}
                          className="border border-gray-200 rounded-xl p-3"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              readOnly
                              value={url}
                              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 truncate"
                            />
                            <button
                              onClick={() => copyPortalUrl(inv.token)}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors"
                            >
                              {copiedToken === inv.token ? (
                                <>
                                  <Check size={12} /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={12} /> Copy
                                </>
                              )}
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>Expires {expiryDate}</span>
                            <div className="flex items-center gap-2">
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-600 hover:text-cyan-700 flex items-center gap-0.5"
                              >
                                <ExternalLink size={11} /> Preview
                              </a>
                              <button
                                onClick={() => revokeLink(inv.id)}
                                className="text-red-400 hover:text-red-600"
                              >
                                Revoke
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-6 text-center mb-4">
                    <Link2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      No active portal links for this contact
                    </p>
                  </div>
                )}
                <button
                  onClick={generatePortalLink}
                  disabled={portalLoading}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "#0EA5E9" }}
                >
                  {portalLoading ? "Generating..." : "Generate New Link"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => router.push("/dashboard/contacts")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
      >
        <ChevronLeft size={16} /> Back to Contacts
      </button>

      <div className="grid grid-cols-12 gap-5">
        {/* LEFT COLUMN */}
        <div className="col-span-4 flex flex-col gap-4">
          {/* Profile card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col items-center text-center gap-3 pb-5 border-b border-gray-100">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 justify-center">
                  <h2 className="text-xl font-bold" style={{ color: "#1E3A5F" }}>
                    {contact.first_name} {contact.last_name}
                  </h2>
                  <button
                    onClick={openEditModal}
                    className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
                    title="Edit contact"
                  >
                    <Edit2 size={14} className="text-gray-400" />
                  </button>
                  <button
                    onClick={openPortalModal}
                    className="w-7 h-7 rounded-lg hover:bg-cyan-50 flex items-center justify-center transition-colors"
                    title="Share portal link"
                  >
                    <Link2 size={14} className="text-cyan-500" />
                  </button>
                  <button
                    onClick={() => setShowDelete(true)}
                    className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
                    title="Delete contact"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
                {contact.source && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block"
                    style={{ backgroundColor: "#EFF6FF", color: "#0EA5E9" }}
                  >
                    {contact.source}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 pt-4">
              {actionButtons.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl transition-colors hover:bg-gray-50"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${action.color}18` }}
                  >
                    <action.icon size={16} style={{ color: action.color }} />
                  </div>
                  <span className="text-xs text-gray-500">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="font-bold mb-3" style={{ color: "#1E3A5F" }}>Contact Info</h4>
            <div className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Phone size={13} className="text-gray-400" />
                {contact.phone ?? "No phone"}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Mail size={13} className="text-gray-400" />
                {contact.email ?? "No email"}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400 text-xs">Source:</span>
                {contact.source ?? "Unknown"}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400 text-xs">Added:</span>
                {new Date(contact.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Buyer Profile */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold" style={{ color: "#1E3A5F" }}>Buyer Profile</h4>
              {buyerProfile && !buyerProfileNotFound && !editingBuyer && (
                <button
                  onClick={() => openBuyerEdit(true)}
                  className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <Edit2 size={13} className="text-gray-400" />
                </button>
              )}
            </div>

            {editingBuyer ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Budget Min ($)</label>
                    <input
                      type="number"
                      value={buyerForm.budget_min}
                      onChange={(e) => setBuyerForm({ ...buyerForm, budget_min: e.target.value })}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Budget Max ($)</label>
                    <input
                      type="number"
                      value={buyerForm.budget_max}
                      onChange={(e) => setBuyerForm({ ...buyerForm, budget_max: e.target.value })}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Bedrooms</label>
                    <input
                      type="number"
                      value={buyerForm.bedrooms}
                      onChange={(e) => setBuyerForm({ ...buyerForm, bedrooms: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Bathrooms</label>
                    <input
                      type="number"
                      value={buyerForm.bathrooms}
                      onChange={(e) => setBuyerForm({ ...buyerForm, bathrooms: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Property Type</label>
                  <select
                    value={buyerForm.property_type}
                    onChange={(e) => setBuyerForm({ ...buyerForm, property_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
                  >
                    <option value="">Select type...</option>
                    {propertyTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500">Pre-approved</label>
                  <button
                    onClick={() => setBuyerForm({ ...buyerForm, pre_approved: !buyerForm.pre_approved })}
                    className={`w-10 h-5 rounded-full transition-colors relative ${buyerForm.pre_approved ? "bg-sky-500" : "bg-gray-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${buyerForm.pre_approved ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Timeline</label>
                  <select
                    value={buyerForm.timeline}
                    onChange={(e) => setBuyerForm({ ...buyerForm, timeline: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
                  >
                    <option value="">Select timeline...</option>
                    {timelineOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Locations (comma-separated)</label>
                  <input
                    value={buyerForm.locations}
                    onChange={(e) => setBuyerForm({ ...buyerForm, locations: e.target.value })}
                    placeholder="e.g. Downtown, Midtown, Suburbs"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Must-haves (comma-separated)</label>
                  <input
                    value={buyerForm.must_haves}
                    onChange={(e) => setBuyerForm({ ...buyerForm, must_haves: e.target.value })}
                    placeholder="e.g. Garage, Pool, Backyard"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Deal-breakers (comma-separated)</label>
                  <input
                    value={buyerForm.deal_breakers}
                    onChange={(e) => setBuyerForm({ ...buyerForm, deal_breakers: e.target.value })}
                    placeholder="e.g. HOA, No parking"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Notes</label>
                  <textarea
                    value={buyerForm.notes}
                    onChange={(e) => setBuyerForm({ ...buyerForm, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={() => setEditingBuyer(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBuyerSave}
                    disabled={createBuyerMutation.isPending || updateBuyerMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "#0EA5E9" }}
                  >
                    <Save size={12} />
                    {createBuyerMutation.isPending || updateBuyerMutation.isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : buyerProfile && !buyerProfileNotFound ? (
              <div className="flex flex-col gap-2 text-sm">
                {(buyerProfile.budget_min != null || buyerProfile.budget_max != null) && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs">Budget:</span>
                    {buyerProfile.budget_min != null ? `$${buyerProfile.budget_min.toLocaleString()}` : "$0"}
                    {" - "}
                    {buyerProfile.budget_max != null ? `$${buyerProfile.budget_max.toLocaleString()}` : "No max"}
                  </div>
                )}
                {(buyerProfile.bedrooms != null || buyerProfile.bathrooms != null) && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs">Beds/Baths:</span>
                    {buyerProfile.bedrooms ?? "-"} bd / {buyerProfile.bathrooms ?? "-"} ba
                  </div>
                )}
                {buyerProfile.property_type && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs">Type:</span>
                    {buyerProfile.property_type}
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-gray-400 text-xs">Pre-approved:</span>
                  <span className={buyerProfile.pre_approved ? "text-green-600 font-semibold" : "text-gray-400"}>
                    {buyerProfile.pre_approved ? "Yes" : "No"}
                  </span>
                </div>
                {buyerProfile.timeline && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs">Timeline:</span>
                    {buyerProfile.timeline}
                  </div>
                )}
                {buyerProfile.locations?.length > 0 && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs shrink-0 mt-0.5">Locations:</span>
                    <div className="flex flex-wrap gap-1">
                      {buyerProfile.locations.map((loc) => (
                        <span key={loc} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{loc}</span>
                      ))}
                    </div>
                  </div>
                )}
                {buyerProfile.must_haves?.length > 0 && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs shrink-0 mt-0.5">Must-haves:</span>
                    <div className="flex flex-wrap gap-1">
                      {buyerProfile.must_haves.map((item) => (
                        <span key={item} className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
                {buyerProfile.deal_breakers?.length > 0 && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs shrink-0 mt-0.5">Deal-breakers:</span>
                    <div className="flex flex-wrap gap-1">
                      {buyerProfile.deal_breakers.map((item) => (
                        <span key={item} className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
                {buyerProfile.notes && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <span className="text-gray-400 text-xs shrink-0 mt-0.5">Notes:</span>
                    <p className="text-xs text-gray-500">{buyerProfile.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-gray-400 mb-3">No buyer profile yet.</p>
                <button
                  onClick={() => openBuyerEdit(false)}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold"
                  style={{ backgroundColor: "#0EA5E9" }}
                >
                  Create Buyer Profile
                </button>
              </div>
            )}
          </div>

          {/* AI Summary */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold flex items-center gap-2" style={{ color: "#1E3A5F" }}>
                <Sparkles size={15} className="text-amber-400" />
                AI Summary
              </h4>
              {aiProfile && !aiProfileNotFound && (
                <button
                  onClick={() => regenerateAIMutation.mutate()}
                  disabled={regenerateAIMutation.isPending}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 disabled:opacity-50"
                >
                  {regenerateAIMutation.isPending ? "Generating..." : "Regenerate"}
                </button>
              )}
            </div>
            {aiProfile && !aiProfileNotFound ? (
              <p className="text-sm text-gray-600 leading-relaxed">{aiProfile.summary}</p>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-gray-400 mb-3">No AI summary generated yet.</p>
                <button
                  onClick={() => regenerateAIMutation.mutate()}
                  disabled={regenerateAIMutation.isPending}
                  className="flex items-center gap-1.5 mx-auto px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: "#0EA5E9" }}
                >
                  <Sparkles size={12} />
                  {regenerateAIMutation.isPending ? "Generating..." : "Generate"}
                </button>
              </div>
            )}
          </div>

          {/* Linked Deals */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="font-bold mb-3" style={{ color: "#1E3A5F" }}>Linked Deals</h4>
            {deals.length === 0 ? (
              <p className="text-xs text-gray-400">No deals linked to this contact.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    onClick={() => router.push(`/dashboard/pipeline`)}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{deal.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {deal.value ? `$${deal.value.toLocaleString()}` : "No value"}
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: stageColors[deal.stage_name] ?? "#6B7280" }}
                    >
                      {deal.stage_name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN -- Activity Timeline */}
        <div className="col-span-8 flex flex-col gap-4">
          {/* Tabs */}
          <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex gap-1">
            {tabOptions.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === tab ? "text-white" : "text-gray-500 hover:bg-gray-50"
                }`}
                style={activeTab === tab ? { backgroundColor: "#1E3A5F" } : {}}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "Buyer Profile" ? (
            /* ── BUYER PROFILE TAB ── */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between p-6 pb-0">
                <h4 className="text-lg font-bold flex items-center gap-2" style={{ color: "#1E3A5F" }}>
                  <User size={18} className="text-sky-500" />
                  Buyer Profile
                </h4>
                {buyerProfile && !buyerProfileNotFound && !editingBuyer && (
                  <button
                    onClick={() => openBuyerEdit(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    <Edit2 size={13} />
                    Edit
                  </button>
                )}
              </div>

              {editingBuyer ? (
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Budget Min ($)</label>
                      <div className="relative">
                        <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="number"
                          value={buyerForm.budget_min}
                          onChange={(e) => setBuyerForm({ ...buyerForm, budget_min: e.target.value })}
                          placeholder="0"
                          className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Budget Max ($)</label>
                      <div className="relative">
                        <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="number"
                          value={buyerForm.budget_max}
                          onChange={(e) => setBuyerForm({ ...buyerForm, budget_max: e.target.value })}
                          placeholder="0"
                          className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Bedrooms</label>
                      <input
                        type="number"
                        value={buyerForm.bedrooms}
                        onChange={(e) => setBuyerForm({ ...buyerForm, bedrooms: e.target.value })}
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Bathrooms</label>
                      <input
                        type="number"
                        value={buyerForm.bathrooms}
                        onChange={(e) => setBuyerForm({ ...buyerForm, bathrooms: e.target.value })}
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Property Type</label>
                      <select
                        value={buyerForm.property_type}
                        onChange={(e) => setBuyerForm({ ...buyerForm, property_type: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
                      >
                        <option value="">Select type...</option>
                        {propertyTypes.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Timeline</label>
                      <select
                        value={buyerForm.timeline}
                        onChange={(e) => setBuyerForm({ ...buyerForm, timeline: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
                      >
                        <option value="">Select timeline...</option>
                        {timelineOptions.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-5">
                    <label className="text-xs font-semibold text-gray-500">Pre-approved</label>
                    <button
                      onClick={() => setBuyerForm({ ...buyerForm, pre_approved: !buyerForm.pre_approved })}
                      className={`w-10 h-5 rounded-full transition-colors relative ${buyerForm.pre_approved ? "bg-sky-500" : "bg-gray-300"}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${buyerForm.pre_approved ? "translate-x-5" : "translate-x-0.5"}`}
                      />
                    </button>
                    <span className="text-xs text-gray-500">{buyerForm.pre_approved ? "Yes" : "No"}</span>
                  </div>
                  <div className="mt-5">
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Preferred Locations (comma-separated)</label>
                    <input
                      value={buyerForm.locations}
                      onChange={(e) => setBuyerForm({ ...buyerForm, locations: e.target.value })}
                      placeholder="e.g. Downtown, Midtown, Suburbs"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Must-haves (comma-separated)</label>
                    <input
                      value={buyerForm.must_haves}
                      onChange={(e) => setBuyerForm({ ...buyerForm, must_haves: e.target.value })}
                      placeholder="e.g. Garage, Pool, Backyard"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Deal-breakers (comma-separated)</label>
                    <input
                      value={buyerForm.deal_breakers}
                      onChange={(e) => setBuyerForm({ ...buyerForm, deal_breakers: e.target.value })}
                      placeholder="e.g. HOA, No parking"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Notes</label>
                    <textarea
                      value={buyerForm.notes}
                      onChange={(e) => setBuyerForm({ ...buyerForm, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button
                      onClick={() => setEditingBuyer(false)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBuyerSave}
                      disabled={createBuyerMutation.isPending || updateBuyerMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ backgroundColor: "#0EA5E9" }}
                    >
                      <Save size={14} />
                      {createBuyerMutation.isPending || updateBuyerMutation.isPending ? "Saving..." : "Save Profile"}
                    </button>
                  </div>
                </div>
              ) : buyerProfile && !buyerProfileNotFound ? (
                <div className="p-6">
                  {/* Summary cards row */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-sky-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign size={14} className="text-sky-500" />
                        <span className="text-xs font-semibold text-sky-600">Budget Range</span>
                      </div>
                      <p className="text-sm font-bold text-gray-800">
                        {buyerProfile.budget_min != null ? `$${buyerProfile.budget_min.toLocaleString()}` : "$0"}
                        {" - "}
                        {buyerProfile.budget_max != null ? `$${buyerProfile.budget_max.toLocaleString()}` : "No max"}
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <BedDouble size={14} className="text-purple-500" />
                        <span className="text-xs font-semibold text-purple-600">Beds / Baths</span>
                      </div>
                      <p className="text-sm font-bold text-gray-800">
                        {buyerProfile.bedrooms ?? "-"} bd / {buyerProfile.bathrooms ?? "-"} ba
                      </p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock size={14} className="text-amber-500" />
                        <span className="text-xs font-semibold text-amber-600">Timeline</span>
                      </div>
                      <p className="text-sm font-bold text-gray-800">
                        {buyerProfile.timeline ?? "Not set"}
                      </p>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {buyerProfile.property_type && (
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block mb-1">Property Type</span>
                          <span
                            className="inline-block text-sm font-semibold px-3 py-1 rounded-full"
                            style={{ backgroundColor: "#EFF6FF", color: "#0EA5E9" }}
                          >
                            {buyerProfile.property_type}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-semibold text-gray-400 block mb-1">Pre-approved</span>
                        <div className="flex items-center gap-2">
                          {buyerProfile.pre_approved ? (
                            <>
                              <CheckCircle2 size={16} className="text-green-500" />
                              <span className="text-sm font-semibold text-green-600">Yes</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={16} className="text-gray-400" />
                              <span className="text-sm font-semibold text-gray-500">No</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {buyerProfile.locations?.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-gray-400 flex items-center gap-1 mb-2">
                            <MapPin size={12} /> Preferred Locations
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {buyerProfile.locations.map((loc) => (
                              <span key={loc} className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">{loc}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Must-haves and Deal-breakers */}
                  {(buyerProfile.must_haves?.length > 0 || buyerProfile.deal_breakers?.length > 0) && (
                    <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t border-gray-100">
                      {buyerProfile.must_haves?.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-gray-400 flex items-center gap-1 mb-2">
                            <CheckCircle2 size={12} className="text-green-500" /> Must-haves
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {buyerProfile.must_haves.map((item) => (
                              <span key={item} className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-600">{item}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {buyerProfile.deal_breakers?.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-gray-400 flex items-center gap-1 mb-2">
                            <XCircle size={12} className="text-red-500" /> Deal-breakers
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {buyerProfile.deal_breakers.map((item) => (
                              <span key={item} className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">{item}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {buyerProfile.notes && (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <span className="text-xs font-semibold text-gray-400 block mb-2">Notes</span>
                      <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-4">{buyerProfile.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: "#EFF6FF" }}
                  >
                    <User size={28} className="text-sky-500" />
                  </div>
                  <h4 className="text-base font-bold mb-1" style={{ color: "#1E3A5F" }}>No Buyer Profile</h4>
                  <p className="text-sm text-gray-400 mb-5 text-center max-w-xs">
                    Create a buyer profile to track this contact&apos;s property preferences, budget, and timeline.
                  </p>
                  <button
                    onClick={() => openBuyerEdit(false)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
                    style={{ backgroundColor: "#0EA5E9" }}
                  >
                    <Plus size={14} />
                    Create Buyer Profile
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === "AI Profile" ? (
            /* ── AI PROFILE TAB ── */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between p-6 pb-0">
                <h4 className="text-lg font-bold flex items-center gap-2" style={{ color: "#1E3A5F" }}>
                  <Sparkles size={18} className="text-amber-400" />
                  AI Profile
                </h4>
                {aiProfile && !aiProfileNotFound && (
                  <button
                    onClick={() => regenerateAIMutation.mutate()}
                    disabled={regenerateAIMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={regenerateAIMutation.isPending ? "animate-spin" : ""} />
                    {regenerateAIMutation.isPending ? "Generating..." : "Regenerate"}
                  </button>
                )}
              </div>

              {aiProfile && !aiProfileNotFound ? (
                <div className="p-6">
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aiProfile.summary}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-4">
                    Last updated: {new Date(aiProfile.updated_at).toLocaleString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: "#FFFBEB" }}
                  >
                    <Sparkles size={28} className="text-amber-400" />
                  </div>
                  <h4 className="text-base font-bold mb-1" style={{ color: "#1E3A5F" }}>No AI Profile Yet</h4>
                  <p className="text-sm text-gray-400 mb-5 text-center max-w-xs">
                    Generate an AI-powered summary of this contact based on their activities, deals, and profile data.
                  </p>
                  <button
                    onClick={() => regenerateAIMutation.mutate()}
                    disabled={regenerateAIMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "#0EA5E9" }}
                  >
                    <Sparkles size={14} />
                    {regenerateAIMutation.isPending ? "Generating..." : "Generate AI Profile"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── ACTIVITY TABS ── */
            <>
              {/* Log activity */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex gap-2 mb-2">
                  {(["note", "call", "email", "showing", "task"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setNoteType(t)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                        noteType === t ? "text-white" : "bg-gray-100 text-gray-500"
                      }`}
                      style={noteType === t ? { backgroundColor: "#0EA5E9" } : {}}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea
                  id="activity-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={noteType === "task" ? "Describe the task..." : `Log a ${noteType} for ${contact.first_name}...`}
                  className="w-full text-sm text-gray-700 placeholder-gray-400 outline-none resize-none bg-transparent"
                  rows={2}
                />
                {noteType === "task" && (
                  <div className="flex gap-3 mt-2 pt-2 border-t border-gray-100">
                    <div className="flex-1">
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs outline-none focus:border-[#0EA5E9]"
                        placeholder="Due date"
                      />
                    </div>
                    <div className="flex gap-1">
                      {(
                        [
                          { value: "high" as const, label: "High", color: "#EF4444" },
                          { value: "medium" as const, label: "Med", color: "#F59E0B" },
                          { value: "low" as const, label: "Low", color: "#22C55E" },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setTaskPriority(p.value)}
                          className="px-2 py-1 rounded-lg border text-xs font-semibold transition-all"
                          style={{
                            borderColor: taskPriority === p.value ? p.color : "#e5e7eb",
                            color: taskPriority === p.value ? p.color : "#9ca3af",
                            backgroundColor: taskPriority === p.value ? `${p.color}10` : "transparent",
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end mt-2">
                  <button
                    disabled={!note.trim() || logMutation.isPending}
                    onClick={() => logMutation.mutate()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "#0EA5E9" }}
                  >
                    <Send size={12} />
                    {logMutation.isPending ? "Logging..." : "Log Activity"}
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h4 className="font-bold mb-5" style={{ color: "#1E3A5F" }}>Activity Timeline</h4>
                {activities.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No activities yet -- log one above!</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {activities.map((item, i) => {
                      const colors = typeIconColors[item.type] || typeIconColors.note;
                      const IconComp = typeIcons[item.type] || FileText;
                      const isExpanded = expandedItems.has(item.id);
                      return (
                        <div key={item.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                              style={{ backgroundColor: colors.bg }}
                            >
                              <IconComp size={15} style={{ color: colors.color }} />
                            </div>
                            {i < activities.length - 1 && (
                              <div className="w-px flex-1 mt-2 bg-gray-200" style={{ minHeight: 16 }} />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-gray-400">{timeStr(item.created_at)}</span>
                                  <span
                                    className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                                    style={{ backgroundColor: colors.bg, color: colors.color }}
                                  >
                                    {item.type}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-800">{item.body ?? `${item.type} logged`}</p>
                                {isExpanded && item.body && (
                                  <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3 leading-relaxed">
                                    {item.body}
                                  </p>
                                )}
                              </div>
                              {item.body && (
                                <button
                                  onClick={() => toggleExpand(item.id)}
                                  className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 hover:bg-gray-200 transition-colors"
                                >
                                  {isExpanded ? (
                                    <ChevronDown size={12} className="text-gray-400" />
                                  ) : (
                                    <ChevronRight size={12} className="text-gray-400" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
