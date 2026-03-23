import { apiRequest } from "./client";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export interface Document {
  id: string;
  agent_id: string;
  contact_id: string | null;
  contact_name: string | null;
  folder_id: string | null;
  folder_name: string | null;
  filename: string;
  file_type: string;
  file_size: number;
  status: "processing" | "ready" | "failed";
  error_message: string | null;
  page_count: number | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentFolder {
  id: string;
  name: string;
  contact_id: string | null;
  document_count: number;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  section_heading: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DocumentsResponse {
  documents: Document[];
  total: number;
}

export interface ChunksResponse {
  chunks: DocumentChunk[];
  total: number;
}

export function listDocuments(
  token: string,
  page = 1,
  limit = 25,
  status?: string,
  contactId?: string,
  folderId?: string
): Promise<DocumentsResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set("status", status);
  if (contactId) params.set("contact_id", contactId);
  if (folderId) params.set("folder_id", folderId);
  return apiRequest(`/documents?${params}`, token);
}

// --- Folder API ---

export function listFolders(
  token: string
): Promise<{ folders: DocumentFolder[] }> {
  return apiRequest("/document-folders", token);
}

export function createFolder(
  token: string,
  name: string
): Promise<DocumentFolder> {
  return apiRequest("/document-folders", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameFolder(
  token: string,
  id: string,
  name: string
): Promise<DocumentFolder> {
  return apiRequest(`/document-folders/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteFolder(token: string, id: string): Promise<void> {
  return apiRequest(`/document-folders/${id}`, token, { method: "DELETE" });
}

export function getDocument(token: string, id: string): Promise<Document> {
  return apiRequest(`/documents/${id}`, token);
}

export function getDocumentChunks(
  token: string,
  docId: string,
  page = 1,
  limit = 50
): Promise<ChunksResponse> {
  return apiRequest(`/documents/${docId}/chunks?page=${page}&limit=${limit}`, token);
}

export function getDocumentChunk(
  token: string,
  docId: string,
  chunkId: string
): Promise<DocumentChunk> {
  return apiRequest(`/documents/${docId}/chunks/${chunkId}`, token);
}

export function deleteDocument(token: string, id: string): Promise<void> {
  return apiRequest(`/documents/${id}`, token, { method: "DELETE" });
}

export async function uploadDocument(
  token: string,
  file: File,
  contactId?: string,
  folderId?: string
): Promise<Document> {
  const formData = new FormData();
  formData.append("file", file);
  if (contactId) formData.append("contact_id", contactId);
  if (folderId) formData.append("folder_id", folderId);

  const res = await fetch(`${BASE}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export function uploadDocumentWithProgress(
  token: string,
  file: File,
  contactId?: string,
  folderId?: string,
  onProgress?: (percent: number) => void
): Promise<Document> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    if (contactId) formData.append("contact_id", contactId);
    if (folderId) formData.append("folder_id", folderId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(xhr.responseText || xhr.statusText));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.open("POST", `${BASE}/api/documents`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

export function getDocumentDownloadUrl(token: string, id: string): string {
  return `${BASE}/api/documents/${id}/download`;
}

/** Fetch the PDF preview as a blob URL for react-pdf rendering. */
export async function fetchDocumentPreview(
  token: string,
  docId: string
): Promise<string> {
  const res = await fetch(`${BASE}/api/documents/${docId}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("No PDF preview available");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
