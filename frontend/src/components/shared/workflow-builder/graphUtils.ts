/**
 * Shared graph conversion utilities for the workflow builder.
 * Extracted from page.tsx and WorkflowBuilder.tsx for reuse by AI chat and other components.
 */

import type { WorkflowNode as NodeType, WorkflowGraph } from "./types";
import { TRIGGER_TEMPLATES, ACTION_TEMPLATES, LOGIC_TEMPLATES, getTemplate } from "./types";

// Re-export for convenience
export type { WorkflowGraph };

/**
 * Parse a plain-text instruction into granular action nodes.
 * Best-effort heuristic — falls back to single AI Decision if nothing matches.
 */
export function parseInstructionToActions(instruction: string): NodeType[] {
  const actions: NodeType[] = [];
  const text = instruction.toLowerCase();

  // Detect "send email" pattern and extract recipient/subject
  const emailMatch = instruction.match(
    /send\s+(?:an?\s+)?email\s+to\s+([^\s,]+(?:@[^\s,]+)?)/i
  );
  const subjectMatch = instruction.match(
    /(?:with\s+(?:the\s+)?subject|subject[:\s]+)["']?([^"'\n.]+)/i
  );

  // Detect "create task" pattern
  const taskMatch = instruction.match(
    /create\s+(?:a\s+)?task\s+(?:to\s+|for\s+)?["']?([^"'\n.]{5,60})/i
  );

  // Check if instruction involves summarizing/analyzing (AI work)
  const needsAI =
    /summar|analyz|decide|evaluat|assess|determin|review|extract|classif/i.test(text);

  // If AI reasoning is needed, add an AI Decision node first
  if (needsAI) {
    let aiInstruction = instruction;
    if (emailMatch) {
      aiInstruction = instruction
        .replace(/,?\s*send\s+(?:an?\s+)?email\s+to\s+[^\s,]+.*/i, "")
        .replace(/^\s*(?:when[^,]+,\s*)?/i, "")
        .trim();
      if (!aiInstruction || aiInstruction.length < 10) {
        aiInstruction = "Analyze and summarize the relevant content";
      }
    }
    actions.push({
      id: crypto.randomUUID(),
      kind: "action",
      type: "ai_decision",
      label: "AI Decision",
      config: { instruction: aiInstruction },
      position: { x: 0, y: 0 },
    });
  }

  // Add Send Email node if detected
  if (emailMatch) {
    actions.push({
      id: crypto.randomUUID(),
      kind: "action",
      type: "send_email",
      label: "Send Email",
      config: {
        to: emailMatch[1],
        subject: subjectMatch?.[1]?.trim() ?? "",
        body: needsAI ? "Include summary from AI analysis" : "",
      },
      position: { x: 0, y: 0 },
    });
  }

  // Add Create Task node if detected
  if (taskMatch) {
    actions.push({
      id: crypto.randomUUID(),
      kind: "action",
      type: "create_task",
      label: "Create Task",
      config: { title: taskMatch[1].trim() },
      position: { x: 0, y: 0 },
    });
  }

  // If no specific actions were detected, fall back to single AI Decision
  if (actions.length === 0) {
    actions.push({
      id: crypto.randomUUID(),
      kind: "action",
      type: "ai_decision",
      label: "AI Decision",
      config: { instruction },
      position: { x: 0, y: 0 },
    });
  }

  return actions;
}

/** Convert a saved workflow into a visual graph */
export function workflowToGraph(wf: {
  trigger_type: string;
  trigger_config?: Record<string, unknown> | null;
  steps?: Array<{ type: string; config: Record<string, unknown> }> | null;
  instruction?: string | null;
}): WorkflowGraph {
  const nodes: NodeType[] = [];
  const edges: { id: string; from: string; to: string }[] = [];

  // Add trigger node
  const triggerId = crypto.randomUUID();
  const triggerTemplate = TRIGGER_TEMPLATES.find((t) => t.type === wf.trigger_type);
  nodes.push({
    id: triggerId,
    kind: "trigger",
    type: wf.trigger_type,
    label: triggerTemplate?.label ?? wf.trigger_type,
    config: (wf.trigger_config as Record<string, string>) ?? {},
    position: { x: 400, y: 60 },
  });

  // Add action nodes from steps (or parse from instruction)
  const steps = wf.steps ?? [];
  if (steps.length > 0) {
    let prevId = triggerId;
    steps.forEach((step, i) => {
      const actionTemplate = [...ACTION_TEMPLATES, ...LOGIC_TEMPLATES].find(
        (t) => t.type === step.type
      );
      const nodeId = crypto.randomUUID();
      nodes.push({
        id: nodeId,
        kind: actionTemplate?.kind ?? "action",
        type: step.type,
        label: actionTemplate?.label ?? step.type,
        config: (step.config as Record<string, string>) ?? {},
        position: { x: 400, y: 220 + i * 260 },
      });
      edges.push({ id: crypto.randomUUID(), from: prevId, to: nodeId });
      prevId = nodeId;
    });
  } else if (wf.instruction) {
    const actionNodes = parseInstructionToActions(wf.instruction);
    let prevId = triggerId;
    actionNodes.forEach((action, i) => {
      action.position = { x: 400, y: 200 + i * 180 };
      nodes.push(action);
      edges.push({ id: crypto.randomUUID(), from: prevId, to: action.id });
      prevId = action.id;
    });
  }

  return { nodes, edges };
}

/** Convert a visual node graph into an AI instruction string. */
export function graphToInstruction(graph: WorkflowGraph): string {
  const triggers = graph.nodes.filter((n) => n.kind === "trigger");
  const actions = graph.nodes.filter((n) => n.kind === "action" || n.kind === "condition");

  if (actions.length === 0) return "";

  const parts: string[] = [];

  if (triggers.length > 0) {
    const trigger = triggers[0];
    const configStr = Object.entries(trigger.config)
      .filter(([, v]) => v && v !== "any")
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const template = getTemplate(trigger.type);
    parts.push(
      `When triggered by "${template?.label ?? trigger.type}"${configStr ? ` (${configStr})` : ""}:`
    );
  }

  actions.forEach((action, i) => {
    const template = getTemplate(action.type);
    const configStr = Object.entries(action.config)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    parts.push(
      `${i + 1}. ${template?.label ?? action.type}${configStr ? ` — ${configStr}` : ""}`
    );
  });

  return parts.join("\n");
}

export function graphToTriggerType(graph: WorkflowGraph): string {
  const trigger = graph.nodes.find((n) => n.kind === "trigger");
  return trigger?.type ?? "manual";
}

export function graphToTriggerConfig(graph: WorkflowGraph): Record<string, unknown> {
  const trigger = graph.nodes.find((n) => n.kind === "trigger");
  if (!trigger) return {};
  return { ...trigger.config };
}

export function graphToActionSteps(
  graph: WorkflowGraph
): Array<{ type: string; config: Record<string, string> }> {
  return graph.nodes
    .filter((n) => n.kind === "action" || n.kind === "condition")
    .map((n) => ({ type: n.type, config: n.config }));
}

/** Generate a name from the graph if user didn't provide one */
export function generateWorkflowName(graph: WorkflowGraph): string {
  const trigger = graph.nodes.find((n) => n.kind === "trigger");
  const firstAction = graph.nodes.find((n) => n.kind === "action" || n.kind === "condition");

  if (!trigger && !firstAction) return "New Workflow";

  const parts: string[] = [];
  if (trigger) {
    const template = getTemplate(trigger.type);
    parts.push(template?.label ?? trigger.type);
  }
  if (firstAction) {
    const template = getTemplate(firstAction.type);
    parts.push(template?.label ?? firstAction.type);
  }
  return parts.join(" → ");
}

/**
 * List of available node types for AI context.
 * Used by BuilderAIChat to tell the AI what it can create.
 */
export function getAvailableNodeTypesDescription(): string {
  const triggers = TRIGGER_TEMPLATES.map(
    (t) => `${t.type} (${t.label}: ${t.description})`
  ).join(", ");
  const actions = ACTION_TEMPLATES.map(
    (t) => `${t.type} (${t.label}: ${t.description})`
  ).join(", ");
  const logic = LOGIC_TEMPLATES.map(
    (t) => `${t.type} (${t.label}: ${t.description})`
  ).join(", ");

  return (
    `Available trigger types: ${triggers}. ` +
    `Available action types: ${actions}. ` +
    `Available logic types: ${logic}.`
  );
}
