"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { CheckCircle2, XCircle, Loader2, Circle, AlertTriangle } from "lucide-react";
import { useSSEStream } from "@/hooks/useSSEStream";
import { toolLabel } from "@/lib/ai-chat-helpers";

interface WorkflowStep {
  name: string;
  status: "pending" | "running" | "done" | "failed";
  result?: string;
}

interface WorkflowStatusProps {
  workflowId: string;
  workflowName: string;
  isDryRun?: boolean;
  onComplete?: (success: boolean) => void;
  onClose?: () => void;
}

export default function WorkflowStatus({
  workflowId,
  workflowName,
  isDryRun = false,
  onComplete,
  onClose,
}: WorkflowStatusProps) {
  const { getToken } = useAuth();
  const { isStreaming, startStream, stopStream } = useSSEStream();
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<"running" | "completed" | "failed">("running");
  const [started, setStarted] = useState(false);

  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    const token = await getToken();
    if (!token) return;

    const url = isDryRun
      ? `/api/workflows/${workflowId}/dry-run`
      : `/api/workflows/${workflowId}/run`;

    startStream(token, url, { trigger_data: null }, {
      onText: (accumulated) => {
        setFinalMessage(accumulated);
      },
      onToolCall: (name) => {
        setSteps((prev) => {
          // If already exists as running, skip
          if (prev.some((s) => s.name === name && s.status === "running")) return prev;
          // Mark any previous running step as done
          const updated = prev.map((s) =>
            s.status === "running" ? { ...s, status: "done" as const } : s
          );
          return [...updated, { name, status: "running" as const }];
        });
      },
      onToolResult: (name) => {
        setSteps((prev) =>
          prev.map((s) => (s.name === name && s.status === "running" ? { ...s, status: "done" } : s))
        );
      },
      onConfirmation: () => {
        // Workflow runs use auto-approval, but handle gracefully
      },
      onDone: () => {
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "done" } : s))
        );
        setRunStatus("completed");
        onComplete?.(true);
      },
      onError: (err) => {
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "failed" } : s))
        );
        setFinalMessage(err.message);
        setRunStatus("failed");
        onComplete?.(false);
      },
    });
  }, [workflowId, isDryRun, getToken, startStream, onComplete, started]);

  useEffect(() => {
    begin();
    return () => stopStream();
  }, [begin, stopStream]);

  const stepIcon = (status: WorkflowStep["status"]) => {
    switch (status) {
      case "done":
        return <CheckCircle2 size={14} className="text-green-500 shrink-0" />;
      case "running":
        return <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />;
      case "failed":
        return <XCircle size={14} className="text-red-500 shrink-0" />;
      default:
        return <Circle size={14} className="text-gray-300 shrink-0" />;
    }
  };

  const statusColors = {
    running: { border: "border-blue-200", bg: "bg-blue-50/50", icon: "text-blue-600", label: "Running" },
    completed: { border: "border-green-200", bg: "bg-green-50/50", icon: "text-green-600", label: "Completed" },
    failed: { border: "border-red-200", bg: "bg-red-50/50", icon: "text-red-600", label: "Failed" },
  };

  const colors = statusColors[runStatus];

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {runStatus === "running" ? (
            <Loader2 size={16} className="text-blue-500 animate-spin" />
          ) : runStatus === "completed" ? (
            <CheckCircle2 size={16} className="text-green-500" />
          ) : (
            <AlertTriangle size={16} className="text-red-500" />
          )}
          <span className="text-sm font-semibold text-gray-800">
            {isDryRun ? "Dry Run" : "Running"}: &ldquo;{workflowName}&rdquo;
          </span>
        </div>
        {!isStreaming && onClose && (
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              {stepIcon(step.status)}
              <span className="text-xs text-gray-600">
                {toolLabel[step.name] ?? step.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Final message */}
      {finalMessage && !isStreaming && (
        <p className={`text-xs mt-2 ${runStatus === "failed" ? "text-red-600" : "text-gray-500"}`}>
          {finalMessage.length > 200 ? finalMessage.slice(0, 200) + "…" : finalMessage}
        </p>
      )}
    </div>
  );
}
