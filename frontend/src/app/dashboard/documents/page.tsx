"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  File,
  ImageIcon,
  Trash2,
  Download,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Search,
  User,
  Building,
  Plus,
} from "lucide-react";
import Link from "next/link";
import {
  listDocuments,
  uploadDocumentWithProgress,
  deleteDocument,
  getDocumentDownloadUrl,
  listFolders,
  createFolder,
  getDocumentCounts,
  extractPropertyFromDocument,
  updateDocument,
  type Document as DocType,
  type DocumentsResponse,
  type DocumentFolder,
  type DocumentCounts,
  type ExtractedProperty,
} from "@/lib/api/documents";
import { listContacts, type Contact } from "@/lib/api/contacts";
import { listProperties, createProperty, type Property, type CreatePropertyBody } from "@/lib/api/properties";

/* ---- Helpers ---- */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getFileIcon(fileType: string) {
  const ft = fileType.toLowerCase().replace(".", "");
  if (["pdf", "docx", "doc", "txt", "rtf", "md"].includes(ft)) return FileText;
  if (["csv", "xlsx", "xls"].includes(ft)) return FileSpreadsheet;
  if (["png", "jpg", "jpeg", "webp"].includes(ft)) return ImageIcon;
  return File;
}

function getFileIconColor(fileType: string): { bg: string; color: string } {
  const ft = fileType.toLowerCase().replace(".", "");
  if (ft === "pdf") return { bg: "#FEE2E2", color: "#EF4444" };
  if (["docx", "doc"].includes(ft)) return { bg: "#DBEAFE", color: "#3B82F6" };
  if (["csv", "xlsx", "xls"].includes(ft)) return { bg: "#DCFCE7", color: "#22C55E" };
  if (["png", "jpg", "jpeg", "webp"].includes(ft)) return { bg: "#FEF3C7", color: "#D97706" };
  return { bg: "#F3F4F6", color: "#6B7280" };
}

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.csv,.txt,.xlsx,.xls,.rtf,.md,.png,.jpg,.jpeg,.webp";
const ACCEPTED_SET = new Set(["pdf", "docx", "doc", "csv", "txt", "xlsx", "xls", "rtf", "md", "png", "jpg", "jpeg", "webp"]);
const MAX_SIZE = 100 * 1024 * 1024;

/* ---- Status Badge ---- */

function StatusBadge({ doc }: { doc: DocType }) {
  if (doc.status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600">
        <Loader2 size={12} className="animate-spin" />
        Processing
      </span>
    );
  }
  if (doc.status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600">
        <CheckCircle2 size={12} />
        Ready
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600"
      title={doc.error_message ?? "Processing failed"}
    >
      <AlertCircle size={12} />
      Failed
    </span>
  );
}

/* ---- Upload Modal (Two-Level Selection) ---- */

type CategoryType = "general" | "contact" | "property" | string;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface UploadResult {
  docId: string;
  isNewProperty: boolean;
}

