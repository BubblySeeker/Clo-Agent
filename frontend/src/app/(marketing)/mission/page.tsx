"use client";

import { motion } from "framer-motion";
import { LinkButton } from "@/components/marketing/LinkButton";
import { Target, Eye, Compass, Globe, Users, Rocket, ArrowRight, Heart } from "lucide-react";

const principles = [
  { icon: Users, title: "Empower Every Agent", description: "We believe every real estate professional deserves access to world-class tools, regardless of the size of their business." },
  { icon: Rocket, title: "Relentless Innovation", description: "We're committed to staying ahead of the curve, continuously pushing boundaries and exploring new technologies." },
  { icon: Heart, title: "Build with Empathy", description: "We design every feature with deep understanding of our users' daily challenges and aspirations." },
  { icon: Globe, title: "Think Global", description: "While we started in the US, our vision is to serve real estate professionals worldwide." },
];

const impact = [
  { stat: "40%", label: "Average increase in productivity" },
  { stat: "15hrs", label: "Saved per week on admin tasks" },
  { stat: "2.5x", label: "Faster deal closure rates" },
  { stat: "98%", label: "Would recommend to peers" },
];

const roadmap = [
  { title: "2026 - Q1", items: ["Advanced AI deal scoring", "Multi-language support", "Enhanced mobile experience"] },
  { title: "2026 - Q2", items: ["MLS deep integrations", "Video messaging", "Advanced team collaboration"] },
  { title: "2026 - Q3", items: ["Predictive market insights", "Custom API platform", "Enterprise white-labeling"] },
  { title: "2026 - Q4", items: ["International expansion", "Advanced AI assistant", "Ecosystem partnerships"] },
];

const spring = { type: "spring", stiffness: 100, damping: 20 };
const stagger = { staggerChildren: 0.1 };

