"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

export function MarketingNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Always use dark nav styling across all marketing pages
  const useDarkNav = true;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? useDarkNav
            ? "bg-[#0F172A]/90 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.3)] border-b border-white/[0.05]"
            : "bg-white/90 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-slate-200/60"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <motion.div
              whileHover={{ scale: 1.08, rotate: -3 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#3B82F6] flex items-center justify-center shadow-lg shadow-[#2563EB]/20"
            >
              <Building2 size={20} className="text-white" />
            </motion.div>
            <span className={`text-xl font-[family-name:var(--font-cinzel)] font-semibold tracking-tight transition-colors duration-300 ${useDarkNav ? 'text-white' : 'text-slate-900'}`}>
              Estate CRM
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative px-4 py-2 text-sm font-[family-name:var(--font-josefin)] font-medium transition-colors rounded-lg group"
                >
                  <span
                    className={
                      isActive
                        ? useDarkNav ? "text-white" : "text-[#1E293B]"
                        : useDarkNav ? "text-slate-300 group-hover:text-white" : "text-slate-500 group-hover:text-slate-900"
                    }
                    style={{ transition: "color 300ms" }}
                  >
                    {link.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-underline"
                      className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#2563EB] rounded-full"
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    />
                  )}
                  {!isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#2563EB]/40 rounded-full scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/sign-in"
              className={`inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 font-[family-name:var(--font-josefin)] ${useDarkNav ? 'text-slate-300 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              Login
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-[#F97316]/25 hover:scale-[1.02] active:scale-[0.98] font-[family-name:var(--font-josefin)]"
              style={{ backgroundColor: "#F97316" }}
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className={`md:hidden p-2 transition-colors ${useDarkNav ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={`md:hidden overflow-hidden ${useDarkNav ? 'bg-[#0F172A] rounded-b-xl' : ''}`}
            >
              <div className="flex flex-col gap-1 pt-6 pb-4">
                {navLinks.map((link, index) => {
                  const isActive = pathname.startsWith(link.href);
                  return (
                    <motion.div
                      key={link.href}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`block px-4 py-2.5 rounded-lg text-sm font-[family-name:var(--font-josefin)] transition-colors ${
                          isActive
                            ? useDarkNav ? "text-white bg-white/10 font-medium" : "text-[#1E293B] bg-slate-100 font-medium"
                            : useDarkNav ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        {link.label}
                      </Link>
                    </motion.div>
                  );
                })}
                <div className={`flex flex-col gap-2 pt-4 mt-2 border-t ${useDarkNav ? 'border-slate-700' : 'border-slate-200'}`}>
                  <Link
                    href="/sign-in"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block w-full text-center px-5 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 font-[family-name:var(--font-josefin)] ${useDarkNav ? 'text-slate-300 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                  >
                    Login
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block w-full text-center px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all duration-300 font-[family-name:var(--font-josefin)]"
                    style={{ backgroundColor: "#F97316" }}
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </nav>
  );
}
