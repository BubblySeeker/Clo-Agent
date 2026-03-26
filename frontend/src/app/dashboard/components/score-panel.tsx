"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/ui-store";
import { getLeadScoreExplanation } from "@/lib/api/contacts";
import { ScoreBadge } from "./score-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { MessageSquare } from "lucide-react";

interface ScorePanelProps {
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    lead_score: number;
    lead_score_signals: Record<string, any> | null;
    previous_lead_score: number | null;
  } | null;
}

function getTierLabel(score: number): string {
  if (score >= 80) return "Hot";
  if (score >= 50) return "Warm";
  if (score >= 20) return "Cool";
  return "Cold";
}

function getSuggestedAction(score: number, name: string): string {
  if (score >= 80) return `Schedule a showing or meeting with ${name} — they're ready to move`;
  if (score >= 50) return `Follow up with ${name} to keep momentum going`;
  if (score >= 20) return `Re-engage ${name} with a check-in or new listings`;
  return `Reach out to ${name} — they may be losing interest`;
}

const DIMENSION_CONFIG = [
  { key: "engagement", label: "Engagement", max: 30, color: "#22C55E" },
  { key: "readiness", label: "Readiness", max: 30, color: "#0EA5E9" },
  { key: "velocity", label: "Velocity", max: 20, color: "#8B5CF6" },
  { key: "profile", label: "Profile", max: 20, color: "#F59E0B" },
] as const;

export function ScorePanel({ contact }: ScorePanelProps) {
  const { getToken } = useAuth();
  const router = useRouter();
  const scorePanelOpen = useUIStore((s) => s.scorePanelOpen);
  const scorePanelContactId = useUIStore((s) => s.scorePanelContactId);
  const closeScorePanel = useUIStore((s) => s.closeScorePanel);
  const setChatOpen = useUIStore((s) => s.setChatOpen);

  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState(false);

  // Fetch AI explanation when panel opens
  useEffect(() => {
    if (!scorePanelOpen || !scorePanelContactId) {
      setExplanation(null);
      setExplanationError(false);
      return;
    }

    let cancelled = false;
    setExplanationLoading(true);
    setExplanationError(false);
    setExplanation(null);

    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const result = await getLeadScoreExplanation(token, scorePanelContactId);
        if (!cancelled) setExplanation(result);
      } catch {
        if (!cancelled) setExplanationError(true);
      } finally {
        if (!cancelled) setExplanationLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [scorePanelOpen, scorePanelContactId, getToken]);

  if (!contact || contact.id !== scorePanelContactId) return null;

  const signals = contact.lead_score_signals;
  const tier = getTierLabel(contact.lead_score);
  const contactName = `${contact.first_name} ${contact.last_name}`;
  const suggestedAction = getSuggestedAction(contact.lead_score, contact.first_name);

  return (
    <Sheet open={scorePanelOpen} onOpenChange={(open) => { if (!open) closeScorePanel(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[400px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-3">
            <ScoreBadge score={contact.lead_score} previousScore={contact.previous_lead_score} />
            <span>{contactName}</span>
          </SheetTitle>
          <SheetDescription>
            {tier} Lead — Score {contact.lead_score}/100
          </SheetDescription>
        </SheetHeader>

        {/* Dimension Breakdown */}
        <div className="space-y-4 mt-2">
          <h3 className="text-sm font-semibold text-gray-700">Score Breakdown</h3>
          {DIMENSION_CONFIG.map((dim) => {
            const value = signals?.[dim.key] ?? 0;
            const pct = Math.round((value / dim.max) * 100);
            return (
              <div key={dim.key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-600">{dim.label}</span>
                  <span className="text-gray-500">{value}/{dim.max}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: dim.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Top Signals */}
        {signals?.top_signals && signals.top_signals.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Key Signals</h3>
            <ul className="space-y-1.5">
              {(signals.top_signals as string[]).map((signal, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-gray-400 mt-0.5 shrink-0">&#8226;</span>
                  {signal}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Explanation */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">AI Analysis</h3>
          {explanationLoading && (
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-full" />
              <div className="h-3 bg-gray-200 rounded animate-pulse w-4/5" />
              <div className="h-3 bg-gray-200 rounded animate-pulse w-3/5" />
            </div>
          )}
          {explanationError && (
            <p className="text-sm text-gray-400 italic">AI analysis temporarily unavailable.</p>
          )}
          {explanation && (
            <p className="text-sm text-gray-600 leading-relaxed">{explanation}</p>
          )}
        </div>

        {/* Suggested Action */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Suggested Action</h3>
          <button
            onClick={() => {
              closeScorePanel();
              router.push(`/dashboard/contacts/${contact.id}`);
              // Small delay to let navigation start, then open chat
              setTimeout(() => setChatOpen(true), 300);
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm font-medium rounded-lg transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {suggestedAction}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
