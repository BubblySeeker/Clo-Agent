/** Visual workflow builder types */

export type NodeKind = "trigger" | "action" | "condition";

export interface Position {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  type: string;       // e.g. "email_sent", "send_email", "create_task"
  label: string;       // Display name
  config: Record<string, string>;  // Filled-in params like { to: "matt@...", subject: "..." }
  position: Position;
}

export interface WorkflowEdge {
  id: string;
  from: string;  // node id
  to: string;    // node id
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// Node catalog for the palette
export interface NodeTemplate {
  type: string;
  kind: NodeKind;
  label: string;
  icon: string;      // Lucide icon name
  color: string;     // Tailwind bg color
  accent: string;    // Wire/border accent
  description: string;
  configFields: ConfigField[];
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "select" | "email" | "textarea" | "contact";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

// Trigger templates
export const TRIGGER_TEMPLATES: NodeTemplate[] = [
  {
    type: "email_sent",
    kind: "trigger",
    label: "Email Received",
    icon: "Mail",
    color: "bg-violet-500",
    accent: "#8B5CF6",
    description: "When an email arrives from someone",
    configFields: [
      { key: "from", label: "From", type: "contact", placeholder: "e.g. Matt Faust" },
    ],
  },
  {
    type: "contact_created",
    kind: "trigger",
    label: "New Contact",
    icon: "UserPlus",
    color: "bg-emerald-500",
    accent: "#10B981",
    description: "When a new contact is added",
    configFields: [
      { key: "source", label: "Source", type: "select", options: [
        { value: "any", label: "Any source" },
        { value: "referral", label: "Referral" },
        { value: "website", label: "Website" },
        { value: "zillow", label: "Zillow" },
      ]},
    ],
  },
  {
    type: "deal_stage_changed",
    kind: "trigger",
    label: "Deal Stage Changed",
    icon: "GitBranch",
    color: "bg-blue-500",
    accent: "#3B82F6",
    description: "When a deal moves to a new stage",
    configFields: [
      { key: "stage", label: "To Stage", type: "text", placeholder: "e.g. Under Contract" },
    ],
  },
  {
    type: "activity_logged",
    kind: "trigger",
    label: "Activity Logged",
    icon: "Activity",
    color: "bg-amber-500",
    accent: "#F59E0B",
    description: "When an activity is recorded",
    configFields: [
      { key: "activity_type", label: "Type", type: "select", options: [
        { value: "any", label: "Any activity" },
        { value: "call", label: "Phone Call" },
        { value: "meeting", label: "Meeting" },
        { value: "showing", label: "Showing" },
      ]},
    ],
  },
  {
    type: "manual",
    kind: "trigger",
    label: "Manual Start",
    icon: "Play",
    color: "bg-gray-500",
    accent: "#6B7280",
    description: "Run manually when you want",
    configFields: [],
  },
  {
    type: "scheduled",
    kind: "trigger",
    label: "On Schedule",
    icon: "Clock",
    color: "bg-rose-500",
    accent: "#F43F5E",
    description: "Run on a repeating schedule",
    configFields: [
      { key: "cron", label: "Schedule", type: "select", options: [
        { value: "daily", label: "Every day at 9am" },
        { value: "weekly", label: "Every Monday at 9am" },
        { value: "hourly", label: "Every hour" },
      ]},
    ],
  },
];

// Action templates
export const ACTION_TEMPLATES: NodeTemplate[] = [
  {
    type: "send_email",
    kind: "action",
    label: "Send Email",
    icon: "Send",
    color: "bg-sky-500",
    accent: "#0EA5E9",
    description: "Send an email to someone",
    configFields: [
      { key: "to", label: "To", type: "contact", placeholder: "e.g. matt@example.com", required: true },
      { key: "subject", label: "Subject", type: "text", placeholder: "e.g. Follow up on..." },
      { key: "body", label: "Body", type: "textarea", placeholder: "Email content..." },
    ],
  },
  {
    type: "create_task",
    kind: "action",
    label: "Create Task",
    icon: "CheckSquare",
    color: "bg-orange-500",
    accent: "#F97316",
    description: "Create a to-do task",
    configFields: [
      { key: "title", label: "Task", type: "text", placeholder: "e.g. Follow up with client", required: true },
      { key: "due", label: "Due", type: "text", placeholder: "e.g. tomorrow, in 3 days" },
    ],
  },
  {
    type: "log_activity",
    kind: "action",
    label: "Log Activity",
    icon: "FileText",
    color: "bg-teal-500",
    accent: "#14B8A6",
    description: "Record an activity note",
    configFields: [
      { key: "type", label: "Type", type: "select", options: [
        { value: "note", label: "Note" },
        { value: "call", label: "Call" },
        { value: "meeting", label: "Meeting" },
      ]},
      { key: "notes", label: "Notes", type: "textarea", placeholder: "Activity details..." },
    ],
  },
  {
    type: "update_deal",
    kind: "action",
    label: "Update Deal",
    icon: "TrendingUp",
    color: "bg-indigo-500",
    accent: "#6366F1",
    description: "Update a deal's stage or details",
    configFields: [
      { key: "stage", label: "Move to Stage", type: "text", placeholder: "e.g. Closed Won" },
    ],
  },
  {
    type: "create_contact",
    kind: "action",
    label: "Create Contact",
    icon: "UserPlus",
    color: "bg-green-500",
    accent: "#22C55E",
    description: "Add a new contact",
    configFields: [
      { key: "name", label: "Name", type: "text", placeholder: "e.g. John Smith", required: true },
      { key: "email", label: "Email", type: "email", placeholder: "e.g. john@example.com" },
      { key: "phone", label: "Phone", type: "text", placeholder: "e.g. (555) 123-4567" },
    ],
  },
  {
    type: "ai_decision",
    kind: "action",
    label: "AI Decision",
    icon: "Bot",
    color: "bg-purple-500",
    accent: "#A855F7",
    description: "Let AI decide the next action",
    configFields: [
      { key: "instruction", label: "Instruction", type: "textarea", placeholder: "e.g. Summarize the email and decide if urgent..." },
    ],
  },
];

// Logic / flow-control templates
export const LOGIC_TEMPLATES: NodeTemplate[] = [
  {
    type: "delay",
    kind: "action",
    label: "Wait / Delay",
    icon: "Timer",
    color: "bg-slate-500",
    accent: "#64748B",
    description: "Pause before the next step",
    configFields: [
      { key: "duration", label: "Duration", type: "text", placeholder: "e.g. 2 hours, 1 day, 30 minutes" },
    ],
  },
  {
    type: "condition",
    kind: "condition",
    label: "If / Else",
    icon: "GitFork",
    color: "bg-yellow-500",
    accent: "#EAB308",
    description: "Branch based on a condition",
    configFields: [
      { key: "condition", label: "Condition", type: "textarea", placeholder: "e.g. If deal value > $500K, if contact source is Zillow..." },
    ],
  },
];

// Additional action templates
export const EXTRA_ACTION_TEMPLATES: NodeTemplate[] = [
  {
    type: "send_sms",
    kind: "action",
    label: "Send SMS",
    icon: "MessageSquare",
    color: "bg-cyan-500",
    accent: "#06B6D4",
    description: "Send a text message",
    configFields: [
      { key: "to", label: "To", type: "contact", placeholder: "e.g. Matt Faust" },
      { key: "message", label: "Message", type: "textarea", placeholder: "SMS content (160 chars)..." },
    ],
  },
  {
    type: "update_contact",
    kind: "action",
    label: "Update Contact",
    icon: "UserCog",
    color: "bg-lime-500",
    accent: "#84CC16",
    description: "Update a contact's details",
    configFields: [
      { key: "contact", label: "Contact", type: "contact", placeholder: "e.g. Matt Faust" },
      { key: "field", label: "Field", type: "select", options: [
        { value: "name", label: "Name" },
        { value: "email", label: "Email" },
        { value: "phone", label: "Phone" },
        { value: "source", label: "Source" },
      ]},
      { key: "value", label: "New Value", type: "text", placeholder: "New value..." },
    ],
  },
  {
    type: "notify_agent",
    kind: "action",
    label: "Notify Agent",
    icon: "Bell",
    color: "bg-pink-500",
    accent: "#EC4899",
    description: "Send yourself a notification",
    configFields: [
      { key: "message", label: "Message", type: "textarea", placeholder: "e.g. New hot lead requires attention!" },
    ],
  },
  {
    type: "add_tag",
    kind: "action",
    label: "Add Tag",
    icon: "Tag",
    color: "bg-fuchsia-500",
    accent: "#D946EF",
    description: "Tag a contact for campaigns",
    configFields: [
      { key: "contact", label: "Contact", type: "contact", placeholder: "e.g. Matt Faust" },
      { key: "tag", label: "Tag", type: "text", placeholder: "e.g. VIP, Hot Lead, Buyer" },
    ],
  },
];

export const ALL_TEMPLATES = [
  ...TRIGGER_TEMPLATES,
  ...ACTION_TEMPLATES,
  ...LOGIC_TEMPLATES,
  ...EXTRA_ACTION_TEMPLATES,
];

export function getTemplate(type: string): NodeTemplate | undefined {
  return ALL_TEMPLATES.find(t => t.type === type);
}
