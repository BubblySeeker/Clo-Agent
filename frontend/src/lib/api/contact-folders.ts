import { apiRequest } from "./client";

export interface ContactFolder {
  id: string;
  name: string;
  contact_count: number;
  created_at: string;
}

export interface ContactFoldersResponse {
  folders: ContactFolder[];
}

export function listContactFolders(token: string): Promise<ContactFoldersResponse> {
  return apiRequest("/contact-folders", token);
}

export function createContactFolder(token: string, name: string): Promise<ContactFolder> {
  return apiRequest("/contact-folders", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateContactFolder(token: string, id: string, name: string): Promise<ContactFolder> {
  return apiRequest(`/contact-folders/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteContactFolder(token: string, id: string, confirmName: string): Promise<void> {
  return apiRequest(`/contact-folders/${id}`, token, {
    method: "DELETE",
    body: JSON.stringify({ confirm_name: confirmName }),
  });
}

export function moveContactsToFolder(token: string, folderId: string, contactIds: string[]): Promise<void> {
  return apiRequest(`/contact-folders/${folderId}/contacts`, token, {
    method: "POST",
    body: JSON.stringify({ contact_ids: contactIds }),
  });
}

export function removeContactsFromFolder(token: string, folderId: string, contactIds: string[]): Promise<void> {
  return apiRequest(`/contact-folders/${folderId}/contacts`, token, {
    method: "DELETE",
    body: JSON.stringify({ contact_ids: contactIds }),
  });
}
