"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAllActivities, createActivity, type Activity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { getGmailStatus, syncGmail, listEmails, getEmail, sendEmail, markEmailRead, type Email } from "@/lib/api/gmail";
import { getSMSStatus, syncSMS, listSMSMessages, sendSMS, type SMSMessage } from "@/lib/api/sms";
import { listCallLogs, initiateCall, getCallTranscript, confirmTranscriptAction, dismissTranscriptAction, updateCallOutcome, type CallLog, type CallTranscript, type AIAction } from "@/lib/api/calls";
import { Phone, Mail, Search, Plus, X, User, ChevronDown, ChevronUp, ChevronRight, RefreshCw, Send, Reply, Star, Paperclip, MessageSquare, PhoneCall, Play, Loader2, Bot, FileText, CheckCircle, XCircle } from "lucide-react";

const typeColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#0EA5E9" },
  email: { bg: "#F0FDF4", color: "#22C55E" },
  gmail: { bg: "#FEF2F2", color: "#EA4335" },
  sms: { bg: "#FFF7ED", color: "#F22F46" },
  twilio_call: { bg: "#F3E8FF", color: "#7C3AED" },
};

interface CommItem {
  id: string;
  type: "call" | "email" | "gmail_in" | "gmail_out" | "sms_in" | "sms_out" | "twilio_call_in" | "twilio_call_out";
  contact_id: string | null;
  contact_name: string;
  body: string;
  subject?: string;
  date: string;
  from_address?: string;
  from_name?: string;
  to_addresses?: string[];
  email_data?: Email;
  sms_data?: SMSMessage;
  call_data?: CallLog;
  groupKey: string;
  groupName: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Internal Gmail labels that should not be shown as user-facing label pills
const INTERNAL_LABELS = new Set([
  "INBOX", "UNREAD", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED",
  "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES", "CATEGORY_FORUMS", "HAS_ATTACHMENT",
]);

/** Return only user-created labels (filter out Gmail system labels). */
function getUserLabels(labels: string[]): string[] {
  return labels.filter((l) => !INTERNAL_LABELS.has(l));
}

/** Check if the labels list indicates the email has attachments. */
function emailHasAttachment(labels: string[]): boolean {
  return labels.includes("HAS_ATTACHMENT");
}

/** Check if the labels list contains IMPORTANT or STARRED. */
function emailIsStarred(labels: string[]): boolean {
  return labels.includes("STARRED") || labels.includes("IMPORTANT");
}

function RecordingPlayer({ callId }: { callId: string }) {
  const { getToken } = useAuth();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAudio = async () => {
    if (audioUrl) return;
    setLoading(true);
    try {
      const token = await getToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const resp = await fetch(`${API_URL}/api/calls/${callId}/recording`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (!audioUrl) {
    return (
      <button
        onClick={loadAudio}
        disabled={loading}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Play className="w-3 h-3" />
        )}
        {loading ? "Loading..." : "Play Recording"}
      </button>
    );
  }

  return (
    <audio controls src={audioUrl} className="w-full h-8 mt-1" />
  );
}

function AIActionCard({ action, index, onConfirm, onDismiss, isConfirming, isDismissing }: {
  action: AIAction;
  index: number;
  onConfirm: () => void;
  onDismiss: () => void;
  isConfirming: boolean;
  isDismissing: boolean;
}) {
  const typeLabels: Record<string, { label: string; color: string; bg: string }> = {
    create_task: { label: "Task", color: "#F59E0B", bg: "#FFFBEB" },
    update_buyer_profile: { label: "Buyer Profile", color: "#0EA5E9", bg: "#F0F9FF" },
    update_deal_stage: { label: "Deal Stage", color: "#22C55E", bg: "#F0FDF4" },
  };
  const typeInfo = typeLabels[action.type] || { label: action.type, color: "#64748B", bg: "#F8FAFC" };

  const descriptionParts: string[] = [];
  const p = action.params;
  if (action.type === "create_task") {
    descriptionParts.push(String(p.body || ""));
    if (p.due_date) descriptionParts.push(`Due: ${p.due_date}`);
    if (p.priority) descriptionParts.push(`Priority: ${p.priority}`);
  } else if (action.type === "update_buyer_profile") {
    Object.entries(p).filter(([k]) => k !== "contact_id").forEach(([k, v]) => {
      if (v !== null && v !== undefined) {
        descriptionParts.push(`${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : v}`);
      }
    });
  } else if (action.type === "update_deal_stage") {
    descriptionParts.push(`Move to "${p.stage_name}" stage`);
  }

  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 12, background: "#FAFAFA" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: typeInfo.color, background: typeInfo.bg, padding: "2px 8px", borderRadius: 9999 }}>
          {typeInfo.label}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.4, marginBottom: 8 }}>
        {descriptionParts.join(" · ")}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onConfirm}
          disabled={isConfirming || isDismissing}
          style={{ padding: "4px 12px", fontSize: 12, fontWeight: 500, borderRadius: 6, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer", opacity: (isConfirming || isDismissing) ? 0.5 : 1 }}
        >
          {isConfirming ? "Confirming..." : "Confirm"}
        </button>
        <button
          onClick={onDismiss}
          disabled={isConfirming || isDismissing}
          style={{ padding: "4px 12px", fontSize: 12, fontWeight: 500, borderRadius: 6, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", cursor: "pointer", opacity: (isConfirming || isDismissing) ? 0.5 : 1 }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function TranscriptSection({ callId }: { callId: string }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: transcript, isLoading } = useQuery({
    queryKey: ["call-transcript", callId],
    queryFn: async () => {
      const token = await getToken();
      return getCallTranscript(token!, callId);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ index }: { index: number }) => {
      const token = await getToken();
      return confirmTranscriptAction(token!, callId, index);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["call-transcript", callId] }),
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ index }: { index: number }) => {
      const token = await getToken();
      return dismissTranscriptAction(token!, callId, index);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["call-transcript", callId] }),
  });

  if (isLoading) return <div style={{ padding: "12px", color: "#64748B", fontSize: 13 }}>Loading transcript...</div>;
  if (!transcript || transcript.status === "failed") return null;
  if (transcript.status === "processing") return <div style={{ padding: "12px", color: "#F59E0B", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={14} className="animate-spin" /> Transcribing...</div>;

  const pendingActions = transcript.ai_actions.filter(a => a.status === "pending");
  const processedActions = transcript.ai_actions.filter(a => a.status !== "pending");

  return (
    <div style={{ borderTop: "1px solid #E2E8F0", marginTop: 12 }}>
      {/* AI Summary */}
      {transcript.ai_summary && (
        <div style={{ padding: "12px 0", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>AI Summary</div>
          <div style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.5 }}>{transcript.ai_summary}</div>
        </div>
      )}

      {/* AI Action Cards */}
      {pendingActions.length > 0 && (
        <div style={{ padding: "12px 0", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Suggested Actions</div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {transcript.ai_actions.map((action, idx) => {
              if (action.status !== "pending") return null;
              return (
                <AIActionCard
                  key={idx}
                  action={action}
                  index={idx}
                  onConfirm={() => confirmMutation.mutate({ index: idx })}
                  onDismiss={() => dismissMutation.mutate({ index: idx })}
                  isConfirming={confirmMutation.isPending}
                  isDismissing={dismissMutation.isPending}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Processed actions (confirmed/dismissed) summary */}
      {processedActions.length > 0 && (
        <div style={{ padding: "8px 0", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#94A3B8" }}>
          {processedActions.filter(a => a.status === "confirmed").length} confirmed, {processedActions.filter(a => a.status === "dismissed").length} dismissed
        </div>
      )}

      {/* Transcript toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13, color: "#7C3AED", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? "Hide transcript" : `Show transcript (${transcript.word_count || 0} words)`}
      </button>

      {expanded && (
        <div style={{ padding: "8px 0", maxHeight: 400, overflowY: "auto" as const }}>
          {transcript.speaker_segments.map((seg, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: seg.speaker === "agent" ? "#7C3AED" : seg.speaker === "client" ? "#0EA5E9" : "#94A3B8",
                textTransform: "uppercase" as const,
              }}>
                {seg.speaker}
              </span>
              <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 6 }}>
                {Math.floor(seg.start / 60)}:{String(Math.floor(seg.start % 60)).padStart(2, "0")}
              </span>
              <div style={{ fontSize: 14, color: "#1E293B", lineHeight: 1.5, marginTop: 2 }}>{seg.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CALL_OUTCOMES = [
  { value: "connected", label: "Connected", bg: "#DCFCE7", color: "#166534" },
  { value: "voicemail", label: "Voicemail", bg: "#FEF9C3", color: "#854D0E" },
  { value: "no_answer", label: "No Answer", bg: "#FEE2E2", color: "#991B1B" },
  { value: "left_message", label: "Left Message", bg: "#DBEAFE", color: "#1E40AF" },
  { value: "wrong_number", label: "Wrong Number", bg: "#F3F4F6", color: "#374151" },
  { value: "busy", label: "Busy", bg: "#FFEDD5", color: "#9A3412" },
];

function OutcomeTagDropdown({ callId, currentOutcome }: { callId: string; currentOutcome: string | null }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const handleSelect = async (value: string | null) => {
    const token = await getToken();
    if (!token) return;
    try {
      await updateCallOutcome(token, callId, value);
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
    } catch (e) {
      console.error("Failed to update outcome:", e);
    }
    setOpen(false);
  };

  const current = CALL_OUTCOMES.find((o) => o.value === currentOutcome);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border"
        style={current
          ? { background: current.bg, color: current.color, borderColor: current.bg }
          : { background: "#F9FAFB", color: "#6B7280", borderColor: "#E5E7EB" }
        }
      >
        {current ? current.label : "Tag Outcome"}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {CALL_OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => handleSelect(o.value)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                o.value === currentOutcome ? "font-semibold" : ""
              }`}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: o.bg }} />
              {o.label}
            </button>
          ))}
          {currentOutcome && (
            <button
              onClick={() => handleSelect(null)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CallDetailPanel({ call }: { call: CallLog }) {
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4 mt-3">
      {/* Header: direction, status, duration, outcome */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={call.direction === "inbound"
              ? { background: "#DCFCE7", color: "#166534" }
              : { background: "#DBEAFE", color: "#1E40AF" }
            }
          >
            {call.direction === "inbound" ? "Inbound" : "Outbound"}
          </span>
          <span className="text-xs text-gray-500">{call.status}</span>
          {call.duration > 0 && (
            <span className="text-xs text-gray-500">{formatDuration(call.duration)}</span>
          )}
        </div>
        <OutcomeTagDropdown callId={call.id} currentOutcome={call.outcome} />
      </div>

      {/* AMD Badge */}
      {call.answered_by && call.answered_by.startsWith("machine") && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium"
          style={{ background: "#FEF9C3", color: "#854D0E", border: "1px solid #FDE68A" }}>
          <Bot className="w-3.5 h-3.5" />
          Voicemail Detected
        </div>
      )}

      {/* Recording Player */}
      {call.has_recording && (
        <div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Recording</div>
          <RecordingPlayer callId={call.id} />
        </div>
      )}

      {/* Transcript + AI Actions */}
      {(call.transcription_status === "completed" || call.transcription_status === "processing" || call.has_recording) && (
        <div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Transcript & AI Insights</div>
          <TranscriptSection callId={call.id} />
        </div>
      )}
    </div>
  );
}

function EmailHtmlFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const baseStyles = `
    <style>
      body { font-family: sans-serif; font-size: 14px; color: #374151; margin: 0; padding: 0; overflow-x: hidden; }
      img { max-width: 100%; height: auto; }
      * { max-width: 100%; box-sizing: border-box; }
    </style>
  `;

  const fullHtml = baseStyles + html;

  const adjustHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) {
        const newHeight = doc.body.scrollHeight;
        if (newHeight > 0) setHeight(newHeight);
      }
    } catch {
      // cross-origin fallback — keep current height
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(fullHtml);
        doc.close();
        // Adjust after content loads (images etc.)
        adjustHeight();
        const timer = setTimeout(adjustHeight, 500);
        return () => clearTimeout(timer);
      }
    } catch {
      // If contentDocument.write fails, srcdoc fallback handles it
    }
  }, [fullHtml, adjustHeight]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      srcDoc={fullHtml}
      onLoad={adjustHeight}
      style={{ width: "100%", height: `${height}px`, border: "none", display: "block" }}
      title="Email content"
    />
  );
}

export default function CommunicationPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<"all" | "call" | "email" | "gmail" | "sms" | "twilio_call">("all");
  const [search, setSearch] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [logType, setLogType] = useState<"call" | "email">("call");
  const [logContactId, setLogContactId] = useState("");
  const [logBody, setLogBody] = useState("");

  // Inline reply
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  // CC fields
  const [replyCc, setReplyCc] = useState("");
  const [composeCc, setComposeCc] = useState("");

  // SMS compose
  const [showSMSCompose, setShowSMSCompose] = useState(false);
  const [smsTo, setSmsTo] = useState("");
  const [smsBody, setSmsBody] = useState("");

  // Call initiate
  const [showCallModal, setShowCallModal] = useState(false);
  const [callTo, setCallTo] = useState("");

  // Track which thread items are expanded (by item id); most recent is expanded by default
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Cache of loaded full email bodies: emailId -> Email
  const emailCacheRef = useRef<Record<string, Email>>({});
  const [loadingEmail, setLoadingEmail] = useState(false);
  // Trigger re-render when cache updates
  const [cacheVersion, setCacheVersion] = useState(0);

  // Gmail status
  const { data: gmailStatusData } = useQuery({
    queryKey: ["gmail-status"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { connected: false, gmail_address: null, last_synced_at: null };
      return getGmailStatus(token);
    },
  });

  const gmailConnected = gmailStatusData?.connected ?? false;

  // SMS status
  const { data: smsStatusData } = useQuery({
    queryKey: ["sms-status"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { configured: false, phone_number: null, last_synced_at: null };
      return getSMSStatus(token);
    },
  });

  const smsConfigured = smsStatusData?.configured ?? false;

  // Auto-sync SMS on mount if configured and last sync > 5 min ago
  useEffect(() => {
    if (!smsConfigured) return;
    if (smsStatusData?.last_synced_at) {
      const elapsed = Date.now() - new Date(smsStatusData.last_synced_at).getTime();
      if (elapsed < 5 * 60 * 1000) return;
    }
    (async () => {
      const token = await getToken();
      if (token) {
        await syncSMS(token);
        queryClient.invalidateQueries({ queryKey: ["sms-messages"] });
        queryClient.invalidateQueries({ queryKey: ["sms-status"] });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smsConfigured]);

  // Auto-sync on mount if connected and last sync > 5 min ago
  useEffect(() => {
    if (!gmailConnected) return;
    if (gmailStatusData?.last_synced_at) {
      const elapsed = Date.now() - new Date(gmailStatusData.last_synced_at).getTime();
      if (elapsed < 5 * 60 * 1000) return;
    }
    (async () => {
      const token = await getToken();
      if (token) {
        await syncGmail(token);
        queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
        queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailConnected]);

  const { data: activitiesData } = useQuery({
    queryKey: ["comm-activities"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { activities: [], total: 0 };
      return listAllActivities(token, undefined, 100);
    },
    refetchInterval: 30000,
  });

  const { data: emailsData } = useQuery({
    queryKey: ["gmail-emails"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { emails: [], total: 0 };
      return listEmails(token, { limit: 100 });
    },
    enabled: gmailConnected,
    refetchInterval: 60000,
  });

  const { data: smsData } = useQuery({
    queryKey: ["sms-messages"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { messages: [], total: 0 };
      return listSMSMessages(token, { limit: 100 });
    },
    enabled: smsConfigured,
    refetchInterval: 30000,
  });

  const { data: callLogsData } = useQuery({
    queryKey: ["call-logs"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { calls: [], total: 0 };
      return listCallLogs(token, { limit: 100 });
    },
    enabled: true,
    refetchInterval: (query) => {
      const calls = (query.state.data as { calls: CallLog[] } | undefined)?.calls;
      const hasActiveCalls = calls?.some(
        (c) => ['initiated', 'ringing', 'in-progress'].includes(c.status)
      );
      return hasActiveCalls ? 5000 : 30000;
    },
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contacts-list"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { contacts: [], total: 0 };
      return listContacts(token, { limit: 200 });
    },
  });

  const contacts = contactsData?.contacts ?? [];
  const contactMap = useMemo(
    () => Object.fromEntries(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  const allItems = useMemo(() => {
    const items: CommItem[] = [];

    const activities = activitiesData?.activities ?? [];
    for (const a of activities) {
      if (a.type !== "call" && a.type !== "email") continue;
      const contact = a.contact_id ? contactMap[a.contact_id] : null;
      const name = a.contact_name || (contact ? `${contact.first_name} ${contact.last_name}` : "Unknown");
      items.push({
        id: a.id, type: a.type, contact_id: a.contact_id, contact_name: name,
        body: a.body || "No details", date: a.created_at,
        groupKey: a.contact_id || `manual-${a.id}`, groupName: name,
      });
    }

    const emails = emailsData?.emails ?? [];
    for (const e of emails) {
      const contact = e.contact_id ? contactMap[e.contact_id] : null;
      const isOut = e.is_outbound;
      const otherEmail = isOut ? (e.to_addresses?.[0] ?? "") : (e.from_address ?? "");
      const otherName = isOut ? (e.to_addresses?.[0] ?? "Unknown") : (e.from_name || e.from_address || "Unknown");

      let groupKey: string;
      let groupName: string;
      if (e.contact_id && contact) {
        groupKey = e.contact_id;
        groupName = `${contact.first_name} ${contact.last_name}`;
      } else if (e.contact_name) {
        groupKey = e.contact_id || `email-${otherEmail.toLowerCase()}`;
        groupName = e.contact_name;
      } else {
        groupKey = `email-${otherEmail.toLowerCase()}`;
        groupName = otherName;
      }

      items.push({
        id: `gmail-${e.id}`, type: isOut ? "gmail_out" : "gmail_in",
        contact_id: e.contact_id, contact_name: groupName,
        body: e.snippet || "No content", subject: e.subject || undefined,
        date: e.gmail_date || e.created_at,
        from_address: e.from_address ?? undefined, from_name: e.from_name ?? undefined,
        to_addresses: e.to_addresses, email_data: e, groupKey, groupName,
      });
    }

    // SMS messages
    const smsMessages = smsData?.messages ?? [];
    for (const s of smsMessages) {
      const contact = s.contact_id ? contactMap[s.contact_id] : null;
      const isOut = s.direction === "outbound";
      const otherNumber = isOut ? s.to_number : s.from_number;

      let groupKey: string;
      let groupName: string;
      if (s.contact_id && contact) {
        groupKey = s.contact_id;
        groupName = `${contact.first_name} ${contact.last_name}`;
      } else if (s.contact_name) {
        groupKey = s.contact_id || `sms-${otherNumber}`;
        groupName = s.contact_name;
      } else {
        groupKey = `sms-${otherNumber}`;
        groupName = otherNumber;
      }

      items.push({
        id: `sms-${s.id}`, type: isOut ? "sms_out" : "sms_in",
        contact_id: s.contact_id, contact_name: groupName,
        body: s.body, date: s.sent_at,
        sms_data: s, groupKey, groupName,
      });
    }

    // Twilio call logs
    const callLogs = callLogsData?.calls ?? [];
    for (const cl of callLogs) {
      const contact = cl.contact_id ? contactMap[cl.contact_id] : null;
      const isOut = cl.direction === "outbound";
      const otherNumber = isOut ? cl.to_number : cl.from_number;

      let groupKey: string;
      let groupName: string;
      if (cl.contact_id && contact) {
        groupKey = cl.contact_id;
        groupName = `${contact.first_name} ${contact.last_name}`;
      } else if (cl.contact_name) {
        groupKey = cl.contact_id || `call-${otherNumber}`;
        groupName = cl.contact_name;
      } else {
        groupKey = `call-${otherNumber}`;
        groupName = otherNumber;
      }

      const durationStr = cl.duration > 0 ? ` (${Math.floor(cl.duration / 60)}m ${cl.duration % 60}s)` : "";
      items.push({
        id: `tcall-${cl.id}`, type: isOut ? "twilio_call_out" : "twilio_call_in",
        contact_id: cl.contact_id, contact_name: groupName,
        body: `${isOut ? "Outbound" : "Inbound"} call — ${cl.status}${durationStr}`,
        date: cl.started_at,
        call_data: cl, groupKey, groupName,
      });
    }

    return items;
  }, [activitiesData, emailsData, smsData, callLogsData, contactMap]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (filter === "call") return item.type === "call";
      if (filter === "email") return item.type === "email";
      if (filter === "gmail") return item.type === "gmail_in" || item.type === "gmail_out";
      if (filter === "sms") return item.type === "sms_in" || item.type === "sms_out";
      if (filter === "twilio_call") return item.type === "twilio_call_in" || item.type === "twilio_call_out";
      return true;
    });
  }, [allItems, filter]);

  const threads = useMemo(() => {
    const groups: Record<string, CommItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.groupKey]) groups[item.groupKey] = [];
      groups[item.groupKey].push(item);
    }
    return Object.entries(groups)
      .map(([key, items]) => {
        const sorted = items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { groupKey: key, groupName: sorted[0]?.groupName || "Unknown", contactId: sorted[0]?.contact_id, items: sorted, lastDate: sorted[0]?.date ?? "" };
      })
      .filter((t) => {
        if (!search) return true;
        const q = search.toLowerCase();
        if (t.groupName.toLowerCase().includes(q)) return true;
        return t.items.some(
          (item) =>
            (item.subject && item.subject.toLowerCase().includes(q)) ||
            item.body.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [filteredItems, search]);

  const selectedThread = threads.find((t) => t.groupKey === selectedGroupKey);
  const selectedContact = selectedThread?.contactId ? contactMap[selectedThread.contactId] : null;
  const currentItem = selectedThread?.items[currentIndex] ?? null;
  const totalItems = selectedThread?.items.length ?? 0;

  // Load full email bodies for ALL gmail items in the selected thread
  useEffect(() => {
    setShowReply(false);
    setReplyBody("");
    setReplyCc("");

    if (!selectedThread) return;

    // Expand the most recent item (index 0) by default, collapse others
    setExpandedItems(new Set(selectedThread.items.length > 0 ? [selectedThread.items[0].id] : []));

    const gmailItems = selectedThread.items.filter((item) => item.email_data);
    if (gmailItems.length === 0) return;

    // Mark unread items as read (fire-and-forget)
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        for (const item of gmailItems) {
          if (item.email_data && !item.email_data.is_read) {
            markEmailRead(token, item.email_data.id);
          }
        }
        queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      } catch { /* ignore */ }
    })();

    // Load full bodies for uncached emails
    const uncached = gmailItems.filter((item) => item.email_data && !emailCacheRef.current[item.email_data.id]);
    if (uncached.length === 0) return;

    let cancelled = false;
    setLoadingEmail(true);
    (async () => {
      try {
        const token = await getToken();
        if (token && !cancelled) {
          for (const item of uncached) {
            if (cancelled) break;
            if (!item.email_data) continue;
            const full = await getEmail(token, item.email_data.id);
            if (!cancelled) {
              emailCacheRef.current[item.email_data.id] = full;
              setCacheVersion((v) => v + 1);
            }
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoadingEmail(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupKey]);

  function selectThread(groupKey: string) {
    setSelectedGroupKey(groupKey);
    setCurrentIndex(0);
    setShowReply(false);
    setReplyBody("");
  }


  const logMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token || !logContactId) return;
      return createActivity(token, logContactId, { type: logType, body: logBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comm-activities"] });
      setShowLog(false);
      setLogBody("");
      setLogContactId("");
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!currentItem?.email_data) throw new Error("No email");
      const token = await getToken();
      if (!token) throw new Error("No token");
      const e = currentItem.email_data;
      const to = e.is_outbound ? (e.to_addresses?.[0] ?? "") : (e.from_address ?? "");
      const subject = e.subject ? (e.subject.startsWith("Re: ") ? e.subject : `Re: ${e.subject}`) : "";
      return sendEmail(token, { to, cc: replyCc || undefined, subject, body: replyBody, contact_id: e.contact_id || undefined, reply_to_message_id: e.gmail_message_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      setShowReply(false);
      setReplyBody("");
    },
  });

  const composeMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return sendEmail(token, { to: composeTo, cc: composeCc || undefined, subject: composeSubject, body: composeBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      setShowCompose(false);
      setComposeTo("");
      setComposeCc("");
      setComposeSubject("");
      setComposeBody("");
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return syncGmail(token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
    },
  });

  const callInitiateMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      const contactMatch = contacts.find((c) => c.phone && c.phone.replace(/\D/g, "").slice(-10) === callTo.replace(/\D/g, "").slice(-10));
      return initiateCall(token, { to: callTo, contact_id: contactMatch?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
      queryClient.invalidateQueries({ queryKey: ["comm-activities"] });
      setShowCallModal(false);
      setCallTo("");
    },
  });

  const smsSendMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      const contactMatch = contacts.find((c) => c.phone && c.phone.replace(/\D/g, "").slice(-10) === smsTo.replace(/\D/g, "").slice(-10));
      return sendSMS(token, { to: smsTo, body: smsBody, contact_id: contactMatch?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms-messages"] });
      setShowSMSCompose(false);
      setSmsTo("");
      setSmsBody("");
    },
  });

  function getItemColors(type: CommItem["type"]) {
    if (type === "call") return typeColors.call;
    if (type === "gmail_in" || type === "gmail_out") return typeColors.gmail;
    if (type === "sms_in" || type === "sms_out") return typeColors.sms;
    if (type === "twilio_call_in" || type === "twilio_call_out") return typeColors.twilio_call;
    return typeColors.email;
  }

  function getItemLabel(type: CommItem["type"]) {
    if (type === "call") return "Call";
    if (type === "email") return "Email";
    if (type === "gmail_in") return "Received";
    if (type === "gmail_out") return "Sent";
    if (type === "sms_in") return "SMS In";
    if (type === "sms_out") return "SMS Out";
    if (type === "twilio_call_in") return "Incoming";
    if (type === "twilio_call_out") return "Outgoing";
    return "Email";
  }

  // Force re-render when email cache updates
  void cacheVersion;

  // Thread-level navigation: one entry per thread
  const flatItems = useMemo(() => {
    return threads.map((t) => ({ groupKey: t.groupKey, index: 0 }));
  }, [threads]);

  const currentFlatIndex = useMemo(() => {
    if (!selectedGroupKey) return -1;
    return flatItems.findIndex((f) => f.groupKey === selectedGroupKey);
  }, [flatItems, selectedGroupKey]);

  function goNewer() {
    if (currentFlatIndex <= 0) return;
    const prev = flatItems[currentFlatIndex - 1];
    setSelectedGroupKey(prev.groupKey);
    setCurrentIndex(0);
  }

  function goOlder() {
    if (currentFlatIndex < 0 || currentFlatIndex >= flatItems.length - 1) return;
    const next = flatItems[currentFlatIndex + 1];
    setSelectedGroupKey(next.groupKey);
    setCurrentIndex(0);
  }

  function toggleExpanded(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          goOlder();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          goNewer();
          break;
        case "r":
          e.preventDefault();
          setShowReply(true);
          break;
        case "c":
          e.preventDefault();
          setShowCompose(true);
          break;
        case "Escape":
          setShowReply(false);
          setShowCompose(false);
          setShowLog(false);
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFlatIndex, flatItems]);

  // Auto-scroll selected thread into view
  useEffect(() => {
    if (!selectedGroupKey || !sidebarRef.current) return;
    const el = sidebarRef.current.querySelector(`[data-group-key="${CSS.escape(selectedGroupKey)}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedGroupKey]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left sidebar */}
      <div className="w-80 border-r border-gray-100 bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Communication</h2>
            <div className="flex items-center gap-1">
              {gmailConnected && (
                <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors" title="Sync Gmail">
                  <RefreshCw size={14} className={syncMutation.isPending ? "animate-spin" : ""} />
                </button>
              )}
              {gmailConnected && (
                <button onClick={() => setShowCompose(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#EA4335]/10 text-[#EA4335] hover:bg-[#EA4335]/20 transition-colors" title="Compose Email">
                  <Send size={14} />
                </button>
              )}
              {smsConfigured && (
                <button onClick={() => setShowCallModal(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#7C3AED]/10 text-[#7C3AED] hover:bg-[#7C3AED]/20 transition-colors" title="Initiate Call">
                  <PhoneCall size={14} />
                </button>
              )}
              {smsConfigured && (
                <button onClick={() => setShowSMSCompose(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#F22F46]/10 text-[#F22F46] hover:bg-[#F22F46]/20 transition-colors" title="New SMS">
                  <MessageSquare size={14} />
                </button>
              )}
              <button onClick={() => setShowLog(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20 transition-colors">
                <Plus size={16} />
              </button>
            </div>
          </div>

          {gmailConnected && gmailStatusData?.last_synced_at && (
            <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-green-50 text-green-700">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-medium">Gmail synced {timeAgo(gmailStatusData.last_synced_at)}</span>
            </div>
          )}

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
          </div>

          <div className="flex gap-1">
            {(["all", "call", "email", ...(gmailConnected ? ["gmail" as const] : []), ...(smsConfigured ? ["sms" as const] : []), ...(smsConfigured ? ["twilio_call" as const] : [])] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f as typeof filter)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f ? "bg-[#0EA5E9]/10 text-[#0EA5E9]" : "text-gray-400 hover:text-gray-600"}`}>
                {f === "all" ? "All" : f === "call" ? "Logged" : f === "email" ? "Manual" : f === "gmail" ? "Gmail" : f === "sms" ? "SMS" : "Calls"}
              </button>
            ))}
          </div>
        </div>

        <div ref={sidebarRef} className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="p-8 text-center">
              <Mail size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No communications yet</p>
              <p className="text-xs text-gray-300 mt-1">{gmailConnected ? "Sync Gmail or log a call/email" : "Log a call or email to get started"}</p>
            </div>
          ) : (
            threads.map((thread) => {
              const isSelected = thread.groupKey === selectedGroupKey;
              const lastItem = thread.items[0];
              const isEmailGroup = thread.groupKey.startsWith("email-");
              const hasUnread = thread.items.some((item) => item.email_data && !item.email_data.is_read);
              const initials = isEmailGroup
                ? (thread.groupName[0] ?? "?").toUpperCase()
                : thread.groupName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
              const colors = getItemColors(lastItem.type);
              const Icon = (lastItem.type === "twilio_call_in" || lastItem.type === "twilio_call_out") ? PhoneCall : lastItem.type === "call" ? Phone : Mail;
              return (
                <button key={thread.groupKey} data-group-key={thread.groupKey} onClick={() => selectThread(thread.groupKey)}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors border-b border-gray-50 ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  {hasUnread && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-4" />}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                    style={{ backgroundColor: isEmailGroup ? "#6B7280" : "#1E3A5F" }}>
                    {initials || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm text-gray-800 truncate ${hasUnread ? "font-bold" : "font-medium"}`}>{thread.groupName}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {lastItem.email_data?.labels && emailIsStarred(lastItem.email_data.labels) && (
                          <Star size={11} className="text-amber-400 fill-amber-400" />
                        )}
                        {lastItem.email_data?.labels && emailHasAttachment(lastItem.email_data.labels) && (
                          <Paperclip size={11} className="text-gray-400" />
                        )}
                        <span className="text-[10px] text-gray-400">{timeAgo(thread.lastDate)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Icon size={11} style={{ color: colors.color }} className="shrink-0" />
                      <p className="text-xs text-gray-500 truncate">{lastItem.subject || lastItem.body}</p>
                    </div>
                    <span className="text-[10px] text-gray-300">{thread.items.length} item{thread.items.length !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Center — full email view with arrow nav */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {selectedThread && currentItem ? (
          <>
            {/* Header bar with nav arrows */}
            <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-800 truncate">
                  {selectedThread.groupName}{totalItems > 1 ? ` — ${totalItems} ${totalItems === 1 ? "item" : "items"}` : ""}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                {/* Nav arrows */}
                <button onClick={goNewer} disabled={currentFlatIndex <= 0}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-default"
                  title="Newer">
                  <ChevronUp size={16} className="text-gray-500" />
                </button>
                <button onClick={goOlder} disabled={currentFlatIndex < 0 || currentFlatIndex >= flatItems.length - 1}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-default"
                  title="Older">
                  <ChevronDown size={16} className="text-gray-500" />
                </button>

                <div className="w-px h-6 bg-gray-200 mx-1" />

                {gmailConnected && (
                  <button onClick={() => {
                    const lastGmail = selectedThread.items.find((i) => i.email_data);
                    if (lastGmail?.email_data) {
                      const e = lastGmail.email_data;
                      setComposeTo(e.is_outbound ? (e.to_addresses?.[0] ?? "") : (e.from_address ?? ""));
                    } else if (selectedContact?.email) {
                      setComposeTo(selectedContact.email);
                    }
                    setShowCompose(true);
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#EA4335]/10 text-[#EA4335] hover:bg-[#EA4335]/20 transition-colors">
                    <Send size={12} /> Email
                  </button>
                )}
                <button onClick={() => { setShowLog(true); if (selectedThread.contactId) setLogContactId(selectedThread.contactId); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20 transition-colors">
                  <Plus size={14} /> Log
                </button>
              </div>
            </div>

            {/* Thread conversation view — all items inline */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto flex flex-col gap-3">
                {selectedThread.items.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const itemIsGmail = item.type === "gmail_in" || item.type === "gmail_out";
                  const itemFullBody = item.email_data ? emailCacheRef.current[item.email_data.id] : null;

                  return (
                    <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100">
                      {/* Clickable header — always visible */}
                      <button
                        onClick={() => toggleExpanded(item.id)}
                        className={`w-full px-6 pt-5 pb-4 text-left flex items-start gap-3 hover:bg-gray-50/50 transition-colors ${isExpanded ? "rounded-t-xl" : "rounded-xl"}`}
                      >
                        <div className="mt-0.5 shrink-0 text-gray-400 transition-transform duration-150" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                          <ChevronRight size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                                style={{ backgroundColor: getItemColors(item.type).bg, color: getItemColors(item.type).color }}>
                                {getItemLabel(item.type)}
                              </span>
                              {itemIsGmail && (
                                <span className="text-xs text-gray-500 truncate">
                                  {item.type === "gmail_out"
                                    ? `To: ${item.to_addresses?.join(", ") ?? ""}`
                                    : `From: ${item.from_name || item.from_address || ""}`}
                                </span>
                              )}
                              {itemIsGmail && item.email_data?.labels && emailIsStarred(item.email_data.labels) && (
                                <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0" />
                              )}
                              {itemIsGmail && item.email_data?.labels && emailHasAttachment(item.email_data.labels) && (
                                <Paperclip size={12} className="text-gray-400 shrink-0" />
                              )}
                            </div>
                            <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDate(item.date)}</span>
                          </div>
                          {item.subject && (
                            <h4 className="text-sm font-semibold text-gray-800 truncate">{item.subject}</h4>
                          )}
                          {!isExpanded && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{item.body}</p>
                          )}
                          {!isExpanded && itemIsGmail && item.email_data?.labels && getUserLabels(item.email_data.labels).length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {getUserLabels(item.email_data.labels).map((label) => (
                                <span key={label} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Collapsible body */}
                      {isExpanded && (
                        <div className="px-6 py-5 border-t border-gray-100">
                          {itemIsGmail && item.email_data?.labels && (
                            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                              {emailHasAttachment(item.email_data.labels) && (
                                <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                                  <Paperclip size={10} /> Attachment
                                </span>
                              )}
                              {getUserLabels(item.email_data.labels).map((label) => (
                                <span key={label} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                          {itemIsGmail && loadingEmail && !itemFullBody ? (
                            <p className="text-sm text-gray-400">Loading...</p>
                          ) : itemIsGmail && itemFullBody?.body_html ? (
                            <EmailHtmlFrame html={itemFullBody.body_html} />
                          ) : itemIsGmail && itemFullBody?.body_text ? (
                            <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
                              {itemFullBody.body_text}
                            </pre>
                          ) : (
                            <p className="text-sm text-gray-700 leading-relaxed">{item.body}</p>
                          )}
                          {item.call_data && (
                            <CallDetailPanel call={item.call_data} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Inline reply for threads with gmail items */}
                {selectedThread.items.some((i) => i.type === "gmail_in" || i.type === "gmail_out") && (
                  <div>
                    {showReply ? (
                      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-xs text-gray-400 mb-2">
                          Replying to {(() => {
                            const lastGmail = selectedThread.items.find((i) => i.email_data);
                            if (!lastGmail) return "...";
                            return lastGmail.type === "gmail_out"
                              ? lastGmail.to_addresses?.[0]
                              : (lastGmail.from_name || lastGmail.from_address);
                          })()}
                        </p>
                        <input value={replyCc} onChange={(e) => setReplyCc(e.target.value)} placeholder="Cc (optional)"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:border-[#0EA5E9] bg-gray-50 mb-2" />
                        <textarea ref={replyRef} value={replyBody} onChange={(e) => setReplyBody(e.target.value)}
                          placeholder="Write your reply..." rows={4}
                          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 resize-none" />
                        <div className="flex items-center justify-between mt-3">
                          <button onClick={() => { setShowReply(false); setReplyBody(""); }}
                            className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          <button onClick={() => replyMutation.mutate()}
                            disabled={!replyBody.trim() || replyMutation.isPending}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                            style={{ backgroundColor: "#0EA5E9" }}>
                            <Send size={12} />
                            {replyMutation.isPending ? "Sending..." : "Send"}
                          </button>
                        </div>
                        {replyMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to send. Try again.</p>}
                      </div>
                    ) : (
                      <button onClick={() => { setShowReply(true); setTimeout(() => replyRef.current?.focus(), 100); }}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-200 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors w-full">
                        <Reply size={14} /> Reply
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Mail size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 text-sm font-medium">Select a conversation</p>
              <p className="text-gray-300 text-xs mt-1">Choose a contact to view their communication history</p>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — contact details */}
      {selectedContact && (
        <div className="w-72 border-l border-gray-100 bg-white p-5 shrink-0">
          <div className="text-center mb-5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-3" style={{ backgroundColor: "#1E3A5F" }}>
              {`${selectedContact.first_name[0]}${selectedContact.last_name[0]}`.toUpperCase()}
            </div>
            <p className="text-sm font-bold text-gray-800">{selectedContact.first_name} {selectedContact.last_name}</p>
            {selectedContact.source && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 mt-1 inline-block">{selectedContact.source}</span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {selectedContact.email && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Email</p>
                <p className="text-sm text-gray-700">{selectedContact.email}</p>
              </div>
            )}
            {selectedContact.phone && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Phone</p>
                <p className="text-sm text-gray-700">{selectedContact.phone}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Added</p>
              <p className="text-sm text-gray-700">
                {new Date(selectedContact.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Log modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">Log Communication</h3>
              <button onClick={() => setShowLog(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setLogType("call")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${logType === "call" ? "bg-[#0EA5E9]/10 text-[#0EA5E9] border border-[#0EA5E9]/30" : "bg-gray-50 text-gray-400 border border-gray-200"}`}>
                <Phone size={14} /> Call
              </button>
              <button onClick={() => setLogType("email")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${logType === "email" ? "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30" : "bg-gray-50 text-gray-400 border border-gray-200"}`}>
                <Mail size={14} /> Email
              </button>
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Contact</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select value={logContactId} onChange={(e) => setLogContactId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 appearance-none">
                  <option value="">Select contact...</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Details</label>
              <textarea value={logBody} onChange={(e) => setLogBody(e.target.value)}
                placeholder={logType === "call" ? "Call notes..." : "Email summary..."} rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 resize-none" />
            </div>
            <button onClick={() => logMutation.mutate()} disabled={!logContactId || !logBody || logMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: "#0EA5E9" }}>
              {logMutation.isPending ? "Saving..." : `Log ${logType === "call" ? "Call" : "Email"}`}
            </button>
          </div>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">New Email</h3>
              <button onClick={() => setShowCompose(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-4 mb-5">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">To</label>
                <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="recipient@email.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Cc</label>
                <input value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder="cc@email.com (optional)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Subject</label>
                <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Email subject"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Message</label>
                <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="Write your email..." rows={6}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 resize-none" />
              </div>
            </div>
            <button onClick={() => composeMutation.mutate()}
              disabled={!composeTo || !composeSubject || !composeBody || composeMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#EA4335" }}>
              <Send size={14} /> {composeMutation.isPending ? "Sending..." : "Send Email"}
            </button>
            {composeMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to send. Try again.</p>}
          </div>
        </div>
      )}

      {/* Call Initiate modal */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">Initiate Call</h3>
              <button onClick={() => setShowCallModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-4 mb-5">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Phone Number</label>
                <input value={callTo} onChange={(e) => setCallTo(e.target.value)} placeholder="+15551234567"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#7C3AED] bg-gray-50" />
              </div>
              <p className="text-xs text-gray-400">This will initiate an outbound call via Twilio using your configured phone number.</p>
            </div>
            <button onClick={() => callInitiateMutation.mutate()}
              disabled={!callTo || callInitiateMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#7C3AED" }}>
              <PhoneCall size={14} /> {callInitiateMutation.isPending ? "Calling..." : "Start Call"}
            </button>
            {callInitiateMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to initiate call. Try again.</p>}
          </div>
        </div>
      )}

      {/* SMS Compose modal */}
      {showSMSCompose && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">New SMS</h3>
              <button onClick={() => setShowSMSCompose(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-4 mb-5">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">To (Phone Number)</label>
                <input value={smsTo} onChange={(e) => setSmsTo(e.target.value)} placeholder="+15551234567"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#F22F46] bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Message</label>
                <textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Type your message..." rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#F22F46] bg-gray-50 resize-none" />
              </div>
            </div>
            <button onClick={() => smsSendMutation.mutate()}
              disabled={!smsTo || !smsBody || smsSendMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#F22F46" }}>
              <MessageSquare size={14} /> {smsSendMutation.isPending ? "Sending..." : "Send SMS"}
            </button>
            {smsSendMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to send. Try again.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
