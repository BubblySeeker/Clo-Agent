"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import type { WorkflowNode as NodeType, WorkflowGraph, NodeTemplate } from "./types";
import { getTemplate } from "./types";
import type { ContactOption } from "../ContactChipInput";
import WorkflowNodeCard from "./WorkflowNode";
import AnimatedWire, { GhostWire, WireGlowDefs } from "./AnimatedWire";
import ZoomControls from "./ZoomControls";

const NODE_WIDTH = 200;
const NODE_HEIGHT_APPROX = 100;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

interface WorkflowCanvasProps {
  graph: WorkflowGraph;
  onChange: (graph: WorkflowGraph) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  contacts?: ContactOption[];
  onOpenDetail?: (nodeId: string, fieldKey: string, fieldLabel: string) => void;
}

export default function WorkflowCanvas({
  graph,
  onChange,
  selectedNodeId,
  onSelectNode,
  contacts = [],
  onOpenDetail,
}: WorkflowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Node dragging
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panStartOffset, setPanStartOffset] = useState({ x: 0, y: 0 });

  // Wire selection
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Connection dragging
  const [connecting, setConnecting] = useState<{
    fromId: string;
    port: "top" | "bottom";
    mouseX: number;
    mouseY: number;
  } | null>(null);

  // Convert screen coords to canvas coords
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [zoom, pan]);

  // Compute orphaned nodes
  const orphanedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      const hasIncoming = graph.edges.some(e => e.to === node.id);
      const hasOutgoing = graph.edges.some(e => e.from === node.id);
      // Triggers only need outgoing edges; all others need at least one connection
      if (node.kind === "trigger") {
        if (!hasOutgoing && graph.nodes.length > 1) ids.add(node.id);
      } else {
        if (!hasIncoming && !hasOutgoing) ids.add(node.id);
      }
    }
    return ids;
  }, [graph.nodes, graph.edges]);

  // Handle drop from palette
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("application/workflow-node");
      if (!data) return;

      const template: NodeTemplate = JSON.parse(data);
      const pos = screenToCanvas(e.clientX, e.clientY);

      const newNode: NodeType = {
        id: crypto.randomUUID(),
        kind: template.kind,
        type: template.type,
        label: template.label,
        config: {},
        position: { x: Math.max(0, pos.x - NODE_WIDTH / 2), y: Math.max(0, pos.y - 30) },
      };

      const updatedNodes = [...graph.nodes, newNode];
      const updatedEdges = [...graph.edges];

      if (template.kind === "action" || template.kind === "condition") {
        // Smart auto-connect: only connect when the intent is obvious
        // Find nodes with no outgoing edges (end of chains)
        const nodesWithOutgoing = new Set(graph.edges.map((e) => e.from));
        const endNodes = graph.nodes
          .filter((n) => !nodesWithOutgoing.has(n.id))
          .sort((a, b) => a.position.y - b.position.y);

        // Only auto-connect if there's exactly ONE clear end-of-chain node
        // (avoids confusing connections when there are multiple disconnected nodes)
        if (endNodes.length === 1) {
          updatedEdges.push({
            id: crypto.randomUUID(),
            from: endNodes[0].id,
            to: newNode.id,
          });
        }
      }

      onChange({ nodes: updatedNodes, edges: updatedEdges });
      onSelectNode(newNode.id);
    },
    [graph, onChange, onSelectNode, screenToCanvas]
  );

  // Node drag
  const handleNodeDragStart = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setDragNodeId(nodeId);
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setDragOffset({
        x: canvasPos.x - node.position.x,
        y: canvasPos.y - node.position.y,
      });
    },
    [graph.nodes, screenToCanvas]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Connection dragging
      if (connecting) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          setConnecting({
            ...connecting,
            mouseX: (e.clientX - rect.left - pan.x) / zoom,
            mouseY: (e.clientY - rect.top - pan.y) / zoom,
          });
        }
        return;
      }

      // Pan
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x + panStartOffset.x,
          y: e.clientY - panStart.y + panStartOffset.y,
        });
        return;
      }

      // Node drag
      if (!dragNodeId) return;
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const x = canvasPos.x - dragOffset.x;
      const y = canvasPos.y - dragOffset.y;

      onChange({
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === dragNodeId
            ? { ...n, position: { x: Math.max(0, x), y: Math.max(0, y) } }
            : n
        ),
      });
    },
    [dragNodeId, dragOffset, graph, onChange, isPanning, panStart, panStartOffset, connecting, zoom, pan, screenToCanvas]
  );

  const handleMouseUp = useCallback(() => {
    setDragNodeId(null);
    setIsPanning(false);
    // End connection drag without target
    if (connecting) {
      setConnecting(null);
    }
  }, [connecting]);

  // Delete node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      onChange({
        nodes: graph.nodes.filter((n) => n.id !== nodeId),
        edges: graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      });
      if (selectedNodeId === nodeId) onSelectNode(null);
    },
    [graph, onChange, selectedNodeId, onSelectNode]
  );

  // Delete edge
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      onChange({
        ...graph,
        edges: graph.edges.filter((e) => e.id !== edgeId),
      });
      setSelectedEdgeId(null);
    },
    [graph, onChange]
  );

  // Config change
  const handleConfigChange = useCallback(
    (nodeId: string, config: Record<string, string>) => {
      onChange({
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === nodeId ? { ...n, config } : n
        ),
      });
    },
    [graph, onChange]
  );

  // Connection port handlers
  const handleStartConnect = useCallback(
    (nodeId: string, port: "top" | "bottom", e: React.MouseEvent) => {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setConnecting({
        fromId: nodeId,
        port,
        mouseX: (e.clientX - rect.left - pan.x) / zoom,
        mouseY: (e.clientY - rect.top - pan.y) / zoom,
      });
    },
    [graph.nodes, zoom, pan]
  );

  const handleEndConnect = useCallback(
    (nodeId: string, port: "top" | "bottom") => {
      if (!connecting || connecting.fromId === nodeId) {
        setConnecting(null);
        return;
      }

      // Determine direction: bottom port -> top port (from -> to)
      const fromId = connecting.port === "bottom" ? connecting.fromId : nodeId;
      const toId = connecting.port === "bottom" ? nodeId : connecting.fromId;

      // Don't create duplicate edges
      const exists = graph.edges.some(e => e.from === fromId && e.to === toId);
      if (!exists) {
        onChange({
          ...graph,
          edges: [...graph.edges, { id: crypto.randomUUID(), from: fromId, to: toId }],
        });
      }

      setConnecting(null);
    },
    [connecting, graph, onChange]
  );

  // Calculate wire positions
  const getNodeCenter = (node: NodeType) => ({
    x: node.position.x + NODE_WIDTH / 2,
    topY: node.position.y,
    bottomY: node.position.y + NODE_HEIGHT_APPROX,
  });

  // Get ghost wire source position
  const getGhostWireSource = () => {
    if (!connecting) return null;
    const node = graph.nodes.find(n => n.id === connecting.fromId);
    if (!node) return null;
    const center = getNodeCenter(node);
    return {
      x: center.x,
      y: connecting.port === "bottom" ? center.bottomY : center.topY,
    };
  };

  // Zoom handlers
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
      }
    },
    []
  );

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const handleFit = useCallback(() => {
    if (graph.nodes.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const minX = Math.min(...graph.nodes.map(n => n.position.x));
    const minY = Math.min(...graph.nodes.map(n => n.position.y));
    const maxX = Math.max(...graph.nodes.map(n => n.position.x + NODE_WIDTH));
    const maxY = Math.max(...graph.nodes.map(n => n.position.y + NODE_HEIGHT_APPROX + 40));

    const graphWidth = maxX - minX + 80;
    const graphHeight = maxY - minY + 80;

    const scaleX = rect.width / graphWidth;
    const scaleY = rect.height / graphHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), MIN_ZOOM), 1.2);

    setPan({
      x: (rect.width - graphWidth * newZoom) / 2 - minX * newZoom + 40 * newZoom,
      y: (rect.height - graphHeight * newZoom) / 2 - minY * newZoom + 40 * newZoom,
    });
    setZoom(newZoom);
  }, [graph.nodes]);

  // Auto-fit when nodes are loaded (e.g. AI creates a workflow)
  const prevNodeCountRef = useRef(0);
  useEffect(() => {
    const nodeCount = graph.nodes.length;
    // Auto-fit when nodes go from 0/1 to 3+ (AI just created a workflow)
    if (nodeCount >= 3 && prevNodeCountRef.current <= 1) {
      // Small delay to let layout settle
      setTimeout(() => handleFit(), 100);
    }
    prevNodeCountRef.current = nodeCount;
  }, [graph.nodes.length, handleFit]);

  // Click canvas to deselect
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan if clicking on empty space (not a node or wire)
    if (e.target === canvasRef.current || e.target === contentRef.current || (e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).tagName === "rect" || (e.target as HTMLElement).tagName === "circle") {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanStartOffset({ x: pan.x, y: pan.y });
    }
  }, [pan]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if we didn't pan significantly
    onSelectNode(null);
    setSelectedEdgeId(null);
  }, [onSelectNode]);

  // Keyboard: Delete selected edge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEdgeId) {
        // Don't delete if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
        handleDeleteEdge(selectedEdgeId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEdgeId, handleDeleteEdge]);

  const ghostSource = getGhostWireSource();

  return (
    <div
      ref={canvasRef}
      className="flex-1 relative overflow-hidden"
      style={{
        background: `
          radial-gradient(circle at 50% 0%, rgba(14,165,233,0.04) 0%, transparent 60%),
          linear-gradient(180deg, #0B0F19 0%, #0D1117 100%)
        `,
        cursor: isPanning ? "grabbing" : connecting ? "crosshair" : "default",
      }}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
      onWheel={handleWheel}
    >
      {/* Transformed content layer */}
      <div
        ref={contentRef}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {/* Grid pattern */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: 4000, height: 4000 }}>
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="12" cy="12" r="0.5" fill="rgba(255,255,255,0.05)" />
            </pattern>
          </defs>
          <rect width="4000" height="4000" fill="url(#grid)" />
        </svg>

        {/* SVG layer for wires */}
        <svg
          className="absolute inset-0"
          style={{ width: 4000, height: 4000, overflow: "visible", pointerEvents: "none" }}
        >
          <WireGlowDefs />
          {graph.edges.map((edge) => {
            const fromNode = graph.nodes.find((n) => n.id === edge.from);
            const toNode = graph.nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const from = getNodeCenter(fromNode);
            const to = getNodeCenter(toNode);
            const fromTemplate = getTemplate(fromNode.type);

            return (
              <AnimatedWire
                key={edge.id}
                edgeId={edge.id}
                fromX={from.x}
                fromY={from.bottomY}
                toX={to.x}
                toY={to.topY}
                color={fromTemplate?.accent ?? "#6B7280"}
                selected={selectedEdgeId === edge.id}
                onSelect={setSelectedEdgeId}
                onDelete={handleDeleteEdge}
              />
            );
          })}

          {/* Ghost wire during connection drag */}
          {connecting && ghostSource && (
            <GhostWire
              fromX={ghostSource.x}
              fromY={ghostSource.y}
              toX={connecting.mouseX}
              toY={connecting.mouseY}
              color="#8B5CF6"
            />
          )}
        </svg>

        {/* Nodes */}
        {graph.nodes.map((node) => (
          <WorkflowNodeCard
            key={node.id}
            node={node}
            selected={selectedNodeId === node.id}
            isOrphaned={orphanedNodeIds.has(node.id)}
            contacts={contacts}
            onSelect={onSelectNode}
            onDragStart={handleNodeDragStart}
            onDelete={handleDeleteNode}
            onConfigChange={handleConfigChange}
            onOpenDetail={onOpenDetail}
            onStartConnect={handleStartConnect}
            onEndConnect={handleEndConnect}
          />
        ))}
      </div>

      {/* Empty state */}
      {graph.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white/20">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-white/40">
              Drag nodes from the palette
            </p>
            <p className="text-xs text-white/20 mt-1">
              Start with a trigger, then add actions
            </p>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={handleFit}
      />
    </div>
  );
}
