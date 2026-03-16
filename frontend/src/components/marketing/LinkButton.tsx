"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type Variant = "primary" | "outline" | "ghost" | "outline-blue";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] hover:from-[#38BDF8] hover:to-[#0EA5E9] text-white shadow-lg shadow-[#0EA5E9]/20 hover:shadow-[#0EA5E9]/30",
  outline:
    "border border-white/[0.12] text-white/90 hover:bg-white/[0.06] hover:border-white/[0.2]",
  ghost: "text-white/70 hover:text-white hover:bg-white/[0.06]",
  "outline-blue":
    "border border-[#0EA5E9]/40 text-[#0EA5E9] hover:bg-[#0EA5E9]/10 hover:border-[#0EA5E9]/60",
};

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export function LinkButton({ href, variant = "primary", className, children }: LinkButtonProps) {
  const isExternal = href.startsWith("mailto:") || href.startsWith("http");
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-medium transition-all duration-300",
    variants[variant],
    className
  );

  const inner = (
    <motion.span
      className="inline-flex items-center justify-center gap-2 w-full"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {children}
    </motion.span>
  );

  if (isExternal) {
    return <a href={href} className={classes}>{inner}</a>;
  }

  return <Link href={href} className={classes}>{inner}</Link>;
}
