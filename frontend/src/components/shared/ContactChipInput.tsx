"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { X } from "lucide-react";

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0EA5E9", "#059669", "#D97706", "#DC2626", "#0891B2", "#4F46E5"];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export interface ContactOption {
  id: string;
  email: string;
  name: string;
  initials: string;
}

interface ContactChipInputProps {
  /** Comma-separated emails */
  value: string;
  onChange: (value: string) => void;
  contacts: ContactOption[];
  placeholder?: string;
  /** "dark" for workflow builder canvas, "light" for regular forms */
  variant?: "dark" | "light";
}

export default function ContactChipInput({
  value,
  onChange,
  contacts,
  placeholder = "Type name or email...",
  variant = "dark",
}: ContactChipInputProps) {
  const chips = useMemo(
    () => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []),
    [value]
  );
  const [inputVal, setInputVal] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = inputVal.trim().toLowerCase();
    const existing = new Set(chips.map((c) => c.toLowerCase()));
    const base = contacts.filter((c) => !existing.has(c.email.toLowerCase()));
    if (!q) return base.slice(0, 6);
    return base
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [inputVal, contacts, chips]);

  function addChip(email: string) {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (chips.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setInputVal("");
      return;
    }
    onChange([...chips, trimmed].join(", "));
    setInputVal("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeChip(idx: number) {
    onChange(chips.filter((_, i) => i !== idx).join(", "));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === "Tab" || e.key === ",") && inputVal.trim()) {
      e.preventDefault();
      addChip(inputVal);
    }
    if (e.key === "Backspace" && !inputVal && chips.length > 0) {
      removeChip(chips.length - 1);
    }
  }

  const contactByEmail = useMemo(() => {
    const map: Record<string, ContactOption> = {};
    for (const c of contacts) map[c.email.toLowerCase()] = c;
    return map;
  }, [contacts]);

  const isDark = variant === "dark";

  return (
    <div ref={ref} className="relative">
      {/* Chip container */}
      <div
        className={`flex flex-wrap items-center gap-1 min-h-[30px] px-2 py-1 rounded-lg text-xs outline-none transition-all cursor-text ${
          isDark
            ? "bg-white/5 border border-white/10 focus-within:border-white/30"
            : "bg-white border border-gray-200 focus-within:border-sky-400"
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((email, idx) => {
          const contact = contactByEmail[email.toLowerCase()];
          return (
            <span
              key={`${email}-${idx}`}
              className={`inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full text-[10px] font-medium max-w-[160px] transition-colors ${
                isDark
                  ? "bg-white/10 text-white/80 hover:bg-white/15"
                  : "bg-sky-100 text-sky-700 hover:bg-sky-200"
              }`}
            >
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold shrink-0"
                style={{ backgroundColor: avatarColor(contact?.name || email) }}
              >
                {contact?.initials || email[0]?.toUpperCase() || "?"}
              </span>
              <span className="truncate">{contact?.name || email}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(idx);
                }}
                className={`shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                  isDark ? "hover:bg-white/20" : "hover:bg-sky-300"
                }`}
              >
                <X size={8} />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputVal.trim() && inputVal.includes("@")) addChip(inputVal);
          }}
          placeholder={chips.length === 0 ? placeholder : ""}
          className={`flex-1 min-w-[80px] bg-transparent outline-none text-[11px] py-0.5 ${
            isDark
              ? "text-white/80 placeholder-white/30"
              : "text-gray-800 placeholder-gray-400"
          }`}
        />
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div
          className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-lg z-50 max-h-40 overflow-y-auto ${
            isDark
              ? "bg-[#1A1F2E] border-white/10"
              : "bg-white border-gray-200"
          }`}
        >
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => addChip(c.email)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors first:rounded-t-xl last:rounded-b-xl ${
                isDark
                  ? "hover:bg-white/5"
                  : "hover:bg-gray-50"
              }`}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                style={{ backgroundColor: avatarColor(c.name) }}
              >
                {c.initials}
              </div>
              <div className="min-w-0">
                <p className={`text-[11px] font-medium truncate ${isDark ? "text-white/80" : "text-gray-800"}`}>
                  {c.name}
                </p>
                <p className={`text-[9px] truncate ${isDark ? "text-white/30" : "text-gray-400"}`}>
                  {c.email}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
