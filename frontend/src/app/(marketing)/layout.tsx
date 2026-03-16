"use client";

import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <style>{`html, body { background-color: #070B14; }`}</style>
      <div className="min-h-screen bg-[#070B14] font-[family-name:var(--font-dm-sans)] relative">
        {/* Ambient background layers */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0C1425] via-[#070B14] to-[#0C1425]" />
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[#0EA5E9]/[0.03] blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-[#6366F1]/[0.02] blur-[100px]" />
          <div className="absolute inset-0 bg-noise opacity-[0.4]" />
        </div>
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
    </>
  );
}
