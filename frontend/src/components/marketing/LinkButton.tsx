import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "outline-blue";

const variants: Record<Variant, string> = {
  primary: "bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 text-white",
  outline: "border border-white/20 text-white hover:bg-white/10",
  ghost: "text-white hover:bg-white/10",
  "outline-blue": "border border-[#0EA5E9] text-[#0EA5E9] hover:bg-[#0EA5E9] hover:text-white",
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
    "inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-sm font-medium transition-all",
    variants[variant],
    className
  );

  if (isExternal) {
    return <a href={href} className={classes}>{children}</a>;
  }

  return <Link href={href} className={classes}>{children}</Link>;
}
