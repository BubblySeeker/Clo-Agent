"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProperty, updateProperty, deleteProperty, getPropertyMatches } from "@/lib/api/properties";
import type { UpdatePropertyBody } from "@/lib/api/properties";
import { listDeals } from "@/lib/api/deals";
import {
  ChevronLeft, Edit2, Trash2, Save, X, MapPin, DollarSign,
  BedDouble, Bath, Ruler, Home, Calendar, Tag, FileText,
  Building, Users, Star, CheckCircle2, Clock, ExternalLink
} from "lucide-react";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "#DCFCE7", text: "#16A34A" },
  pending: { bg: "#FEF3C7", text: "#D97706" },
  sold: { bg: "#EDE9FE", text: "#7C3AED" },
  off_market: { bg: "#F1F5F9", text: "#64748B" },
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

function formatPropertyType(t: string | null) {
  if (!t) return "\u2014";
  return t.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function formatPrice(price: number | null) {
  if (price == null) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

function formatNumber(n: number | null | undefined) {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US").format(n);
}

const propertyTypeOptions = ["single_family", "condo", "townhouse", "multi_family", "land", "commercial"];
const statusOptions = ["active", "pending", "sold", "off_market"];
const listingTypeOptions = ["sale", "rent", "both"];

const tabs = ["Overview", "Deals", "Matching Buyers"] as const;

export default function PropertyDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<typeof tabs[number]>("Overview");

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    address: "", city: "", state: "", zip: "", price: "",
    bedrooms: "", bathrooms: "", sqft: "", property_type: "",
    status: "", listing_type: "", mls_id: "", description: "",
    year_built: "", lot_size: "",
  });

  // Delete confirmation modal
  const [showDelete, setShowDelete] = useState(false);

  // --- Queries ---
  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const token = await getToken();
      return getProperty(token!, id);
    },
  });

  const { data: dealsData } = useQuery({
    queryKey: ["property-deals", id],
    queryFn: async () => {
      const token = await getToken();
      return listDeals(token!);
    },
    enabled: activeTab === "Deals",
  });

  const { data: matchesData } = useQuery({
    queryKey: ["property-matches", id],
    queryFn: async () => {
      const token = await getToken();
      return getPropertyMatches(token!, id);
    },
    enabled: activeTab === "Matching Buyers",
  });

  // --- Mutations ---
  const updateMutation = useMutation({
    mutationFn: async (body: UpdatePropertyBody) => {
      const token = await getToken();
      return updateProperty(token!, id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setShowEdit(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return deleteProperty(token!, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      router.push("/dashboard/properties");
    },
  });

  // --- Helpers ---
  const openEditModal = () => {
    if (!property) return;
    setEditForm({
      address: property.address,
      city: property.city ?? "",
      state: property.state ?? "",
      zip: property.zip ?? "",
      price: property.price?.toString() ?? "",
      bedrooms: property.bedrooms?.toString() ?? "",
      bathrooms: property.bathrooms?.toString() ?? "",
      sqft: property.sqft?.toString() ?? "",
      property_type: property.property_type ?? "",
      status: property.status ?? "",
      listing_type: property.listing_type ?? "",
      mls_id: property.mls_id ?? "",
      description: property.description ?? "",
      year_built: property.year_built?.toString() ?? "",
      lot_size: property.lot_size?.toString() ?? "",
    });
    setShowEdit(true);
  };

  const handleEditSave = () => {
    const body: UpdatePropertyBody = {};
    if (editForm.address) body.address = editForm.address;
    if (editForm.city) body.city = editForm.city;
    if (editForm.state) body.state = editForm.state;
    if (editForm.zip) body.zip = editForm.zip;
    if (editForm.price) body.price = Number(editForm.price);
    if (editForm.bedrooms) body.bedrooms = Number(editForm.bedrooms);
    if (editForm.bathrooms) body.bathrooms = Number(editForm.bathrooms);
    if (editForm.sqft) body.sqft = Number(editForm.sqft);
    if (editForm.property_type) body.property_type = editForm.property_type;
    if (editForm.status) body.status = editForm.status;
    if (editForm.listing_type) body.listing_type = editForm.listing_type;
    if (editForm.mls_id) body.mls_id = editForm.mls_id;
    body.description = editForm.description || undefined;
    if (editForm.year_built) body.year_built = Number(editForm.year_built);
    if (editForm.lot_size) body.lot_size = Number(editForm.lot_size);
    updateMutation.mutate(body);
  };

  const propertyDeals = dealsData?.deals?.filter(d => d.property_id === id) ?? [];
  const matches = matchesData?.matches ?? [];

  // --- Loading ---
  if (isLoading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-6 w-32 bg-gray-100 rounded mb-6" />
        <div className="h-10 w-64 bg-gray-100 rounded-xl mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Property not found.</p>
      </div>
    );
  }

  const statusStyle = STATUS_COLORS[property.status] ?? { bg: "#F1F5F9", text: "#64748B" };
  const locationParts = [property.city, property.state, property.zip].filter(Boolean).join(", ");

  return (
    <div className="p-6">
      {/* Edit Property Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Edit Property</h3>
              <button onClick={() => setShowEdit(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Address *</label>
                <input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">City</label>
                  <input
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">State</label>
                  <input
                    value={editForm.state}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">ZIP</label>
                  <input
                    value={editForm.zip}
                    onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Price</label>
                  <input
                    type="number"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">MLS ID</label>
                  <input
                    value={editForm.mls_id}
                    onChange={(e) => setEditForm({ ...editForm, mls_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Bedrooms</label>
                  <input
                    type="number"
                    value={editForm.bedrooms}
                    onChange={(e) => setEditForm({ ...editForm, bedrooms: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Bathrooms</label>
                  <input
                    type="number"
                    value={editForm.bathrooms}
                    onChange={(e) => setEditForm({ ...editForm, bathrooms: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Sqft</label>
                  <input
                    type="number"
                    value={editForm.sqft}
                    onChange={(e) => setEditForm({ ...editForm, sqft: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Property Type</label>
                  <select
                    value={editForm.property_type}
                    onChange={(e) => setEditForm({ ...editForm, property_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
                  >
                    <option value="">Select...</option>
                    {propertyTypeOptions.map((t) => (
                      <option key={t} value={t}>{formatPropertyType(t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1).replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Listing Type</label>
                  <select
                    value={editForm.listing_type}
                    onChange={(e) => setEditForm({ ...editForm, listing_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
                  >
                    <option value="">Select...</option>
                    {listingTypeOptions.map((t) => (
                      <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Year Built</label>
                  <input
                    type="number"
                    value={editForm.year_built}
                    onChange={(e) => setEditForm({ ...editForm, year_built: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Lot Size (sqft)</label>
                  <input
                    type="number"
                    value={editForm.lot_size}
                    onChange={(e) => setEditForm({ ...editForm, lot_size: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 resize-none"
                />
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
                disabled={!editForm.address || updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                <Save size={14} />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-2" style={{ color: "#1E3A5F" }}>Delete Property</h3>
            <p className="text-sm text-gray-500 mb-5">
              Are you sure? Linked deals will keep their data but lose the property link.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50"
              >
                <Trash2 size={14} />
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard/properties")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Properties
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>
              {property.address}
            </h1>
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
            >
              {property.status[0].toUpperCase() + property.status.slice(1).replace("_", " ")}
            </span>
          </div>
          {locationParts && (
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <MapPin size={14} />
              {locationParts}
            </p>
          )}
          {property.price != null && (
            <p className="text-xl font-bold mt-2" style={{ color: "#0EA5E9" }}>
              {formatPrice(property.price)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openEditModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Edit2 size={14} />
            Edit
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="pb-3 text-sm font-semibold transition-colors relative"
            style={{
              color: activeTab === tab ? "#0EA5E9" : "#9CA3AF",
              borderBottom: activeTab === tab ? "2px solid #0EA5E9" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "Overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Location Card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={16} style={{ color: "#0EA5E9" }} />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase">Address</p>
                <p className="text-sm font-semibold text-gray-800">{property.address}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase">City</p>
                  <p className="text-sm font-semibold text-gray-800">{property.city || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">State</p>
                  <p className="text-sm font-semibold text-gray-800">{property.state || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">ZIP</p>
                  <p className="text-sm font-semibold text-gray-800">{property.zip || "\u2014"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Home size={16} style={{ color: "#0EA5E9" }} />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Property Details</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 uppercase flex items-center gap-1">
                  <DollarSign size={12} /> Price
                </p>
                <p className="text-sm font-semibold text-gray-800">{formatPrice(property.price)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase flex items-center gap-1">
                  <BedDouble size={12} /> Bedrooms
                </p>
                <p className="text-sm font-semibold text-gray-800">{property.bedrooms ?? "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase flex items-center gap-1">
                  <Bath size={12} /> Bathrooms
                </p>
                <p className="text-sm font-semibold text-gray-800">{property.bathrooms ?? "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase flex items-center gap-1">
                  <Ruler size={12} /> Sqft
                </p>
                <p className="text-sm font-semibold text-gray-800">{formatNumber(property.sqft)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase flex items-center gap-1">
                  <Calendar size={12} /> Year Built
                </p>
                <p className="text-sm font-semibold text-gray-800">{property.year_built ?? "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase flex items-center gap-1">
                  <Ruler size={12} /> Lot Size
                </p>
                <p className="text-sm font-semibold text-gray-800">
                  {property.lot_size != null ? `${formatNumber(property.lot_size)} sqft` : "\u2014"}
                </p>
              </div>
            </div>
          </div>

          {/* Listing Info Card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Tag size={16} style={{ color: "#0EA5E9" }} />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Listing Info</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 uppercase">Status</p>
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5"
                  style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                >
                  {property.status[0].toUpperCase() + property.status.slice(1).replace("_", " ")}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Listing Type</p>
                <p className="text-sm font-semibold text-gray-800">
                  {property.listing_type ? property.listing_type[0].toUpperCase() + property.listing_type.slice(1) : "\u2014"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">MLS ID</p>
                <p className="text-sm font-semibold text-gray-800">{property.mls_id || "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Property Type</p>
                <p className="text-sm font-semibold text-gray-800">{formatPropertyType(property.property_type)}</p>
              </div>
            </div>
          </div>

          {/* Description Card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={16} style={{ color: "#0EA5E9" }} />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</h3>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {property.description || "No description provided."}
            </p>
          </div>
        </div>
      )}

      {activeTab === "Deals" && (
        <div>
          {propertyDeals.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <Building size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No deals linked to this property.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Deal</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Contact</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Stage</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {propertyDeals.map((deal) => {
                    const stageColor = stageColors[deal.stage_name] ?? "#6B7280";
                    return (
                      <tr
                        key={deal.id}
                        className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                        onClick={() => router.push("/dashboard/pipeline")}
                      >
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-gray-800">{deal.title}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm text-gray-600">{deal.contact_name}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: stageColor + "18",
                              color: stageColor,
                            }}
                          >
                            {deal.stage_name}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <p className="text-sm font-semibold text-gray-800">
                            {deal.value != null ? formatPrice(deal.value) : "\u2014"}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "Matching Buyers" && (
        <div>
          {matches.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <Users size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No matching buyers found.</p>
              <p className="text-xs text-gray-400 mt-1">Buyers need buyer profiles to match.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.contact_id}
                  onClick={() => router.push(`/dashboard/contacts/${match.contact_id}`)}
                  className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-800">
                            {match.first_name} {match.last_name}
                          </p>
                          {match.pre_approved && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "#DCFCE7", color: "#16A34A" }}>
                              <CheckCircle2 size={10} />
                              Pre-Approved
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          {(match.email || match.phone) && (
                            <p className="text-xs text-gray-500">
                              {match.email || match.phone}
                            </p>
                          )}
                          {(match.budget_min != null || match.budget_max != null) && (
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <DollarSign size={10} />
                              {match.budget_min != null ? formatPrice(match.budget_min) : "Any"} - {match.budget_max != null ? formatPrice(match.budget_max) : "Any"}
                            </p>
                          )}
                          {match.timeline && (
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock size={10} />
                              {match.timeline}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            size={14}
                            fill={n <= match.score ? "#F59E0B" : "none"}
                            stroke={n <= match.score ? "#F59E0B" : "#D1D5DB"}
                          />
                        ))}
                      </div>
                      <ExternalLink size={14} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