export default function MissionPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring, delay: 0.1 }}
              className="inline-block px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] mb-8"
            >
              <span className="text-white/50 text-sm font-medium tracking-wide">Our Mission</span>
            </motion.div>
            <h1 className="font-[family-name:var(--font-sora)] text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
              Empowering real estate professionals to
              <br />
              <span className="text-gradient">achieve extraordinary results</span>
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.2 }}
              className="text-lg md:text-xl text-white/50 leading-relaxed max-w-3xl mx-auto"
            >
              We're on a mission to transform the real estate industry by building the most intelligent, intuitive, and powerful CRM platform ever created. Our vision is a world where every agent has the tools to succeed.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Mission & Vision Cards */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ ...spring }}
              className="relative group"
            >
              {/* Gradient border glow */}
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-[#0EA5E9]/30 via-[#0EA5E9]/10 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500 blur-[1px]" />
              <div className="relative p-10 md:p-12 rounded-3xl glass-card border-0 bg-white/[0.03]">
                {/* Icon with ambient glow */}
                <div className="relative w-16 h-16 mb-8">
                  <div className="absolute inset-0 rounded-2xl bg-[#0EA5E9]/20 blur-xl" />
                  <div className="relative w-16 h-16 rounded-2xl bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 flex items-center justify-center">
                    <Target size={32} className="text-[#0EA5E9]" />
                  </div>
                </div>
                <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold text-white mb-4">Our Mission</h2>
                <p className="text-lg text-white/50 leading-relaxed">
                  To empower real estate professionals with intelligent technology that streamlines their workflow, amplifies their impact, and helps them build lasting relationships with clients.
                </p>
                <div className="mt-8 pt-8 border-t border-white/[0.06]">
                  <p className="text-white/30 italic leading-relaxed">
                    "We exist to make real estate professionals more successful by eliminating the busywork and amplifying what matters most: relationships."
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ ...spring }}
              className="relative group"
            >
              {/* Gradient border glow */}
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-[#0EA5E9]/30 via-[#0EA5E9]/10 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500 blur-[1px]" />
              <div className="relative p-10 md:p-12 rounded-3xl glass-card border-0 bg-white/[0.03]">
                {/* Icon with ambient glow */}
                <div className="relative w-16 h-16 mb-8">
                  <div className="absolute inset-0 rounded-2xl bg-[#0EA5E9]/20 blur-xl" />
                  <div className="relative w-16 h-16 rounded-2xl bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 flex items-center justify-center">
                    <Eye size={32} className="text-[#0EA5E9]" />
                  </div>
                </div>
                <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold text-white mb-4">Our Vision</h2>
                <p className="text-lg text-white/50 leading-relaxed">
                  To become the operating system for real estate professionals worldwide—the single platform that powers every aspect of their business, from lead generation to closing and beyond.
                </p>
                <div className="mt-8 pt-8 border-t border-white/[0.06]">
                  <p className="text-white/30 italic leading-relaxed">
                    "Imagine a world where agents spend 80% of their time building relationships and only 20% on admin. That's the future we're building."
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Guiding Principles */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...spring }}
            className="text-center mb-16"
          >
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-2xl bg-[#0EA5E9]/20 blur-xl" />
              <div className="relative w-16 h-16 rounded-2xl bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 flex items-center justify-center">
                <Compass size={32} className="text-[#0EA5E9]" />
              </div>
            </div>
            <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">Our Guiding Principles</h2>
            <p className="text-xl text-white/50 max-w-2xl mx-auto">The core beliefs that shape our product and culture</p>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: stagger, hidden: {} }}
            className="grid md:grid-cols-2 gap-6"
          >
            {principles.map((principle, index) => (
              <motion.div
                key={principle.title}
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0, transition: { ...spring, delay: index * 0.1 } },
                }}
                whileHover={{ y: -4, transition: { ...spring } }}
                className="glass-card-hover p-8 rounded-2xl group"
              >
                <div className="w-14 h-14 rounded-xl bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <principle.icon size={28} className="text-[#0EA5E9]" />
                </div>
                <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-white mb-3">{principle.title}</h3>
                <p className="text-white/50 leading-relaxed">{principle.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Impact */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...spring }}
            className="text-center mb-16"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">Our Impact</h2>
            <p className="text-xl text-white/50 max-w-2xl mx-auto">Measurable results that demonstrate our commitment to agent success</p>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: stagger, hidden: {} }}
            className="grid md:grid-cols-4 gap-6"
          >
            {impact.map((item, index) => (
              <motion.div
                key={item.label}
                variants={{
                  hidden: { opacity: 0, scale: 0.9 },
                  visible: { opacity: 1, scale: 1, transition: { ...spring, delay: index * 0.1 } },
                }}
                className="glass-card p-8 rounded-2xl text-center"
              >
                <div className="font-[family-name:var(--font-sora)] text-5xl font-bold text-gradient mb-3">{item.stat}</div>
                <div className="text-white/50">{item.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* What Drives Us */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ ...spring }}
            >
              <h2 className="font-[family-name:var(--font-sora)] text-4xl font-bold text-white mb-8">What Drives Us</h2>
              <div className="space-y-8">
                <div>
                  <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-white mb-3">We've walked in your shoes</h3>
                  <p className="text-white/50 leading-relaxed">Our founders spent years in real estate, experiencing firsthand the frustrations of outdated tools and inefficient processes. We built CloAgent to solve the problems we lived with every day.</p>
                </div>
                <div>
                  <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-white mb-3">Technology should enable, not complicate</h3>
                  <p className="text-white/50 leading-relaxed">Too many CRMs are built by engineers for engineers. We believe software should be intuitive, delightful, and powerful—all at the same time.</p>
                </div>
                <div>
                  <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-white mb-3">Your success is our success</h3>
                  <p className="text-white/50 leading-relaxed">We measure our impact by the success of our users. Every feature, every decision is made with one question in mind: "Will this help agents close more deals?"</p>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ ...spring }}
              className="relative"
            >
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] aspect-square">
                {/* Layered gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/10 via-transparent to-[#0EA5E9]/5" />
                <div className="absolute inset-0 bg-gradient-to-tl from-white/[0.03] via-transparent to-transparent" />

                {/* Floating shapes */}
                <motion.div
                  animate={{ y: [-8, 8, -8], rotate: [0, 5, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-12 right-12 w-24 h-24 rounded-2xl bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 blur-[0.5px]"
                />
                <motion.div
                  animate={{ y: [6, -10, 6], rotate: [0, -3, 0] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute bottom-16 left-10 w-32 h-32 rounded-full bg-[#0EA5E9]/[0.06] border border-white/[0.06]"
                />
                <motion.div
                  animate={{ y: [-5, 12, -5], x: [-3, 5, -3] }}
                  transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-1/3 left-1/4 w-16 h-16 rounded-xl bg-white/[0.04] border border-white/[0.06] rotate-12"
                />
                <motion.div
                  animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute bottom-1/3 right-1/4 w-20 h-20 rounded-full bg-gradient-to-br from-[#0EA5E9]/15 to-transparent"
                />

                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <div className="text-center">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-2xl bg-[#0EA5E9]/30 blur-2xl scale-150" />
                      <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#0EA5E9]/70 mx-auto mb-4 flex items-center justify-center shadow-lg shadow-[#0EA5E9]/20">
                        <Heart size={48} className="text-white" />
                      </div>
                    </div>
                    <div className="text-white/30 text-sm tracking-wide">Built with passion</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...spring }}
            className="text-center mb-16"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">The Road Ahead</h2>
            <p className="text-xl text-white/50 max-w-2xl mx-auto">A glimpse into what we're building next</p>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: stagger, hidden: {} }}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {roadmap.map((quarter, index) => (
              <motion.div
                key={quarter.title}
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0, transition: { ...spring, delay: index * 0.1 } },
                }}
                className="glass-card p-6 rounded-2xl border-l-2 border-l-[#0EA5E9]/40"
              >
                <div className="inline-block px-3 py-1 rounded-full bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 mb-4">
                  <span className="text-[#0EA5E9] text-sm font-medium">{quarter.title}</span>
                </div>
                <ul className="space-y-3">
                  {quarter.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#0EA5E9]/60 mt-2 flex-shrink-0" />
                      <span className="text-white/50 text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...spring }}
            className="relative group"
          >
            {/* Gradient border with glow */}
            <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-[#0EA5E9]/40 via-[#0EA5E9]/15 to-[#0EA5E9]/5 opacity-70 group-hover:opacity-100 transition-opacity duration-500 blur-[1px]" />
            <div className="absolute -inset-4 rounded-3xl bg-[#0EA5E9]/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <div className="relative p-12 md:p-16 rounded-3xl bg-white/[0.03] backdrop-blur-sm text-center">
              <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">Join us on our mission</h2>
              <p className="text-xl text-white/50 mb-10 max-w-2xl mx-auto">Be part of the movement transforming real estate technology. Start your free trial today.</p>
              <div className="flex flex-wrap gap-4 justify-center">
                <LinkButton href="/sign-up" variant="primary">
                  Start Free Trial
                  <ArrowRight size={18} className="ml-2" />
                </LinkButton>
                <LinkButton href="/about" variant="outline">Learn More About Us</LinkButton>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
