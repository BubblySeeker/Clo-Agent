"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listProperties, createProperty } from "@/lib/api/properties";
import {
  Search,
  Plus,
  Building,
  MapPin,
  X,
  ChevronDown,
  SlidersHorizontal,
  Tag,
} from "lucide-react";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "#DCFCE7", text: "#16A34A" },
  pending: { bg: "#FEF3C7", text: "#D97706" },
  sold: { bg: "#EDE9FE", text: "#7C3AED" },
  off_market: { bg: "#F1F5F9", text: "#64748B" },
};

const PROPERTY_TYPES = ["single_family", "condo", "townhouse", "multi_family", "land"];
const LISTING_TYPES = ["listing", "showing"];
const STATUSES = ["active", "pending", "sold", "off_market"];

function formatPropertyType(t: string | null) {
  if (!t) return "\u2014";
  return t
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function formatStatus(s: string) {
  return s
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default function PropertiesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("");
  const [listingTypeFilter, setListingTypeFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(searchParams.get("action") === "new");
  const filterRef = useRef<HTMLDivElement>(null);

  // Form fields
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newBedrooms, setNewBedrooms] = useState("");
  const [newBathrooms, setNewBathrooms] = useState("");
  const [newSqft, setNewSqft] = useState("");
  const [newPropertyType, setNewPropertyType] = useState("");
  const [newStatus, setNewStatus] = useState("active");
  const [newListingType, setNewListingType] = useState("");
  const [newMlsId, setNewMlsId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newYearBuilt, setNewYearBuilt] = useState("");
  const [newLotSize, setNewLotSize] = useState("");

  // Pending filter state (applied on click)
  const [pendingStatus, setPendingStatus] = useState("");
  const [pendingPropertyType, setPendingPropertyType] = useState("");
  const [pendingListingType, setPendingListingType] = useState("");

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
        setPendingStatus(statusFilter);
        setPendingPropertyType(propertyTypeFilter);
        setPendingListingType(listingTypeFilter);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [statusFilter, propertyTypeFilter, listingTypeFilter]);

  const activeCount =
    (statusFilter ? 1 : 0) +
    (propertyTypeFilter ? 1 : 0) +
    (listingTypeFilter ? 1 : 0);

  const { data, isLoading } = useQuery({
    queryKey: [
      "properties",
      {
        search,
        status: statusFilter,
        property_type: propertyTypeFilter,
        listing_type: listingTypeFilter,
        page,
      },
    ],
    queryFn: async () => {
      const token = await getToken();
      return listProperties(token!, {
        search: search || undefined,
        status: statusFilter || undefined,
        property_type: propertyTypeFilter || undefined,
        listing_type: listingTypeFilter || undefined,
        page,
        limit: 25,
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createProperty(token!, {
        address: newAddress,
        city: newCity || undefined,
        state: newState || undefined,
        zip: newZip || undefined,
        price: newPrice ? Number(newPrice) : undefined,
        bedrooms: newBedrooms ? Number(newBedrooms) : undefined,
        bathrooms: newBathrooms ? Number(newBathrooms) : undefined,
        sqft: newSqft ? Number(newSqft) : undefined,
        property_type: newPropertyType || undefined,
        status: newStatus || undefined,
        listing_type: newListingType || undefined,
        mls_id: newMlsId || undefined,
        description: newDescription || undefined,
        year_built: newYearBuilt ? Number(newYearBuilt) : undefined,
        lot_size: newLotSize ? Number(newLotSize) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setShowAdd(false);
      setNewAddress("");
      setNewCity("");
      setNewState("");
      setNewZip("");
      setNewPrice("");
      setNewBedrooms("");
      setNewBathrooms("");
      setNewSqft("");
      setNewPropertyType("");
      setNewStatus("active");
      setNewListingType("");
      setNewMlsId("");
      setNewDescription("");
      setNewYearBuilt("");
      setNewLotSize("");
    },
  });

  const properties = data?.properties ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  function applyFilters() {
    setStatusFilter(pendingStatus);
    setPropertyTypeFilter(pendingPropertyType);
    setListingTypeFilter(pendingListingType);
    setPage(1);
    setFilterOpen(false);
  }

  function clearFilters() {
    setStatusFilter("");
    setPropertyTypeFilter("");
    setListingTypeFilter("");
    setPendingStatus("");
    setPendingPropertyType("");
    setPendingListingType("");
    setPage(1);
    setFilterOpen(false);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>
            Properties
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total properties</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          <Plus size={16} /> Add Property
        </button>
      </div>

      {/* Add Property Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>
                  Add New Property
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Fill in the details for a new listing
                </p>
              </div>
              <button
                onClick={() => setShowAdd(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
              {/* Address */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Address <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <MapPin
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    placeholder="Street address"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* City / State / Zip */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Location
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    placeholder="City"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                  <input
                    placeholder="State"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                  <input
                    placeholder="Zip"
                    value={newZip}
                    onChange={(e) => setNewZip(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Price / Beds / Baths / SqFt */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Details
                </label>
                <div className="grid grid-cols-4 gap-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      placeholder="Price"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                    />
                  </div>
                  <input
                    type="number"
                    placeholder="Beds"
                    value={newBedrooms}
                    onChange={(e) => setNewBedrooms(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                  <input
                    type="number"
                    placeholder="Baths"
                    value={newBathrooms}
                    onChange={(e) => setNewBathrooms(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                  <input
                    type="number"
                    placeholder="SqFt"
                    value={newSqft}
                    onChange={(e) => setNewSqft(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Property Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Property Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() =>
                        setNewPropertyType(newPropertyType === t ? "" : t)
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        newPropertyType === t
                          ? "bg-[#0EA5E9] text-white border-[#0EA5E9]"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {formatPropertyType(t)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Listing Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Listing Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {LISTING_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() =>
                        setNewListingType(newListingType === t ? "" : t)
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        newListingType === t
                          ? "bg-[#0EA5E9] text-white border-[#0EA5E9]"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setNewStatus(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        newStatus === s
                          ? "bg-[#1E3A5F] text-white border-[#1E3A5F]"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {formatStatus(s)}
                    </button>
                  ))}
                </div>
              </div>

              {/* MLS ID */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  MLS ID
                </label>
                <div className="relative">
                  <Tag
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    placeholder="MLS number"
                    value={newMlsId}
                    onChange={(e) => setNewMlsId(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Year Built / Lot Size */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Additional Details
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    placeholder="Year built"
                    value={newYearBuilt}
                    onChange={(e) => setNewYearBuilt(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                  <input
                    type="number"
                    placeholder="Lot size (sqft)"
                    value={newLotSize}
                    onChange={(e) => setNewLotSize(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Description
                </label>
                <textarea
                  placeholder="Property description..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!newAddress || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                {createMutation.isPending ? "Creating..." : "Add Property"}
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
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search by address, city, or MLS..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
            />
          </div>

          {/* Active filter chips */}
          {statusFilter && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              {formatStatus(statusFilter)}
              <button
                onClick={() => {
                  setStatusFilter("");
                  setPendingStatus("");
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
          {propertyTypeFilter && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
              {formatPropertyType(propertyTypeFilter)}
              <button
                onClick={() => {
                  setPropertyTypeFilter("");
                  setPendingPropertyType("");
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}
          {listingTypeFilter && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-100">
              {listingTypeFilter[0].toUpperCase() + listingTypeFilter.slice(1)}
              <button
                onClick={() => {
                  setListingTypeFilter("");
                  setPendingListingType("");
                }}
              >
                <X size={10} />
              </button>
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* Filter button */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => {
                  setPendingStatus(statusFilter);
                  setPendingPropertyType(propertyTypeFilter);
                  setPendingListingType(listingTypeFilter);
                  setFilterOpen((o) => !o);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                  filterOpen || activeCount > 0
                    ? "border-[#0EA5E9] text-[#0EA5E9] bg-blue-50"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                }`}
              >
                <SlidersHorizontal size={15} />
                Filters
                {activeCount > 0 && (
                  <span
                    className="w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                    style={{ backgroundColor: "#0EA5E9" }}
                  >
                    {activeCount}
                  </span>
                )}
                <ChevronDown
                  size={13}
                  className={`transition-transform ${filterOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Filter panel */}
              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                  <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>
                      Filters
                    </span>
                    {activeCount > 0 && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-red-500 hover:text-red-600 font-medium"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="p-4 flex flex-col gap-5">
                    {/* Status */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Status
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUSES.map((s) => {
                          const on = pendingStatus === s;
                          return (
                            <button
                              key={s}
                              onClick={() =>
                                setPendingStatus(on ? "" : s)
                              }
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                                on
                                  ? "bg-[#1E3A5F] text-white border-[#1E3A5F]"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                              }`}
                            >
                              {formatStatus(s)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Property Type */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Property Type
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {PROPERTY_TYPES.map((t) => {
                          const on = pendingPropertyType === t;
                          return (
                            <button
                              key={t}
                              onClick={() =>
                                setPendingPropertyType(on ? "" : t)
                              }
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                                on
                                  ? "bg-[#1E3A5F] text-white border-[#1E3A5F]"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                              }`}
                            >
                              {formatPropertyType(t)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Listing Type */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Listing Type
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {LISTING_TYPES.map((t) => {
                          const on = pendingListingType === t;
                          return (
                            <button
                              key={t}
                              onClick={() =>
                                setPendingListingType(on ? "" : t)
                              }
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                                on
                                  ? "bg-[#1E3A5F] text-white border-[#1E3A5F]"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                              }`}
                            >
                              {t[0].toUpperCase() + t.slice(1)}
                            </button>
                          );
                        })}
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
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="animate-pulse space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-50 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  Address
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  City/State
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  Price
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  Beds/Baths
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  SqFt
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  Type
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">
                  Listed
                </th>
              </tr>
            </thead>
            <tbody>
              {properties.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-12 text-gray-400 text-sm"
                  >
                    {activeCount > 0 || search
                      ? "No properties match these filters."
                      : "No properties yet \u2014 add your first listing!"}
                  </td>
                </tr>
              ) : (
                properties.map((p, i) => {
                  const colors = STATUS_COLORS[p.status] ?? {
                    bg: "#F1F5F9",
                    text: "#64748B",
                  };
                  return (
                    <tr
                      key={p.id}
                      onClick={() =>
                        router.push(`/dashboard/properties/${p.id}`)
                      }
                      className={`border-b border-gray-50 cursor-pointer hover:bg-blue-50/40 transition-colors ${
                        i % 2 !== 0 ? "bg-gray-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <Building size={14} className="text-[#0EA5E9]" />
                          </div>
                          <span className="text-sm font-semibold text-gray-800">
                            {p.address}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {p.city && p.state
                          ? `${p.city}, ${p.state}`
                          : p.city ?? p.state ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                        {p.price != null
                          ? `$${p.price.toLocaleString()}`
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {p.bedrooms != null || p.bathrooms != null
                          ? `${p.bedrooms ?? "\u2014"} bd / ${p.bathrooms ?? "\u2014"} ba`
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {p.sqft != null
                          ? p.sqft.toLocaleString()
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: colors.bg,
                            color: colors.text,
                          }}
                        >
                          {formatStatus(p.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatPropertyType(p.property_type)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              Showing {properties.length} of {total} properties
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
      )}
    </div>
  );
}
