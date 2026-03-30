"use client";

import { useState, useCallback } from "react";
import {
  Save, Play, FlaskConical, ArrowLeft, Zap, Power, PowerOff, Trash2, Bot,
} from "lucide-react";
import type { WorkflowGraph, NodeTemplate } from "./types";
import type { ContactOption } from "../ContactChipInput";
import { graphToInstruction, graphToTriggerType, graphToTriggerConfig, generateWorkflowName } from "./graphUtils";
import NodePalette from "./NodePalette";
import WorkflowCanvas from "./WorkflowCanvas";
import NodeDetailPanel from "./NodeDetailPanel";
import BuilderAIChat from "./BuilderAIChat";

interface WorkflowBuilderProps {
  /** Null for new workflow, populated for editing */
  initialGraph?: WorkflowGraph;
  initialName?: string;
  initialApprovalMode?: "review" | "auto";
  workflowId?: string | null;
  onSave: (data: {
    name: string;
    instruction: string;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    approval_mode: "review" | "auto";
    steps: Array<{ type: string; config: Record<string, string> }>;
  }) => Promise<void>;
  onRun?: () => void;
  onDryRun?: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
  onBack: () => void;
  onWorkflowSaved?: (workflowId?: string) => void;
  isSaving?: boolean;
  enabled?: boolean;
  contacts?: ContactOption[];
}

export default function WorkflowBuilder({
  initialGraph,
  initialName,
  initialApprovalMode = "review",
  workflowId,
  onSave,
  onRun,
  onDryRun,
  onToggle,
  onDelete,
  onBack,
  onWorkflowSaved,
  isSaving,
  enabled = true,
  contacts = [],
}: WorkflowBuilderProps) {
  const [graph, setGraph] = useState<WorkflowGraph>(
    initialGraph ?? { nodes: [], edges: [] }
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(initialName ?? "");
  const [approvalMode, setApprovalMode] = useState<"review" | "auto">(initialApprovalMode);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);

  // Detail panel state
  const [detailPanel, setDetailPanel] = useState<{
    nodeId: string;
    fieldKey: string;
    fieldLabel: string;
  } | null>(null);

  const handleGraphChange = useCallback((newGraph: WorkflowGraph) => {
    setGraph(newGraph);
    setHasChanges(true);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDragTemplate = useCallback((_t: NodeTemplate) => {}, []);

  const handleOpenDetail = useCallback((nodeId: string, fieldKey: string, fieldLabel: string) => {
    setDetailPanel({ nodeId, fieldKey, fieldLabel });
  }, []);

  const handleDetailSave = useCallback((value: string) => {
    if (!detailPanel) return;
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === detailPanel.nodeId
          ? { ...n, config: { ...n.config, [detailPanel.fieldKey]: value } }
          : n
      ),
    }));
    setHasChanges(true);
  }, [detailPanel]);

  const handleSave = async () => {
    const instruction = graphToInstruction(graph);
    const triggerType = graphToTriggerType(graph);
    const triggerConfig = graphToTriggerConfig(graph);

    const actions = graph.nodes.filter((n) => n.kind === "action" || n.kind === "condition");
    const steps = actions.map((n) => ({ type: n.type, config: n.config }));

    const workflowName = name.trim() || generateWorkflowName(graph);

    await onSave({
      name: workflowName,
      instruction,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      approval_mode: approvalMode,
      steps,
    });
    setHasChanges(false);
    if (!name.trim()) setName(workflowName);
  };

  const handleAIWorkflowSaved = useCallback((savedWorkflowId?: string) => {
    onWorkflowSaved?.(savedWorkflowId);
  }, [onWorkflowSaved]);

  const detailNode = detailPanel ? graph.nodes.find((n) => n.id === detailPanel.nodeId) : null;

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 100px)" }}>
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0B0F19] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={16} className="text-white/60" />
          </button>
          <Zap size={16} className="text-amber-400" />
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setHasChanges(true); }}
            placeholder="Workflow name..."
            className="text-sm font-semibold text-white bg-transparent outline-none placeholder-white/30 min-w-[200px]"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* AI Assistant toggle */}
          <button
            onClick={() => setShowAIChat(!showAIChat)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              showAIChat
                ? "bg-gradient-to-r from-purple-500/20 to-sky-500/20 text-purple-400 border border-purple-500/30"
                : "text-white/50 hover:bg-white/5 border border-transparent"
            }`}
          >
            <Bot size={12} />
            AI Assistant
          </button>

          <div className="w-px h-5 bg-white/10" />

          <button
            onClick={() => {
              setApprovalMode(approvalMode === "review" ? "auto" : "review");
              setHasChanges(true);
            }}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              approvalMode === "auto"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            }`}
          >
            {approvalMode === "auto" ? "Auto-approve" : "Review first"}
          </button>

          {workflowId && (
            <>
              <button
                onClick={onDryRun}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-colors"
              >
                <FlaskConical size={12} /> Test
              </button>
              <button
                onClick={onRun}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-green-400 hover:bg-green-500/10 border border-green-500/20 transition-colors"
              >
                <Play size={12} /> Run
              </button>
              <button
                onClick={onToggle}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                title={enabled ? "Disable" : "Enable"}
              >
                {enabled ? (
                  <Power size={14} className="text-green-400" />
                ) : (
                  <PowerOff size={14} className="text-white/30" />
                )}
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} className="text-white/30 hover:text-red-400" />
              </button>
            </>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || graph.nodes.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: hasChanges
                ? "linear-gradient(135deg, #0EA5E9 0%, #8B5CF6 100%)"
                : "rgba(14,165,233,0.3)",
            }}
          >
            <Save size={12} />
            {isSaving ? "Saving..." : workflowId ? "Update" : "Save Workflow"}
          </button>
        </div>
      </div>

      {/* Main content: palette + canvas + optional panels */}
      <div className="flex flex-1 overflow-hidden relative">
        <NodePalette onDragTemplate={handleDragTemplate} />
        <WorkflowCanvas
          graph={graph}
          onChange={handleGraphChange}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          contacts={contacts}
          onOpenDetail={handleOpenDetail}
        />

        {/* AI Chat panel (right side) — hidden when detail panel is open */}
        {showAIChat && !detailPanel && (
          <BuilderAIChat
            workflowId={workflowId}
            onWorkflowSaved={handleAIWorkflowSaved}
            onClose={() => setShowAIChat(false)}
          />
        )}

        {/* Detail panel overlay */}
        {detailPanel && detailNode && (
          <NodeDetailPanel
            node={detailNode}
            fieldKey={detailPanel.fieldKey}
            fieldLabel={detailPanel.fieldLabel}
            value={detailNode.config[detailPanel.fieldKey] ?? ""}
            onSave={handleDetailSave}
            onClose={() => setDetailPanel(null)}
          />
        )}
      </div>
    </div>
  );
}
