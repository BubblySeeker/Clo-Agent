"use client";

import { Minus, Plus, Maximize2 } from "lucide-react";

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export default function ZoomControls({ zoom, onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  return (
    <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-[#0D1117]/90 border border-white/10 backdrop-blur-sm">
      <button
        onClick={onZoomOut}
        className="p-1 rounded-lg hover:bg-white/10 transition-colors"
        title="Zoom out"
      >
        <Minus size={14} className="text-white/60" />
      </button>
      <span className="text-[10px] text-white/50 w-10 text-center font-mono tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={onZoomIn}
        className="p-1 rounded-lg hover:bg-white/10 transition-colors"
        title="Zoom in"
      >
        <Plus size={14} className="text-white/60" />
      </button>
      <div className="w-px h-4 bg-white/10 mx-0.5" />
      <button
        onClick={onFit}
        className="p-1 rounded-lg hover:bg-white/10 transition-colors"
        title="Fit to view"
      >
        <Maximize2 size={14} className="text-white/60" />
      </button>
    </div>
  );
}
