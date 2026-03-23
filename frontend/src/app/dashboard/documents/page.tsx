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
  FolderOpen,
  FolderPlus,
  Search,
  Plus,
  User,
} from "lucide-react";
import Link from "next/link";
import {
  listDocuments,
  uploadDocumentWithProgress,
  deleteDocument,
  getDocumentDownloadUrl,
  listFolders,
  createFolder,
  type Document,
  type DocumentsResponse,
  type DocumentFolder,
} from "@/lib/api/documents";
import { listContacts, type Contact } from "@/lib/api/contacts";

/* ─── Helpers ─── */

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
  const ft = fileType.toLowerCase();
  if (["pdf", "docx", "doc", "txt", "rtf", "md"].includes(ft)) return FileText;
  if (["csv", "xlsx", "xls"].includes(ft)) return FileSpreadsheet;
  if (["png", "jpg", "jpeg", "webp"].includes(ft)) return ImageIcon;
  return File;
}

function getFileIconColor(fileType: string): { bg: string; color: string } {
  const ft = fileType.toLowerCase();
  if (ft === "pdf") return { bg: "#FEE2E2", color: "#EF4444" };
  if (["docx", "doc"].includes(ft)) return { bg: "#DBEAFE", color: "#3B82F6" };
  if (["csv", "xlsx", "xls"].includes(ft)) return { bg: "#DCFCE7", color: "#22C55E" };
  if (["png", "jpg", "jpeg", "webp"].includes(ft)) return { bg: "#FEF3C7", color: "#D97706" };
  if (["txt", "md", "rtf"].includes(ft)) return { bg: "#F3F4F6", color: "#6B7280" };
  return { bg: "#F3F4F6", color: "#6B7280" };
}

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.csv,.txt,.xlsx,.xls,.rtf,.md,.png,.jpg,.jpeg,.webp";
const ACCEPTED_SET = new Set(["pdf", "docx", "doc", "csv", "txt", "xlsx", "xls", "rtf", "md", "png", "jpg", "jpeg", "webp"]);
const MAX_SIZE = 100 * 1024 * 1024;

/* ─── Status Badge ─── */

