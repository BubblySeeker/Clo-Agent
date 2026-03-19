/**
 * Shared label maps and formatting for AI chat tool calls and confirmations.
 * Used by both AIChatBubble (floating) and ChatPage (full-page).
 */

export const toolLabel: Record<string, string> = {
  search_contacts: "Searching contacts",
  get_dashboard_summary: "Fetching dashboard",
  get_contact_details: "Loading contact",
  get_contact_activities: "Loading activities",
  get_deal: "Loading deal details",
  get_buyer_profile: "Loading buyer profile",
  get_all_activities: "Loading recent activities",
  list_deals: "Fetching deals",
  get_deal_stages: "Loading pipeline",
  get_analytics: "Crunching analytics",
  get_overdue_tasks: "Checking overdue tasks",
  create_contact: "Creating contact",
  update_contact: "Updating contact",
  delete_contact: "Deleting contact",
  log_activity: "Logging activity",
  create_deal: "Creating deal",
  update_deal: "Updating deal",
  delete_deal: "Deleting deal",
  create_buyer_profile: "Creating buyer profile",
  update_buyer_profile: "Updating buyer profile",
  create_task: "Creating task",
  complete_task: "Completing task",
  reschedule_task: "Rescheduling task",
  search_properties: "Searching properties",
  get_property: "Loading property",
  match_buyer_to_properties: "Matching buyer to properties",
  create_property: "Creating property",
  update_property: "Updating property",
  delete_property: "Deleting property",
  search_emails: "Searching emails",
  get_email_thread: "Loading email thread",
  draft_email: "Drafting email",
  send_email: "Sending email",
};

export const confirmLabel: Record<string, string> = {
  create_contact: "Add New Contact",
  update_contact: "Update Contact",
  delete_contact: "Delete Contact",
  create_deal: "Create Deal",
  update_deal: "Update Deal",
  delete_deal: "Delete Deal",
  log_activity: "Log Activity",
  create_task: "Create Task",
  complete_task: "Complete Task",
  reschedule_task: "Reschedule Task",
  create_buyer_profile: "Create Buyer Profile",
  update_buyer_profile: "Update Buyer Profile",
  create_property: "Add New Property",
  update_property: "Update Property",
  delete_property: "Delete Property",
  send_email: "Send Email",
};

export function formatPreview(tool: string, preview: Record<string, unknown>): string {
  switch (tool) {
    case "create_contact":
      return `Add new contact: ${preview.first_name} ${preview.last_name}${preview.email ? ` (${preview.email})` : ""}${preview.phone ? `, ${preview.phone}` : ""}${preview.source ? ` — Source: ${preview.source}` : ""}`;
    case "update_contact": {
      const fields = Object.entries(preview).filter(([k]) => k !== "contact_id").map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ");
      return `Update contact: ${fields}`;
    }
    case "delete_contact":
      return "Delete this contact and all their associated data (deals, activities, profiles)";
    case "create_deal":
      return `Create deal: "${preview.title}"${preview.value ? ` worth $${Number(preview.value).toLocaleString()}` : ""}${preview.stage_name ? ` in ${preview.stage_name} stage` : ""}`;
    case "update_deal": {
      const dealFields = Object.entries(preview).filter(([k]) => k !== "deal_id").map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ");
      return `Update deal: ${dealFields}`;
    }
    case "delete_deal":
      return "Delete this deal from the pipeline";
    case "log_activity":
      return `Log ${preview.type}: "${preview.body}"`;
    case "create_task":
      return `Create task: "${preview.body}"${preview.due_date ? ` due ${preview.due_date}` : ""}${preview.priority ? ` (${preview.priority})` : ""}`;
    case "complete_task":
      return "Mark this task as completed";
    case "reschedule_task":
      return `Reschedule task to ${preview.new_due_date}`;
    case "create_buyer_profile": {
      const parts: string[] = [];
      if (preview.budget_min || preview.budget_max) parts.push(`Budget: $${(Number(preview.budget_min) || 0).toLocaleString()}–$${(Number(preview.budget_max) || 0).toLocaleString()}`);
      if (preview.bedrooms) parts.push(`${preview.bedrooms} bed`);
      if (preview.bathrooms) parts.push(`${preview.bathrooms} bath`);
      if (Array.isArray(preview.locations) && preview.locations.length) parts.push(`Areas: ${preview.locations.join(", ")}`);
      if (preview.property_type) parts.push(String(preview.property_type));
      return `Create buyer profile: ${parts.join(" · ") || "with provided preferences"}`;
    }
    case "update_buyer_profile": {
      const bpFields = Object.entries(preview).filter(([k]) => k !== "contact_id").map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : v}`).join(", ");
      return `Update buyer profile: ${bpFields}`;
    }
    case "create_property":
      return `${preview.address}${preview.city ? `, ${preview.city}` : ""}${preview.price ? ` — $${Number(preview.price).toLocaleString()}` : ""}`;
    case "update_property":
      return `Property ${(preview.property_id as string)?.slice(0, 8)}… — ${Object.keys(preview).filter((k: string) => k !== "property_id").join(", ")}`;
    case "delete_property":
      return `Property ${(preview.property_id as string)?.slice(0, 8)}…`;
    case "send_email":
      return `Send email to ${preview.to}${preview.subject ? `: "${preview.subject}"` : ""}`;
    default:
      return Object.entries(preview).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ");
  }
}
