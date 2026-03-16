"use client";

import Link from "next/link";
import { Building2, Twitter, Linkedin, Github, Mail } from "lucide-react";
import { motion } from "framer-motion";

const productLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Dashboard", href: "/dashboard" },
];

const companyLinks = [
  { label: "About", href: "/about" },
  { label: "Team", href: "/team" },
  { label: "Mission", href: "/mission" },
];

const socialLinks = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
  { icon: Github, label: "GitHub", href: "#" },
  { icon: Mail, label: "Email", href: "mailto:hello@cloagent.com" },
];

export function MarketingFooter() {
  return (
    <footer className="relative border-t border-white/[0.06]">
      {/* Top glow line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px glow-line opacity-40" />

      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-5 group">
              <motion.div
                whileHover={{ scale: 1.08, rotate: -3 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0EA5E9] to-[#0284C7] flex items-center justify-center shadow-lg shadow-[#0EA5E9]/20"
              >
                <Building2 size={20} className="text-white" />
              </motion.div>
              <span className="text-xl font-[family-name:var(--font-sora)] font-semibold text-white tracking-tight">
                CloAgent
              </span>
            </Link>
            <p className="text-white/40 text-sm leading-relaxed">
              The modern CRM platform designed for real estate professionals who demand excellence.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-white/80 font-[family-name:var(--font-sora)] font-semibold text-sm uppercase tracking-wider mb-5">
              Product
            </h4>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/40 hover:text-[#0EA5E9] text-sm transition-colors duration-300"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white/80 font-[family-name:var(--font-sora)] font-semibold text-sm uppercase tracking-wider mb-5">
              Company
            </h4>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/40 hover:text-[#0EA5E9] text-sm transition-colors duration-300"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-white/80 font-[family-name:var(--font-sora)] font-semibold text-sm uppercase tracking-wider mb-5">
              Connect
            </h4>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-[#0EA5E9]/10 hover:border-[#0EA5E9]/30 flex items-center justify-center transition-colors duration-300 group"
                  aria-label={social.label}
                >
                  <social.icon size={17} className="text-white/40 group-hover:text-[#0EA5E9]" />
                </motion.a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/[0.06] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-white/25 text-sm">© 2026 CloAgent. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="#" className="text-white/25 hover:text-white/50 text-sm transition-colors duration-300">
              Privacy Policy
            </Link>
            <Link href="#" className="text-white/25 hover:text-white/50 text-sm transition-colors duration-300">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
