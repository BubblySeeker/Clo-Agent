"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type Variant = "primary" | "cta" | "outline" | "ghost" | "outline-blue";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#3B82F6] hover:to-[#2563EB] text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30",
  cta:
    "bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#FB923C] hover:to-[#F97316] text-white shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30",
  outline:
    "border border-white/[0.15] text-slate-300 hover:bg-white/[0.06] hover:border-white/[0.25] hover:text-white",
  ghost: "text-slate-400 hover:text-white hover:bg-white/[0.08]",
  "outline-blue":
    "border border-[#2563EB]/40 text-[#2563EB] hover:bg-[#2563EB]/5 hover:border-[#2563EB]/60",
};

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export function LinkButton({ href, variant = "primary", className, children }: LinkButtonProps) {
  const isExternal = href.startsWith("mailto:") || href.startsWith("http");
  const isAnchor = href.startsWith("#");
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-medium transition-all duration-300 cursor-pointer",
    variants[variant],
    className
  );

  const inner = (
    <motion.span
      className="inline-flex items-center justify-center gap-2 w-full"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {children}
    </motion.span>
  );

  if (isExternal || isAnchor) {
    return <a href={href} className={classes}>{inner}</a>;
  }

  return <Link href={href} className={classes}>{inner}</Link>;
}
