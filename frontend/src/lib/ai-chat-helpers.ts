/**
 * Shared label maps and formatting for AI chat tool calls and confirmations.
 * Used by both AIChatBubble (floating) and ChatPage (full-page).
 */

export const toolLabel: Record<string, string> = {
  // Contacts
  search_contacts: "Searching contacts",
  get_contact_details: "Loading contact details",
  get_contact_activities: "Loading contact activities",
  get_buyer_profile: "Loading buyer profile",
  create_contact: "Creating contact",
  update_contact: "Updating contact",
  delete_contact: "Deleting contact",
  create_buyer_profile: "Creating buyer profile",
  update_buyer_profile: "Updating buyer profile",
  // Deals
  list_deals: "Loading deals",
  get_deal: "Loading deal details",
  get_deal_stages: "Loading deal stages",
  get_analytics: "Loading analytics",
  create_deal: "Creating deal",
  update_deal: "Updating deal",
  delete_deal: "Deleting deal",
  // Emails
  search_emails: "Searching emails",
  get_email_thread: "Loading email thread",
  draft_email: "Drafting email",
  send_email: "Sending email",
  // Activities
  get_all_activities: "Loading activities",
  log_activity: "Logging activity",
  // Tasks
  get_overdue_tasks: "Loading overdue tasks",
  create_task: "Creating task",
  complete_task: "Completing task",
  reschedule_task: "Rescheduling task",
  // Properties
  search_properties: "Searching properties",
  get_property: "Loading property details",
  match_buyer_to_properties: "Matching properties",
  create_property: "Creating property",
  update_property: "Updating property",
  delete_property: "Deleting property",
  // Documents
  search_documents: "Searching documents",
  list_documents: "Loading documents",
  // Search
  semantic_search: "Searching knowledge base",
  get_dashboard_summary: "Loading dashboard summary",
};

export const confirmLabel: Record<string, string> = {
  create_contact: "Create Contact",
  update_contact: "Update Contact",
  delete_contact: "Delete Contact",
  create_buyer_profile: "Create Buyer Profile",
  update_buyer_profile: "Update Buyer Profile",
  create_deal: "Create Deal",
  update_deal: "Update Deal",
  delete_deal: "Delete Deal",
  send_email: "Send Email",
  log_activity: "Log Activity",
  create_task: "Create Task",
  create_property: "Create Property",
  update_property: "Update Property",
  delete_property: "Delete Property",
};

export function formatPreview(tool: string, preview: Record<string, unknown>): string {
  // Tool-specific formatting for common actions
  if (tool === "create_contact" || tool === "update_contact") {
    const parts: string[] = [];
    if (preview.first_name || preview.last_name) {
      parts.push(`${preview.first_name ?? ""} ${preview.last_name ?? ""}`.trim());
    }
    if (preview.email) parts.push(String(preview.email));
    if (preview.phone) parts.push(String(preview.phone));
    if (parts.length > 0) return parts.join(" · ");
  }
  if (tool === "send_email") {
    const parts: string[] = [];
    if (preview.to) parts.push(`To: ${preview.to}`);
    if (preview.subject) parts.push(`Subject: ${preview.subject}`);
    if (parts.length > 0) return parts.join(" · ");
  }
  if (tool === "create_deal" || tool === "update_deal") {
    const parts: string[] = [];
    if (preview.title) parts.push(String(preview.title));
    if (preview.value) parts.push(`$${preview.value}`);
    if (parts.length > 0) return parts.join(" · ");
  }
  // Fallback: key-value pairs
  return Object.entries(preview)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Citation parsing for RAG document references
// ---------------------------------------------------------------------------

export interface TextSegment {
  type: "text";
  content: string;
}

export interface CitationSegment {
  type: "citation";
  filename: string;
  pageNumber: number | null;
  chunkId: string | null;
  documentId: string | null;
}

export type MessageSegment = TextSegment | CitationSegment;

/**
 * Parse an assistant message for document citations.
 * Citations look like: [Doc: filename.pdf, Page 3][[chunk:uuid-here]]
 * The [[chunk:...]] part is a hidden reference stripped from display.
 */
export function parseMessageWithCitations(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  // Match: [Doc: filename, Page N][[chunk:uuid]] — page and chunk are optional
  // Page can be a single number (3), range (17-32), or comma-separated (1, 3, 5)
  const regex = /\[Doc:\s*([^,\]]+?)(?:,\s*Pages?\s*([\d,\s-]+))?\]\s*(?:\[\[chunk:([a-f0-9-]+)(?:::([a-f0-9-]+))?\]\])?/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Add text before this citation
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }

    // Extract the first page number from ranges like "17-32" or "1, 3, 5"
    let pageNumber: number | null = null;
    if (match[2]) {
      const firstNum = match[2].match(/\d+/);
      if (firstNum) pageNumber = parseInt(firstNum[0], 10);
    }

    let filename = match[1].trim();

    // Handle page-only citations like [Doc: Page 2-3] where AI omitted the filename
    const pageOnlyMatch = filename.match(/^Pages?\s*([\d,\s-]+)$/i);
    if (pageOnlyMatch) {
      // "filename" is actually a page reference — extract page number and clear filename
      const firstNum = pageOnlyMatch[1].match(/\d+/);
      if (firstNum) pageNumber = parseInt(firstNum[0], 10);
      filename = "";
    }

    segments.push({
      type: "citation",
      filename,
      pageNumber,
      chunkId: match[3] || null,
      documentId: match[4] || null,
    });

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    // Strip any stray [[chunk:...]] that might appear without a [Doc:] prefix
    const remaining = content.slice(lastIndex).replace(/\[\[chunk:[a-f0-9-]+(?:::[a-f0-9-]+)?\]\]/g, "");
    if (remaining) {
      segments.push({ type: "text", content: remaining });
    }
  }

  // If no citations found, return the whole content as one text segment
  if (segments.length === 0) {
    segments.push({ type: "text", content });
  }

  return segments;
}