function UploadModal({
  onClose,
  onUpload,
  isUploading,
  uploadProgress,
  contacts,
  properties,
  folders,
  onCreateFolder,
  isCreatingFolder,
}: {
  onClose: () => void;
  onUpload: (file: File, opts: { contactId?: string; propertyId?: string; folderId?: string; isNewProperty?: boolean }) => void;
  isUploading: boolean;
  uploadProgress: number | null;
  contacts: Contact[];
  properties: Property[];
  folders: DocumentFolder[];
  onCreateFolder: (name: string) => void;
  isCreatingFolder: boolean;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryType>("general");
  const [subSelection, setSubSelection] = useState("");
  const [isNewProperty, setIsNewProperty] = useState(false);
  const [subSearch, setSubSearch] = useState("");
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setShowCategoryMenu(false);
      if (subRef.current && !subRef.current.contains(e.target as Node)) setShowSubMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const validateAndSet = useCallback((file: File) => {
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_SET.has(ext)) { setError(`Unsupported file type: .${ext}`); return; }
    if (file.size > MAX_SIZE) { setError("File exceeds 100MB limit"); return; }
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
  }, [validateAndSet]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  }, [validateAndSet]);

  // Category label
  const getCategoryLabel = () => {
    if (category === "general") return "General";
    if (category === "contact") return "Contact";
    if (category === "property") return "Property";
    const folder = folders.find((f) => f.id === category);
    return folder?.name ?? "Select category";
  };

  // Sub label
  const getSubLabel = () => {
    if (isNewProperty) return "New Property";
    if (!subSelection) return "Select...";
    if (category === "contact") {
      const c = contacts.find((ct) => ct.id === subSelection);
      return c ? `${c.first_name} ${c.last_name}` : subSelection;
    }
    if (category === "property") {
      const p = properties.find((pr) => pr.id === subSelection);
      return p?.address ?? subSelection;
    }
    return subSelection;
  };

  const needsSub = category === "contact" || category === "property";

  // Filter items for sub dropdown
  const filteredSubItems = (() => {
    const q = subSearch.toLowerCase();
    if (category === "contact") {
      return contacts.filter(
        (c) =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q))
      );
    }
    if (category === "property") {
      return properties.filter(
        (p) => p.address.toLowerCase().includes(q) || (p.city?.toLowerCase().includes(q))
      );
    }
    return [];
  })();

  const handleUpload = () => {
    if (!selectedFile) return;
    const opts: { contactId?: string; propertyId?: string; folderId?: string; isNewProperty?: boolean } = {};

    if (category === "contact" && subSelection) {
      opts.contactId = subSelection;
    } else if (category === "property") {
      if (isNewProperty) {
        opts.isNewProperty = true;
      } else if (subSelection) {
        opts.propertyId = subSelection;
      }
    } else if (category !== "general" && category !== "contact" && category !== "property") {
      opts.folderId = category;
    }

    onUpload(selectedFile, opts);
  };

  const canUpload = selectedFile && !isUploading && (
    !needsSub || subSelection || isNewProperty
  );

  const FileIcon = selectedFile ? getFileIcon(selectedFile.name.split(".").pop() ?? "") : File;
  const iconColors = selectedFile
    ? getFileIconColor(selectedFile.name.split(".").pop() ?? "")
    : { bg: "#F3F4F6", color: "#6B7280" };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    onCreateFolder(name);
    setNewFolderName("");
    setShowCreateFolder(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold" style={{ color: "#1E3A5F" }}>Upload Document</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone */}
          {!selectedFile && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                isDragging ? "border-[#0EA5E9] bg-[#0EA5E9]/5" : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={32} className={`mx-auto mb-3 ${isDragging ? "text-[#0EA5E9]" : "text-gray-300"}`} />
              <p className="text-sm font-medium text-gray-600">Drop files here</p>
              <p className="text-xs text-gray-400 mt-1">or</p>
              <button
                type="button"
                className="mt-2 px-4 py-1.5 rounded-lg text-sm font-medium text-[#0EA5E9] bg-[#0EA5E9]/10 hover:bg-[#0EA5E9]/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Browse files
              </button>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} onChange={handleFileChange} className="hidden" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Selected file preview */}
          {selectedFile && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: iconColors.bg }}>
                <FileIcon size={18} style={{ color: iconColors.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
              </div>
              <button onClick={() => setSelectedFile(null)} className="p-1 rounded hover:bg-gray-200 transition-colors">
                <X size={14} className="text-gray-400" />
              </button>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} onChange={handleFileChange} className="hidden" />
            </div>
          )}

          {/* Category picker (Level 1) */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Save to
            </label>
            <div className="relative" ref={catRef}>
              <button
                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                className="w-full flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 transition-colors"
              >
                {category === "contact" && <User size={14} className="text-[#0EA5E9] shrink-0" />}
                {category === "property" && <Building size={14} className="text-purple-500 shrink-0" />}
                {category === "general" && <FolderOpen size={14} className="text-gray-400 shrink-0" />}
                {category !== "general" && category !== "contact" && category !== "property" && <FolderOpen size={14} className="text-amber-500 shrink-0" />}
                <span className="flex-1 text-left truncate">{getCategoryLabel()}</span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${showCategoryMenu ? "rotate-180" : ""}`} />
              </button>

              {showCategoryMenu && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
                  <div className="max-h-[280px] overflow-y-auto py-1">
                    {/* General */}
                    <button
                      onClick={() => { setCategory("general"); setSubSelection(""); setIsNewProperty(false); setShowCategoryMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${category === "general" ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"}`}
                    >
                      <FolderOpen size={14} className="text-gray-400" /> General
                    </button>

                    {/* Contact */}
                    <button
                      onClick={() => { setCategory("contact"); setSubSelection(""); setIsNewProperty(false); setShowCategoryMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${category === "contact" ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"}`}
                    >
                      <User size={14} className="text-[#0EA5E9]" /> Contact
                    </button>

                    {/* Property */}
                    <button
                      onClick={() => { setCategory("property"); setSubSelection(""); setIsNewProperty(false); setShowCategoryMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${category === "property" ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"}`}
                    >
                      <Building size={14} className="text-purple-500" /> Property
                    </button>

                    {/* Custom folders */}
                    {folders.length > 0 && <div className="border-t border-gray-100 my-1" />}
                    {folders.filter((f) => !f.contact_id).map((f) => (
                      <button
                        key={f.id}
                        onClick={() => { setCategory(f.id); setSubSelection(""); setIsNewProperty(false); setShowCategoryMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${category === f.id ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"}`}
                      >
                        <FolderOpen size={14} className="text-amber-500" /> {f.name}
                      </button>
                    ))}

                    {/* Create folder */}
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      {showCreateFolder ? (
                        <div className="flex items-center gap-1.5 px-2 py-1.5">
                          <input
                            autoFocus
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCreateFolder();
                              if (e.key === "Escape") { setShowCreateFolder(false); setNewFolderName(""); }
                            }}
                            placeholder="Folder name..."
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-gray-50 text-sm outline-none focus:bg-gray-100"
                          />
                          <button
                            onClick={handleCreateFolder}
                            disabled={!newFolderName.trim() || isCreatingFolder}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 disabled:opacity-50"
                          >
                            {isCreatingFolder ? <Loader2 size={12} className="animate-spin" /> : "Create"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowCreateFolder(true)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                        >
                          <FolderPlus size={14} className="text-gray-400" /> Create new folder
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sub-selection (Level 2) */}
          {needsSub && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                {category === "contact" ? "Select Contact" : "Select Property"}
              </label>
              <div className="relative" ref={subRef}>
                <button
                  onClick={() => setShowSubMenu(!showSubMenu)}
                  className="w-full flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 transition-colors"
                >
                  <span className="flex-1 text-left truncate">{getSubLabel()}</span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${showSubMenu ? "rotate-180" : ""}`} />
                </button>

                {showSubMenu && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
                    {/* Search */}
                    <div className="p-2 border-b border-gray-100">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          autoFocus
                          type="text"
                          value={subSearch}
                          onChange={(e) => setSubSearch(e.target.value)}
                          placeholder={category === "contact" ? "Search contacts..." : "Search properties..."}
                          className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-50 text-sm outline-none focus:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="max-h-[200px] overflow-y-auto py-1">
                      {/* New Property option */}
                      {category === "property" && (
                        <button
                          onClick={() => { setIsNewProperty(true); setSubSelection(""); setShowSubMenu(false); setSubSearch(""); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${isNewProperty ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"}`}
                        >
                          <Plus size={14} className="text-green-500" />
                          <span className="font-medium">New Property</span>
                          <span className="text-xs text-gray-400 ml-auto">auto-extract</span>
                        </button>
                      )}

                      {category === "property" && <div className="border-t border-gray-100 my-1" />}

                      {/* Items */}
                      {category === "contact" && (filteredSubItems as Contact[]).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { setSubSelection(c.id); setIsNewProperty(false); setShowSubMenu(false); setSubSearch(""); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${subSelection === c.id ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"}`}
                        >
                          <User size={13} className="text-gray-400 shrink-0" />
                          <span className="truncate">{c.first_name} {c.last_name}</span>
                          {c.email && <span className="text-xs text-gray-400 ml-auto truncate max-w-[120px]">{c.email}</span>}
                        </button>
                      ))}

                      {category === "property" && (filteredSubItems as Property[]).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setSubSelection(p.id); setIsNewProperty(false); setShowSubMenu(false); setSubSearch(""); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${subSelection === p.id ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"}`}
                        >
                          <Building size={13} className="text-gray-400 shrink-0" />
                          <span className="truncate">{p.address}</span>
                          {p.city && <span className="text-xs text-gray-400 ml-auto">{p.city}, {p.state}</span>}
                        </button>
                      ))}

                      {filteredSubItems.length === 0 && !subSearch && category === "contact" && (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">No contacts yet</p>
                      )}
                      {filteredSubItems.length === 0 && !subSearch && category === "property" && (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">No properties yet</p>
                      )}
                      {filteredSubItems.length === 0 && subSearch && (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">No results</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upload button */}
          <div className="space-y-2">
            <button
              onClick={handleUpload}
              disabled={!canUpload}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#0EA5E9" }}
            >
              {isUploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Uploading{uploadProgress !== null ? ` ${uploadProgress}%` : "..."}
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Upload
                </>
              )}
            </button>
            {isUploading && uploadProgress !== null && (
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%`, backgroundColor: "#0EA5E9" }} />
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">
            Supported: PDF, DOCX, DOC, CSV, TXT, XLSX, XLS, RTF, MD, PNG, JPG, WEBP. Max 100MB.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---- Property From Document Modal ---- */

function PropertyFromDocModal({
  extracted,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  extracted: ExtractedProperty;
  onSubmit: (body: CreatePropertyBody) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    address: extracted.address ?? "",
    city: extracted.city ?? "",
    state: extracted.state ?? "",
    zip: extracted.zip ?? "",
    price: extracted.price?.toString() ?? "",
    bedrooms: extracted.bedrooms?.toString() ?? "",
    bathrooms: extracted.bathrooms?.toString() ?? "",
    sqft: extracted.sqft?.toString() ?? "",
    property_type: extracted.property_type ?? "",
    listing_type: extracted.listing_type ?? "",
    mls_id: extracted.mls_id ?? "",
    description: extracted.description ?? "",
    year_built: extracted.year_built?.toString() ?? "",
    lot_size: extracted.lot_size ?? "",
  });

  const handleSubmit = () => {
    const body: CreatePropertyBody = {
      address: form.address,
      city: form.city || undefined,
      state: form.state || undefined,
      zip: form.zip || undefined,
      price: form.price ? parseFloat(form.price) : undefined,
      bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : undefined,
      sqft: form.sqft ? parseInt(form.sqft) : undefined,
      property_type: form.property_type || undefined,
      listing_type: form.listing_type || undefined,
      mls_id: form.mls_id || undefined,
      description: form.description || undefined,
      year_built: form.year_built ? parseInt(form.year_built) : undefined,
      lot_size: form.lot_size ? parseFloat(form.lot_size) : undefined,
    };
    onSubmit(body);
  };

  const field = (label: string, key: keyof typeof form, type = "text", half = false) => (
    <div className={half ? "flex-1 min-w-0" : ""}>
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0EA5E9]"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h3 className="text-base font-bold" style={{ color: "#1E3A5F" }}>Create Property from Document</h3>
            <p className="text-xs text-gray-500 mt-0.5">Review the extracted info and hit create</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {field("Address", "address")}
          <div className="flex gap-3">
            {field("City", "city", "text", true)}
            {field("State", "state", "text", true)}
            {field("Zip", "zip", "text", true)}
          </div>
          <div className="flex gap-3">
            {field("Price", "price", "number", true)}
            {field("MLS ID", "mls_id", "text", true)}
          </div>
          <div className="flex gap-3">
            {field("Bedrooms", "bedrooms", "number", true)}
            {field("Bathrooms", "bathrooms", "number", true)}
            {field("Sqft", "sqft", "number", true)}
          </div>
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Property Type</label>
              <select
                value={form.property_type}
                onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-white"
              >
                <option value="">Select...</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="land">Land</option>
                <option value="multi_family">Multi-Family</option>
                <option value="condo">Condo</option>
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Listing Type</label>
              <select
                value={form.listing_type}
                onChange={(e) => setForm((f) => ({ ...f, listing_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-white"
              >
                <option value="">Select...</option>
                <option value="sale">For Sale</option>
                <option value="lease">For Lease</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            {field("Year Built", "year_built", "number", true)}
            {field("Lot Size", "lot_size", "text", true)}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] resize-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.address || isSubmitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            {isSubmitting ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : "Create Property"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Delete Confirmation ---- */

function DeleteDialog({ filename, onConfirm, onCancel, isDeleting }: {
  filename: string; onConfirm: () => void; onCancel: () => void; isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "#1E3A5F" }}>Delete Document</h3>
            <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Are you sure you want to delete <span className="font-medium">{filename}</span>?
        </p>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? <><Loader2 size={14} className="animate-spin" /> Deleting...</> : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Sidebar ---- */

type FilterState = { type: "all" | "general" | "contact" | "property" | "folder"; id?: string; name?: string };

function Sidebar({
  counts,
  folders,
  activeFilter,
  onFilter,
  onCreateFolder,
  isCreatingFolder,
}: {
  counts: DocumentCounts | undefined;
  folders: DocumentFolder[];
  activeFilter: FilterState;
  onFilter: (f: FilterState) => void;
  onCreateFolder: (name: string) => void;
  isCreatingFolder: boolean;
}) {
  const [contactsOpen, setContactsOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const totalDocs = (counts?.general ?? 0) +
    (counts?.by_contact?.reduce((s, c) => s + c.count, 0) ?? 0) +
    (counts?.by_property?.reduce((s, p) => s + p.count, 0) ?? 0) +
    folders.reduce((s, f) => s + f.document_count, 0);

  const isActive = (f: FilterState) =>
    f.type === activeFilter.type && f.id === activeFilter.id;

  const itemClass = (f: FilterState) =>
    `w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
      isActive(f) ? "bg-[#0EA5E9]/10 text-[#0EA5E9] font-medium" : "text-gray-600 hover:bg-gray-50"
    }`;

  const handleCreate = () => {
    const name = newFolderName.trim();
    if (!name) return;
    onCreateFolder(name);
    setNewFolderName("");
    setShowNewFolder(false);
  };

  return (
    <div className="w-[240px] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col gap-0.5 self-start sticky top-6">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-1">Folders</p>

      {/* All Documents */}
      <button onClick={() => onFilter({ type: "all" })} className={itemClass({ type: "all" })}>
        <span className="flex items-center gap-2"><FolderOpen size={14} /> All Documents</span>
        <span className="text-xs opacity-60">{totalDocs}</span>
      </button>

      {/* General */}
      <button onClick={() => onFilter({ type: "general" })} className={itemClass({ type: "general" })}>
        <span className="flex items-center gap-2"><File size={14} /> General</span>
        <span className="text-xs opacity-60">{counts?.general ?? 0}</span>
      </button>

      {/* Contacts section */}
      <div className="mt-2">
        <button
          onClick={() => setContactsOpen(!contactsOpen)}
          className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600"
        >
          {contactsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Contacts
          <span className="ml-auto text-[10px]">{counts?.by_contact?.length ?? 0}</span>
        </button>
        {contactsOpen && counts?.by_contact?.map((c) => (
          <button
            key={c.id}
            onClick={() => onFilter({ type: "contact", id: c.id, name: c.name })}
            className={itemClass({ type: "contact", id: c.id })}
          >
            <span className="flex items-center gap-2 truncate"><User size={13} className="shrink-0" /> <span className="truncate">{c.name}</span></span>
            <span className="text-xs opacity-60 shrink-0">{c.count}</span>
          </button>
        ))}
        {contactsOpen && (!counts?.by_contact || counts.by_contact.length === 0) && (
          <p className="px-3 py-1.5 text-xs text-gray-300">No contact docs</p>
        )}
      </div>

      {/* Properties section */}
      <div className="mt-2">
        <button
          onClick={() => setPropertiesOpen(!propertiesOpen)}
          className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600"
        >
          {propertiesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Properties
          <span className="ml-auto text-[10px]">{counts?.by_property?.length ?? 0}</span>
        </button>
        {propertiesOpen && counts?.by_property?.map((p) => (
          <button
            key={p.id}
            onClick={() => onFilter({ type: "property", id: p.id, name: p.name })}
            className={itemClass({ type: "property", id: p.id })}
          >
            <span className="flex items-center gap-2 truncate"><Building size={13} className="shrink-0" /> <span className="truncate">{p.name}</span></span>
            <span className="text-xs opacity-60 shrink-0">{p.count}</span>
          </button>
        ))}
        {propertiesOpen && (!counts?.by_property || counts.by_property.length === 0) && (
          <p className="px-3 py-1.5 text-xs text-gray-300">No property docs</p>
        )}
      </div>

      {/* Custom Folders */}
      {folders.filter((f) => !f.contact_id).length > 0 && (
        <div className="mt-2">
          <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Custom Folders</p>
          {folders.filter((f) => !f.contact_id).map((f) => (
            <button
              key={f.id}
              onClick={() => onFilter({ type: "folder", id: f.id, name: f.name })}
              className={itemClass({ type: "folder", id: f.id })}
            >
              <span className="flex items-center gap-2 truncate"><FolderOpen size={13} className="text-amber-500 shrink-0" /> <span className="truncate">{f.name}</span></span>
              <span className="text-xs opacity-60 shrink-0">{f.document_count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Create folder */}
      <div className="mt-2 pt-2 border-t border-gray-100">
        {showNewFolder ? (
          <div className="flex items-center gap-1.5 px-1">
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
              }}
              placeholder="Folder name..."
              className="flex-1 px-2 py-1.5 rounded-lg bg-gray-50 text-xs outline-none focus:bg-gray-100"
            />
            <button
              onClick={handleCreate}
              disabled={!newFolderName.trim() || isCreatingFolder}
              className="px-2 py-1.5 rounded-lg text-xs font-medium text-white bg-[#0EA5E9] disabled:opacity-50"
            >
              {isCreatingFolder ? <Loader2 size={10} className="animate-spin" /> : "Add"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewFolder(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50"
          >
            <FolderPlus size={13} /> New Folder
          </button>
        )}
      </div>
    </div>
  );
}

/* ---- Main Page ---- */

export default function DocumentsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocType | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterState>({ type: "all" });
  const pollIntervalRef = useRef(2000);

  // New Property auto-fill state
  const [pendingNewPropertyDocId, setPendingNewPropertyDocId] = useState<string | null>(null);
  const [extractedProperty, setExtractedProperty] = useState<ExtractedProperty | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Load contacts
  const { data: contactsData } = useQuery({
    queryKey: ["contacts-list"],
    queryFn: async () => { const t = await getToken(); return listContacts(t!, { limit: 200 }); },
  });
  const contacts = contactsData?.contacts ?? [];

  // Load properties
  const { data: propertiesData } = useQuery({
    queryKey: ["properties-list"],
    queryFn: async () => { const t = await getToken(); return listProperties(t!, { limit: 200 }); },
  });
  const properties = propertiesData?.properties ?? [];

  // Load folders
  const { data: foldersData } = useQuery({
    queryKey: ["document-folders"],
    queryFn: async () => { const t = await getToken(); return listFolders(t!); },
  });
  const folders = foldersData?.folders ?? [];

  // Load document counts for sidebar
  const { data: counts } = useQuery({
    queryKey: ["document-counts"],
    queryFn: async () => { const t = await getToken(); return getDocumentCounts(t!); },
  });

  // Build list query params from filter
  const listParams = (() => {
    const p: { contactId?: string; folderId?: string; propertyId?: string } = {};
    if (activeFilter.type === "general") p.folderId = "unfiled";
    else if (activeFilter.type === "contact" && activeFilter.id) p.contactId = activeFilter.id;
    else if (activeFilter.type === "property" && activeFilter.id) p.propertyId = activeFilter.id;
    else if (activeFilter.type === "folder" && activeFilter.id) p.folderId = activeFilter.id;
    return p;
  })();

  // Load documents
  const { data, isLoading, error, refetch } = useQuery<DocumentsResponse>({
    queryKey: ["documents", page, activeFilter],
    queryFn: async () => {
      const t = await getToken();
      return listDocuments(t!, page, 25, undefined, listParams.contactId, listParams.folderId, listParams.propertyId);
    },
    refetchInterval: (query) => {
      const docs = query.state.data?.documents;
      const hasProcessing = docs?.some((d: DocType) => d.status === "processing");
      if (!hasProcessing) { pollIntervalRef.current = 2000; return false; }
      const interval = pollIntervalRef.current;
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, 30000);
      return interval;
    },
  });

  // Watch for pending new property doc to become ready
  useEffect(() => {
    if (!pendingNewPropertyDocId || isExtracting) return;
    const docs = data?.documents ?? [];
    const doc = docs.find((d) => d.id === pendingNewPropertyDocId);
    if (doc?.status === "ready") {
      // Extract property
      setIsExtracting(true);
      (async () => {
        try {
          const token = await getToken();
          const result = await extractPropertyFromDocument(token!, pendingNewPropertyDocId);
          setExtractedProperty(result);
        } catch (e) {
          console.error("Property extraction failed:", e);
          setExtractedProperty({
            address: "", city: null, state: null, zip: null, price: null,
            bedrooms: null, bathrooms: null, sqft: null, property_type: null,
            listing_type: null, mls_id: null, description: null, year_built: null, lot_size: null,
          });
        } finally {
          setIsExtracting(false);
        }
      })();
    } else if (doc?.status === "failed") {
      setPendingNewPropertyDocId(null);
    }
  }, [data, pendingNewPropertyDocId, isExtracting, getToken]);

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => { const t = await getToken(); return createFolder(t!, name); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
      queryClient.invalidateQueries({ queryKey: ["document-counts"] });
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, opts }: { file: File; opts: { contactId?: string; propertyId?: string; folderId?: string; isNewProperty?: boolean } }) => {
      const token = await getToken();
      setUploadProgress(0);
      const uploadOpts: { contactId?: string; folderId?: string; propertyId?: string } = {};
      if (opts.contactId) uploadOpts.contactId = opts.contactId;
      if (opts.propertyId) uploadOpts.propertyId = opts.propertyId;
      if (opts.folderId) uploadOpts.folderId = opts.folderId;
      const doc = await uploadDocumentWithProgress(token!, file, uploadOpts, (pct) => setUploadProgress(pct));
      return { doc, isNewProperty: opts.isNewProperty };
    },
    onSuccess: (result) => {
      setUploadProgress(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
      queryClient.invalidateQueries({ queryKey: ["document-counts"] });
      setShowUpload(false);
      if (result.isNewProperty) {
        setPendingNewPropertyDocId(result.doc.id);
      }
    },
    onError: () => { setUploadProgress(null); },
  });

  // Create property from document mutation
  const createPropertyMutation = useMutation({
    mutationFn: async (body: CreatePropertyBody) => {
      const token = await getToken();
      const prop = await createProperty(token!, body);
      // Link doc to new property
      if (pendingNewPropertyDocId) {
        await updateDocument(token!, pendingNewPropertyDocId, { property_id: prop.id });
      }
      return prop;
    },
    onSuccess: () => {
      setPendingNewPropertyDocId(null);
      setExtractedProperty(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-counts"] });
      queryClient.invalidateQueries({ queryKey: ["properties-list"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const t = await getToken(); return deleteDocument(t!, id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
      queryClient.invalidateQueries({ queryKey: ["document-counts"] });
      setDeleteTarget(null);
    },
  });

  const documents = data?.documents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6 text-center">
        <p className="text-gray-600 font-medium">Failed to load documents</p>
        <button onClick={() => refetch()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Documents</h1>
            <p className="text-sm text-gray-500 mt-0.5">Upload and manage your documents</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            <Upload size={16} /> Upload Document
          </button>
        </div>

        {/* Two-column layout: sidebar + content */}
        <div className="flex gap-5">
          {/* Sidebar */}
          <Sidebar
            counts={counts}
            folders={folders}
            activeFilter={activeFilter}
            onFilter={(f) => { setActiveFilter(f); setPage(1); }}
            onCreateFolder={(name) => createFolderMutation.mutate(name)}
            isCreatingFolder={createFolderMutation.isPending}
          />

          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col gap-5">
            {/* Active filter label */}
            {activeFilter.type !== "all" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Showing:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0EA5E9]/10 text-[#0EA5E9] text-sm font-medium">
                  {activeFilter.type === "general" && "General (unfiled)"}
                  {activeFilter.type === "contact" && <><User size={13} /> {activeFilter.name}</>}
                  {activeFilter.type === "property" && <><Building size={13} /> {activeFilter.name}</>}
                  {activeFilter.type === "folder" && <><FolderOpen size={13} /> {activeFilter.name}</>}
                </span>
                <button
                  onClick={() => { setActiveFilter({ type: "all" }); setPage(1); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Pending extraction banner */}
            {pendingNewPropertyDocId && !extractedProperty && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 text-amber-700 text-sm">
                <Loader2 size={16} className="animate-spin" />
                {isExtracting ? "Extracting property info from document..." : "Waiting for document processing to complete..."}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm">
                <AlertCircle size={16} /> Failed to load documents.
              </div>
            )}

            {/* Loading */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-[#0EA5E9]/30 border-t-[#0EA5E9] rounded-full animate-spin" />
              </div>
            ) : documents.length > 0 ? (
              <>
                {/* Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Name</th>
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">Category</th>
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">Type</th>
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">Size</th>
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">Status</th>
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">Pages</th>
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">Uploaded</th>
                          <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {documents.map((doc) => {
                          const Icon = getFileIcon(doc.file_type);
                          const ic = getFileIconColor(doc.file_type);
                          return (
                            <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: ic.bg }}>
                                    <Icon size={16} style={{ color: ic.color }} />
                                  </div>
                                  <span className="text-sm font-medium truncate max-w-[240px]" style={{ color: "#1E3A5F" }} title={doc.filename}>
                                    {doc.filename}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3.5">
                                <div className="flex flex-col gap-0.5">
                                  {doc.contact_name && (
                                    <Link href={`/dashboard/contacts/${doc.contact_id}`} className="inline-flex items-center gap-1 text-xs text-[#0EA5E9] hover:underline">
                                      <User size={10} /> {doc.contact_name}
                                    </Link>
                                  )}
                                  {doc.property_name && (
                                    <Link href={`/dashboard/properties/${doc.property_id}`} className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline">
                                      <Building size={10} /> {doc.property_name}
                                    </Link>
                                  )}
                                  {doc.folder_name && (
                                    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                      <FolderOpen size={10} /> {doc.folder_name}
                                    </span>
                                  )}
                                  {!doc.contact_name && !doc.property_name && !doc.folder_name && (
                                    <span className="text-xs text-gray-400">General</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3.5">
                                <span className="text-xs font-medium text-gray-500 uppercase">{doc.file_type}</span>
                              </td>
                              <td className="px-3 py-3.5">
                                <span className="text-sm text-gray-500">{formatFileSize(doc.file_size)}</span>
                              </td>
                              <td className="px-3 py-3.5"><StatusBadge doc={doc} /></td>
                              <td className="px-3 py-3.5">
                                <span className="text-sm text-gray-500">{doc.page_count !== null ? doc.page_count : "--"}</span>
                              </td>
                              <td className="px-3 py-3.5">
                                <span className="text-sm text-gray-500">{formatDate(doc.created_at)}</span>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center justify-end gap-1">
                                  <a
                                    href={getDocumentDownloadUrl("", doc.id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                                    title="Download"
                                  >
                                    <Download size={14} className="text-gray-400 hover:text-gray-600" />
                                  </a>
                                  <button
                                    onClick={() => setDeleteTarget(doc)}
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      Showing {(page - 1) * 25 + 1}--{Math.min(page * 25, total)} of {total}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                      >
                        Previous
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                        .reduce<(number | "...")[]>((acc, p, i, arr) => {
                          if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((item, i) =>
                          item === "..." ? (
                            <span key={`e-${i}`} className="px-2 text-xs text-gray-400">...</span>
                          ) : (
                            <button
                              key={item}
                              onClick={() => setPage(item as number)}
                              className={`w-8 h-8 rounded-lg text-xs font-medium ${
                                page === item ? "bg-[#0EA5E9] text-white" : "text-gray-600 hover:bg-gray-100"
                              }`}
                            >
                              {item}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Empty */
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <FileText size={24} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">No documents yet</p>
                <p className="text-xs text-gray-400 mt-1">Upload your first document to get started</p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white hover:opacity-90"
                  style={{ backgroundColor: "#0EA5E9" }}
                >
                  <Upload size={16} /> Upload Document
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadModal
          onClose={() => { if (!uploadMutation.isPending) setShowUpload(false); }}
          onUpload={(file, opts) => uploadMutation.mutate({ file, opts })}
          isUploading={uploadMutation.isPending}
          uploadProgress={uploadProgress}
          contacts={contacts}
          properties={properties}
          folders={folders}
          onCreateFolder={(name) => createFolderMutation.mutate(name)}
          isCreatingFolder={createFolderMutation.isPending}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          filename={deleteTarget.filename}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => { if (!deleteMutation.isPending) setDeleteTarget(null); }}
          isDeleting={deleteMutation.isPending}
        />
      )}

      {extractedProperty && (
        <PropertyFromDocModal
          extracted={extractedProperty}
          onSubmit={(body) => createPropertyMutation.mutate(body)}
          onCancel={() => { setExtractedProperty(null); setPendingNewPropertyDocId(null); }}
          isSubmitting={createPropertyMutation.isPending}
        />
      )}
    </div>
  );
}
