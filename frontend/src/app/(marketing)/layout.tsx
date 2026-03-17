"use client";

import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0F172A] font-[family-name:var(--font-dm-sans)] relative">
      <div className="relative z-10">
        <MarketingNav />
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
        <MarketingFooter />
      </div>
    </div>
  );
}