function StatusBadge({ doc }: { doc: Document }) {
  if (doc.status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600">
        <Loader2 size={12} className="animate-spin" />
        Processing...
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

/* ─── Searchable Folder Dropdown ─── */

function FolderDropdown({
  folders,
  value,
  onChange,
  onCreateFolder,
  isCreating,
  placeholder,
}: {
  folders: DocumentFolder[];
  value: string;
  onChange: (folderId: string) => void;
  onCreateFolder: (name: string) => void;
  isCreating: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);

  // Click-outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreateInput(false);
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  // Focus create input when shown
  useEffect(() => {
    if (showCreateInput) setTimeout(() => createRef.current?.focus(), 50);
  }, [showCreateInput]);

  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel =
    value === "" ? (placeholder ?? "All Documents") :
    value === "general" ? "General (unfiled)" :
    folders.find((f) => f.id === value)?.name ?? "All Documents";

  const handleCreate = () => {
    const name = newFolderName.trim();
    if (!name) return;
    onCreateFolder(name);
    setNewFolderName("");
    setShowCreateInput(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 min-w-[220px] hover:border-gray-300 transition-colors"
      >
        <FolderOpen size={14} className="text-gray-400 shrink-0" />
        <span className="flex-1 text-left truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-[280px] bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search folders..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-50 text-sm outline-none focus:bg-gray-100 placeholder-gray-400"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {/* All Documents */}
            <button
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                value === "" ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"
              }`}
            >
              All Documents
            </button>

            {/* General */}
            <button
              onClick={() => { onChange("general"); setOpen(false); setSearch(""); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                value === "general" ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"
              }`}
            >
              <span>General (unfiled)</span>
            </button>

            {/* Divider */}
            {filtered.length > 0 && <div className="border-t border-gray-100 my-1" />}

            {/* Folders */}
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => { onChange(f.id); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                  value === f.id ? "text-[#0EA5E9] font-medium bg-[#0EA5E9]/5" : "text-gray-700"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  {f.contact_id ? (
                    <User size={13} className="text-[#0EA5E9] shrink-0" />
                  ) : (
                    <FolderOpen size={13} className="text-gray-400 shrink-0" />
                  )}
                  {f.name}
                </span>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{f.document_count}</span>
              </button>
            ))}

            {search && filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">No folders match &ldquo;{search}&rdquo;</p>
            )}
          </div>

          {/* Create Folder */}
          <div className="border-t border-gray-100 p-2">
            {showCreateInput ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={createRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setShowCreateInput(false); setNewFolderName(""); }
                  }}
                  placeholder="Folder name..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-gray-50 text-sm outline-none focus:bg-gray-100 placeholder-gray-400"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newFolderName.trim() || isCreating}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 transition-colors disabled:opacity-50"
                >
                  {isCreating ? <Loader2 size={12} className="animate-spin" /> : "Create"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateInput(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <FolderPlus size={14} className="text-gray-400" />
                Create new folder
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Upload Modal ─── */

function UploadModal({
  onClose,
  onUpload,
  isUploading,
  uploadProgress,
  contacts,
  folders,
  defaultFolderId,
  onCreateFolder,
  isCreatingFolder,
}: {
  onClose: () => void;
  onUpload: (file: File, folderId?: string, contactId?: string) => void;
  isUploading: boolean;
  uploadProgress: number | null;
  contacts: Contact[];
  folders: DocumentFolder[];
  defaultFolderId: string;
  onCreateFolder: (name: string) => void;
  isCreatingFolder: boolean;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    defaultFolderId === "general" || defaultFolderId === "" ? "" : defaultFolderId
  );
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSet = useCallback((file: File) => {
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_SET.has(ext)) {
      setError(`Unsupported file type: .${ext}`);
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File exceeds 100MB limit");
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSet(file);
    },
    [validateAndSet]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSet(file);
    },
    [validateAndSet]
  );

  const FileIcon = selectedFile ? getFileIcon(selectedFile.name.split(".").pop() ?? "") : File;
  const iconColors = selectedFile
    ? getFileIconColor(selectedFile.name.split(".").pop() ?? "")
    : { bg: "#F3F4F6", color: "#6B7280" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold" style={{ color: "#1E3A5F" }}>
            Upload Document
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone — hidden when file selected */}
          {!selectedFile && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-[#0EA5E9] bg-[#0EA5E9]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload
                size={32}
                className={`mx-auto mb-3 ${isDragging ? "text-[#0EA5E9]" : "text-gray-300"}`}
              />
              <p className="text-sm font-medium text-gray-600">Drop files here</p>
              <p className="text-xs text-gray-400 mt-1">or</p>
              <button
                type="button"
                className="mt-2 px-4 py-1.5 rounded-lg text-sm font-medium text-[#0EA5E9] bg-[#0EA5E9]/10 hover:bg-[#0EA5E9]/20 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Browse files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileChange}
                className="hidden"
              />
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
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: iconColors.bg }}
              >
                <FileIcon size={18} style={{ color: iconColors.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
              >
                <X size={14} className="text-gray-400" />
              </button>
              {/* Hidden input still needs to be in DOM for re-selection */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Folder picker */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Folder <span className="normal-case text-gray-400 font-normal">(optional)</span>
            </label>
            <FolderDropdown
              folders={folders}
              value={selectedFolderId}
              onChange={setSelectedFolderId}
              onCreateFolder={onCreateFolder}
              isCreating={isCreatingFolder}
              placeholder="General (no folder)"
            />
          </div>

          {/* Contact assignment */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Contact <span className="normal-case text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#0EA5E9] appearance-none text-gray-700"
            >
              <option value="">No contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* Upload button */}
          <div className="space-y-2">
            <button
              onClick={() =>
                selectedFile &&
                onUpload(
                  selectedFile,
                  selectedFolderId || undefined,
                  selectedContactId || undefined
                )
              }
              disabled={!selectedFile || isUploading}
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
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%`, backgroundColor: "#0EA5E9" }}
                />
              </div>
            )}
          </div>

          {/* Info */}
          <p className="text-xs text-gray-400 text-center">
            Supported: PDF, DOCX, DOC, CSV, TXT, XLSX, XLS, RTF, MD, PNG, JPG, WEBP. Max 100MB.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Delete Confirmation Dialog ─── */

function DeleteDialog({
  filename,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "#1E3A5F" }}>
              Delete Document
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Are you sure you want to delete <span className="font-medium">{filename}</span>?
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

export default function DocumentsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [folderFilter, setFolderFilter] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const pollIntervalRef = useRef(2000);

  // Load contacts for upload picker
  const { data: contactsData } = useQuery({
    queryKey: ["contacts-list"],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, { limit: 200 });
    },
  });
  const contacts = contactsData?.contacts ?? [];

  // Load folders
  const { data: foldersData } = useQuery({
    queryKey: ["document-folders"],
    queryFn: async () => {
      const token = await getToken();
      return listFolders(token!);
    },
  });
  const folders = foldersData?.folders ?? [];

  // Load documents
  const { data, isLoading, error } = useQuery<DocumentsResponse>({
    queryKey: ["documents", page, folderFilter],
    queryFn: async () => {
      const token = await getToken();
      return listDocuments(token!, page, 25, undefined, undefined, folderFilter || undefined);
    },
    refetchInterval: (query) => {
      const docs = query.state.data?.documents;
      const hasProcessing = docs?.some((d: Document) => d.status === "processing");
      if (!hasProcessing) {
        pollIntervalRef.current = 2000;
        return false;
      }
      const interval = pollIntervalRef.current;
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, 30000);
      return interval;
    },
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = await getToken();
      return createFolder(token!, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, folderId, contactId }: { file: File; folderId?: string; contactId?: string }) => {
      const token = await getToken();
      setUploadProgress(0);
      return uploadDocumentWithProgress(token!, file, contactId, folderId, (pct) => setUploadProgress(pct));
    },
    onSuccess: () => {
      setUploadProgress(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
      setShowUpload(false);
    },
    onError: () => {
      setUploadProgress(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return deleteDocument(token!, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
      setDeleteTarget(null);
    },
  });

  const documents = data?.documents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="p-6">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>
              Documents
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload and manage your documents
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            <Upload size={16} /> Upload Document
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <FolderDropdown
            folders={folders}
            value={folderFilter}
            onChange={(id) => { setFolderFilter(id); setPage(1); }}
            onCreateFolder={(name) => createFolderMutation.mutate(name)}
            isCreating={createFolderMutation.isPending}
          />
          {folderFilter && (
            <button
              onClick={() => { setFolderFilter(""); setPage(1); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Upload Modal */}
        {showUpload && (
          <UploadModal
            onClose={() => {
              if (!uploadMutation.isPending) setShowUpload(false);
            }}
            onUpload={(file, folderId, contactId) =>
              uploadMutation.mutate({ file, folderId, contactId })
            }
            isUploading={uploadMutation.isPending}
            uploadProgress={uploadProgress}
            contacts={contacts}
            folders={folders}
            defaultFolderId={folderFilter}
            onCreateFolder={(name) => createFolderMutation.mutate(name)}
            isCreatingFolder={createFolderMutation.isPending}
          />
        )}

        {/* Delete Confirmation */}
        {deleteTarget && (
          <DeleteDialog
            filename={deleteTarget.filename}
            onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
            onCancel={() => {
              if (!deleteMutation.isPending) setDeleteTarget(null);
            }}
            isDeleting={deleteMutation.isPending}
          />
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm">
            <AlertCircle size={16} />
            Failed to load documents. Please try again.
          </div>
        )}

        {/* Loading state */}
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
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">
                        Name
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">
                        Folder
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">
                        Type
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">
                        Size
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">
                        Status
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">
                        Pages
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-3">
                        Uploaded
                      </th>
                      <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {documents.map((doc) => {
                      const Icon = getFileIcon(doc.file_type);
                      const iconColors = getFileIconColor(doc.file_type);
                      return (
                        <tr
                          key={doc.id}
                          className="hover:bg-gray-50/50 transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                style={{ backgroundColor: iconColors.bg }}
                              >
                                <Icon size={16} style={{ color: iconColors.color }} />
                              </div>
                              <span
                                className="text-sm font-medium truncate max-w-[240px]"
                                style={{ color: "#1E3A5F" }}
                                title={doc.filename}
                              >
                                {doc.filename}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                <FolderOpen size={10} />
                                {doc.folder_name ?? "General"}
                              </span>
                              {doc.contact_name && (
                                <Link
                                  href={`/dashboard/contacts/${doc.contact_id}`}
                                  className="block text-xs text-[#0EA5E9] hover:underline mt-0.5 truncate max-w-[140px]"
                                >
                                  {doc.contact_name}
                                </Link>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="text-xs font-medium text-gray-500 uppercase">
                              {doc.file_type}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="text-sm text-gray-500">
                              {formatFileSize(doc.file_size)}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <StatusBadge doc={doc} />
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="text-sm text-gray-500">
                              {doc.page_count !== null ? doc.page_count : "--"}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="text-sm text-gray-500">
                              {formatDate(doc.created_at)}
                            </span>
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
                  Showing {(page - 1) * 25 + 1}--{Math.min(page * 25, total)} of {total} documents
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === totalPages ||
                        Math.abs(p - page) <= 1
                    )
                    .reduce<(number | "...")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, i) =>
                      item === "..." ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-400">
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => setPage(item as number)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            page === item
                              ? "bg-[#0EA5E9] text-white"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {item}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">No documents yet</p>
            <p className="text-xs text-gray-400 mt-1">Upload your first document to get started</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "#0EA5E9" }}
            >
              <Upload size={16} /> Upload Document
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
