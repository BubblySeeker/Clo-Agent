"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Share2,
  Search,
  Plus,
  X,
  TrendingUp,
  Users,
  Award,
  ArrowRight,
  Trash2,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  getReferralNetwork,
  getReferralStats,
  createReferral,
  deleteReferral,
  type NetworkNode,
  type NetworkEdge,
  type ReferralStats,
} from "@/lib/api/referrals";
import { listContacts, type Contact } from "@/lib/api/contacts";

// ---------- Force simulation types ----------
interface SimNode extends NetworkNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

// ---------- Force simulation ----------
function useForceSimulation(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  width: number,
  height: number
) {
  const simNodesRef = useRef<SimNode[]>([]);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const frameRef = useRef<number>(0);
  const tickRef = useRef(0);

  useEffect(() => {
    if (!nodes.length || !width || !height) {
      simNodesRef.current = [];
      setSimNodes([]);
      return;
    }

    // Initialize positions
    const cx = width / 2;
    const cy = height / 2;
    const sNodes: SimNode[] = nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const r = Math.min(width, height) * 0.3;
      const radius = Math.max(20, Math.min(40, 20 + n.referral_count * 6));
      return {
        ...n,
        x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius,
      };
    });

    simNodesRef.current = sNodes;
    tickRef.current = 0;

    const nodeMap = new Map(sNodes.map((n) => [n.id, n]));
    const maxTicks = 300;

    function tick() {
      const alpha = Math.max(0, 1 - tickRef.current / maxTicks);
      if (alpha <= 0) {
        setSimNodes([...simNodesRef.current]);
        return;
      }
      tickRef.current++;

      const sns = simNodesRef.current;

      // Center gravity
      for (const n of sns) {
        n.vx += (cx - n.x) * 0.001 * alpha;
        n.vy += (cy - n.y) * 0.001 * alpha;
      }

      // Repulsion between all pairs
      for (let i = 0; i < sns.length; i++) {
        for (let j = i + 1; j < sns.length; j++) {
          const a = sns[i];
          const b = sns[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 40;
          const force = (150 * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;

          // Overlap push
          if (dist < minDist) {
            const push = ((minDist - dist) / dist) * 0.5;
            a.vx -= dx * push;
            a.vy -= dy * push;
            b.vx += dx * push;
            b.vy += dy * push;
          }
        }
      }

      // Attraction along edges
      for (const e of edges) {
        const a = nodeMap.get(e.from);
        const b = nodeMap.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 140;
        const force = ((dist - targetDist) / dist) * 0.03 * alpha;
        const fx = dx * force;
        const fy = dy * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Apply velocity + damping + bounds
      const pad = 50;
      for (const n of sns) {
        n.vx *= 0.6;
        n.vy *= 0.6;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(pad, Math.min(width - pad, n.x));
        n.y = Math.max(pad, Math.min(height - pad, n.y));
      }

      setSimNodes([...sns]);
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [nodes, edges, width, height]);

  return simNodes;
}

// ---------- Node color by status ----------
function nodeColor(node: NetworkNode): string {
  // Green for closed deals, blue for active deals, gray for leads
  if (node.deals_count > 0 && node.source === "Referral") return "#22C55E";
  if (node.deals_count > 0) return "#0EA5E9";
  return "#94A3B8";
}

function nodeColorBg(node: NetworkNode): string {
  if (node.deals_count > 0 && node.source === "Referral") return "#DCFCE7";
  if (node.deals_count > 0) return "#E0F2FE";
  return "#F1F5F9";
}

// ---------- Contact Search Picker ----------
function ContactPicker({
  label,
  selected,
  onSelect,
  exclude,
  token,
}: {
  label: string;
  selected: Contact | null;
  onSelect: (c: Contact) => void;
  exclude?: string;
  token: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["contacts-picker", search],
    queryFn: () => listContacts(token, { search, limit: 10 }),
    enabled: open && !!token,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const contacts = (data?.contacts ?? []).filter((c) => c.id !== exclude);

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
          <span className="text-sm font-medium text-gray-800 flex-1">
            {selected.first_name} {selected.last_name}
          </span>
          <button onClick={() => onSelect(null as any)} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      ) : (
        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30 focus:border-[#0EA5E9]"
        />
      )}
      {open && !selected && contacts.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 max-h-48 overflow-y-auto z-50">
          {contacts.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c); setOpen(false); setSearch(""); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
            >
              <span className="font-medium text-gray-800">{c.first_name} {c.last_name}</span>
              {c.email && <span className="text-gray-400 ml-2">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Main Page ----------
export default function ReferralsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [referrer, setReferrer] = useState<Contact | null>(null);
  const [referred, setReferred] = useState<Contact | null>(null);
  const [notes, setNotes] = useState("");
  const [token, setToken] = useState<string | null>(null);

  // Get token
  useEffect(() => {
    getToken().then((t) => setToken(t));
  }, [getToken]);

  // Resize observer for SVG container
  useEffect(() => {
    const el = svgContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSvgSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Queries
  const { data: network, isLoading: networkLoading } = useQuery({
    queryKey: ["referral-network"],
    queryFn: async () => {
      const t = await getToken();
      return getReferralNetwork(t!);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["referral-stats"],
    queryFn: async () => {
      const t = await getToken();
      return getReferralStats(t!);
    },
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: async () => {
      const t = await getToken();
      return createReferral(t!, {
        referrer_id: referrer!.id,
        referred_id: referred!.id,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referral-network"] });
      queryClient.invalidateQueries({ queryKey: ["referral-stats"] });
      setShowAddModal(false);
      setReferrer(null);
      setReferred(null);
      setNotes("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const t = await getToken();
      return deleteReferral(t!, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referral-network"] });
      queryClient.invalidateQueries({ queryKey: ["referral-stats"] });
    },
  });

  const nodes = network?.nodes ?? [];
  const edges = network?.edges ?? [];

  const simNodes = useForceSimulation(nodes, edges, svgSize.width, svgSize.height);
  const nodeMap = useMemo(() => new Map(simNodes.map((n) => [n.id, n])), [simNodes]);

  // Filter nodes by search
  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return new Set(simNodes.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id));
  }, [searchQuery, simNodes]);

  // Find edges for selected node
  const selectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id);
  }, [selectedNode, edges]);

  // Referral chain for selected node
  const referralChain = useMemo(() => {
    if (!selectedNode) return { referred: [] as NetworkNode[], referredBy: [] as NetworkNode[] };
    const referred = edges
      .filter((e) => e.from === selectedNode.id)
      .map((e) => nodes.find((n) => n.id === e.to))
      .filter(Boolean) as NetworkNode[];
    const referredBy = edges
      .filter((e) => e.to === selectedNode.id)
      .map((e) => nodes.find((n) => n.id === e.from))
      .filter(Boolean) as NetworkNode[];
    return { referred, referredBy };
  }, [selectedNode, edges, nodes]);

  const initials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="flex h-full">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "#EDE9FE" }}
            >
              <Share2 size={18} style={{ color: "#8B5CF6" }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>
                Referral Network
              </h1>
              <p className="text-xs text-gray-400">
                {nodes.length} contacts &middot; {edges.length} referral{edges.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "#8B5CF6" }}
            >
              <Plus size={16} />
              Add Referral
            </button>
          </div>
        </div>

        {/* Graph area */}
        <div className="flex-1 relative overflow-hidden" ref={svgContainerRef}>
          {networkLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[#8B5CF6]/30 border-t-[#8B5CF6] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-400">Loading network...</p>
              </div>
            </div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-[#EDE9FE] flex items-center justify-center mx-auto mb-4">
                  <Share2 size={28} className="text-[#8B5CF6]" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">No referrals yet</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Start tracking your referral network by linking contacts who refer each other.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: "#8B5CF6" }}
                >
                  <Plus size={16} />
                  Add First Referral
                </button>
              </div>
            </div>
          ) : (
            <svg width={svgSize.width} height={svgSize.height} className="absolute inset-0">
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#CBD5E1" />
                </marker>
                <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#8B5CF6" />
                </marker>
              </defs>

              {/* Edges */}
              {edges.map((e, i) => {
                const from = nodeMap.get(e.from);
                const to = nodeMap.get(e.to);
                if (!from || !to) return null;
                const isHighlighted =
                  selectedNode && (e.from === selectedNode.id || e.to === selectedNode.id);
                const isDimmed = matchedIds && !matchedIds.has(e.from) && !matchedIds.has(e.to);

                // Shorten line to stop at node edge
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const x1 = from.x + (dx / dist) * from.radius;
                const y1 = from.y + (dy / dist) * from.radius;
                const x2 = to.x - (dx / dist) * (to.radius + 10);
                const y2 = to.y - (dy / dist) * (to.radius + 10);

                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isHighlighted ? "#8B5CF6" : "#CBD5E1"}
                    strokeWidth={isHighlighted ? 2 : 1.5}
                    strokeOpacity={isDimmed ? 0.15 : isHighlighted ? 1 : 0.5}
                    markerEnd={isHighlighted ? "url(#arrowhead-active)" : "url(#arrowhead)"}
                  />
                );
              })}

              {/* Nodes */}
              {simNodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isSearchMatch = matchedIds?.has(node.id);
                const isDimmed = matchedIds && !isSearchMatch;
                const color = nodeColor(node);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => setSelectedNode(isSelected ? null : node)}
                    className="cursor-pointer"
                    opacity={isDimmed ? 0.2 : 1}
                  >
                    {/* Outer ring for selected */}
                    {isSelected && (
                      <circle r={node.radius + 5} fill="none" stroke="#8B5CF6" strokeWidth={2.5} />
                    )}
                    {/* Search highlight ring */}
                    {isSearchMatch && !isSelected && (
                      <circle r={node.radius + 4} fill="none" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 2" />
                    )}
                    {/* Node circle */}
                    <circle r={node.radius} fill={nodeColorBg(node)} stroke={color} strokeWidth={2} />
                    {/* Initials */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={node.radius > 28 ? 13 : 11}
                      fontWeight={600}
                      fill={color}
                      className="select-none pointer-events-none"
                    >
                      {initials(node.name)}
                    </text>
                    {/* Name label below */}
                    <text
                      y={node.radius + 14}
                      textAnchor="middle"
                      fontSize={11}
                      fill="#64748B"
                      className="select-none pointer-events-none"
                    >
                      {node.name.length > 16 ? node.name.slice(0, 14) + "..." : node.name}
                    </text>
                    {/* Referral count badge */}
                    {node.referral_count > 0 && (
                      <g transform={`translate(${node.radius * 0.7}, ${-node.radius * 0.7})`}>
                        <circle r={9} fill="#8B5CF6" />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={9}
                          fontWeight={700}
                          fill="white"
                          className="select-none pointer-events-none"
                        >
                          {node.referral_count}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {/* Legend */}
          {nodes.length > 0 && (
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Legend</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#22C55E]" />
                  <span className="text-xs text-gray-500">Closed deals</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#0EA5E9]" />
                  <span className="text-xs text-gray-500">Active deals</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#94A3B8]" />
                  <span className="text-xs text-gray-500">Leads</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      <div className="w-80 shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-y-auto">
        {/* Stats section */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Network Stats</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-[#EDE9FE] rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Share2 size={12} className="text-[#8B5CF6]" />
                <span className="text-[10px] font-medium text-[#8B5CF6]">Total</span>
              </div>
              <p className="text-lg font-bold text-[#8B5CF6]">{stats?.total_referrals ?? 0}</p>
            </div>
            <div className="bg-[#E0F2FE] rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Users size={12} className="text-[#0EA5E9]" />
                <span className="text-[10px] font-medium text-[#0EA5E9]">Referred</span>
              </div>
              <p className="text-lg font-bold text-[#0EA5E9]">{stats?.total_referred ?? 0}</p>
            </div>
            <div className="col-span-2 bg-[#DCFCE7] rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp size={12} className="text-[#22C55E]" />
                <span className="text-[10px] font-medium text-[#22C55E]">Conversion Rate</span>
              </div>
              <p className="text-lg font-bold text-[#22C55E]">
                {stats?.conversion_rate?.toFixed(1) ?? "0.0"}%
              </p>
            </div>
          </div>
        </div>

        {/* Top Referrers */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Award size={14} className="text-[#F59E0B]" />
            Top Referrers
          </h2>
          {(stats?.top_referrers ?? []).length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No referrers yet</p>
          ) : (
            <div className="space-y-2">
              {stats!.top_referrers.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2.5 group"
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: i === 0 ? "#F59E0B" : i === 1 ? "#94A3B8" : "#D4A574" }}
                  >
                    {i + 1}
                  </span>
                  <Link
                    href={`/dashboard/contacts/${r.id}`}
                    className="flex-1 text-sm font-medium text-gray-700 hover:text-[#8B5CF6] transition-colors truncate"
                  >
                    {r.name}
                  </Link>
                  <span className="text-xs font-bold text-[#8B5CF6] shrink-0">
                    {r.referral_count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected node detail */}
        {selectedNode && (
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-800">Contact Detail</h2>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: nodeColorBg(selectedNode),
                  color: nodeColor(selectedNode),
                }}
              >
                {initials(selectedNode.name)}
              </div>
              <div>
                <Link
                  href={`/dashboard/contacts/${selectedNode.id}`}
                  className="text-sm font-bold text-gray-800 hover:text-[#8B5CF6] transition-colors"
                >
                  {selectedNode.name}
                </Link>
                <p className="text-xs text-gray-400">
                  {selectedNode.source || "No source"} &middot; {selectedNode.deals_count} deal{selectedNode.deals_count !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Referral chain */}
            {referralChain.referredBy.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Referred by
                </p>
                {referralChain.referredBy.map((n) => (
                  <div key={n.id} className="flex items-center gap-2 py-1">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold"
                      style={{ backgroundColor: nodeColorBg(n), color: nodeColor(n) }}
                    >
                      {initials(n.name)}
                    </div>
                    <span className="text-xs text-gray-600">{n.name}</span>
                    <ArrowRight size={10} className="text-gray-300" />
                    <span className="text-xs font-medium text-[#8B5CF6]">{selectedNode.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            )}

            {referralChain.referred.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Referred
                </p>
                {referralChain.referred.map((n) => (
                  <div key={n.id} className="flex items-center gap-2 py-1">
                    <span className="text-xs font-medium text-[#8B5CF6]">{selectedNode.name.split(" ")[0]}</span>
                    <ArrowRight size={10} className="text-gray-300" />
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold"
                      style={{ backgroundColor: nodeColorBg(n), color: nodeColor(n) }}
                    >
                      {initials(n.name)}
                    </div>
                    <span className="text-xs text-gray-600">{n.name}</span>
                  </div>
                ))}
              </div>
            )}

            <Link
              href={`/dashboard/contacts/${selectedNode.id}`}
              className="flex items-center gap-1 text-xs font-medium text-[#8B5CF6] mt-3 hover:underline"
            >
              View full profile <ChevronRight size={12} />
            </Link>
          </div>
        )}
      </div>

      {/* Add Referral Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-800">Add Referral</h3>
              <button
                onClick={() => { setShowAddModal(false); setReferrer(null); setReferred(null); setNotes(""); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {token && (
                <>
                  <ContactPicker
                    label="Referrer (who referred)"
                    selected={referrer}
                    onSelect={setReferrer}
                    exclude={referred?.id}
                    token={token}
                  />
                  <div className="flex justify-center">
                    <div className="w-8 h-8 rounded-full bg-[#EDE9FE] flex items-center justify-center">
                      <ArrowRight size={14} className="text-[#8B5CF6]" />
                    </div>
                  </div>
                  <ContactPicker
                    label="Referred (who was referred)"
                    selected={referred}
                    onSelect={setReferred}
                    exclude={referrer?.id}
                    token={token}
                  />
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How did this referral happen?"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30 focus:border-[#8B5CF6]"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowAddModal(false); setReferrer(null); setReferred(null); setNotes(""); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => addMutation.mutate()}
                disabled={!referrer || !referred || addMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#8B5CF6" }}
              >
                {addMutation.isPending ? "Adding..." : "Add Referral"}
              </button>
            </div>
            {addMutation.isError && (
              <div className="px-6 pb-4">
                <p className="text-xs text-red-500">Failed to add referral. It may already exist.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
