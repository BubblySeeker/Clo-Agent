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

export default function MissionPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="inline-block px-4 py-2 rounded-full bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 mb-6">
              <span className="text-[#0EA5E9] text-sm font-medium">Our Mission</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Empowering real estate professionals to
              <br />
              <span className="text-[#0EA5E9]">achieve extraordinary results</span>
            </h1>
            <p className="text-xl text-white/70 leading-relaxed">
              We're on a mission to transform the real estate industry by building the most intelligent, intuitive, and powerful CRM platform ever created. Our vision is a world where every agent has the tools to succeed.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission & Vision Cards */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative p-10 rounded-3xl bg-gradient-to-br from-[#0EA5E9]/10 to-transparent border border-[#0EA5E9]/30 backdrop-blur-sm"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#0EA5E9]/20 flex items-center justify-center mb-6">
                <Target size={32} className="text-[#0EA5E9]" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Our Mission</h2>
              <p className="text-lg text-white/70 leading-relaxed">
                To empower real estate professionals with intelligent technology that streamlines their workflow, amplifies their impact, and helps them build lasting relationships with clients.
              </p>
              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-white/60 italic">
                  "We exist to make real estate professionals more successful by eliminating the busywork and amplifying what matters most: relationships."
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative p-10 rounded-3xl bg-gradient-to-br from-[#0EA5E9]/10 to-transparent border border-[#0EA5E9]/30 backdrop-blur-sm"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#0EA5E9]/20 flex items-center justify-center mb-6">
                <Eye size={32} className="text-[#0EA5E9]" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Our Vision</h2>
              <p className="text-lg text-white/70 leading-relaxed">
                To become the operating system for real estate professionals worldwide—the single platform that powers every aspect of their business, from lead generation to closing and beyond.
              </p>
              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-white/60 italic">
                  "Imagine a world where agents spend 80% of their time building relationships and only 20% on admin. That's the future we're building."
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Guiding Principles */}
      <section className="py-24 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <div className="w-16 h-16 rounded-2xl bg-[#0EA5E9]/20 flex items-center justify-center mx-auto mb-6">
              <Compass size={32} className="text-[#0EA5E9]" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Our Guiding Principles</h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">The core beliefs that shape our product and culture</p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6">
            {principles.map((principle, index) => (
              <motion.div
                key={principle.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all group"
              >
                <div className="w-14 h-14 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <principle.icon size={28} className="text-[#0EA5E9]" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{principle.title}</h3>
                <p className="text-white/60">{principle.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Impact */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Our Impact</h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">Measurable results that demonstrate our commitment to agent success</p>
          </motion.div>
          <div className="grid md:grid-cols-4 gap-6">
            {impact.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-2xl bg-gradient-to-br from-[#0EA5E9]/10 to-transparent border border-[#0EA5E9]/20 backdrop-blur-sm text-center"
              >
                <div className="text-5xl font-bold text-[#0EA5E9] mb-3">{item.stat}</div>
                <div className="text-white/70">{item.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What Drives Us */}
      <section className="py-24 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <h2 className="text-4xl font-bold text-white mb-6">What Drives Us</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-3">We've walked in your shoes</h3>
                  <p className="text-white/70">Our founders spent years in real estate, experiencing firsthand the frustrations of outdated tools and inefficient processes. We built CloAgent to solve the problems we lived with every day.</p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-3">Technology should enable, not complicate</h3>
                  <p className="text-white/70">Too many CRMs are built by engineers for engineers. We believe software should be intuitive, delightful, and powerful—all at the same time.</p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-3">Your success is our success</h3>
                  <p className="text-white/70">We measure our impact by the success of our users. Every feature, every decision is made with one question in mind: "Will this help agents close more deals?"</p>
                </div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/20 to-transparent backdrop-blur-sm z-10" />
                <div className="bg-[#0F1E36] p-12 aspect-square flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-2xl bg-[#0EA5E9] mx-auto mb-4 flex items-center justify-center">
                      <Heart size={48} className="text-white" />
                    </div>
                    <div className="text-white/40 text-sm">Built with passion</div>
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
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">The Road Ahead</h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">A glimpse into what we're building next</p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {roadmap.map((quarter, index) => (
              <motion.div
                key={quarter.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
              >
                <div className="text-[#0EA5E9] font-semibold mb-4">{quarter.title}</div>
                <ul className="space-y-3">
                  {quarter.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#0EA5E9] mt-2 flex-shrink-0" />
                      <span className="text-white/70 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-black/20">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative p-12 rounded-3xl bg-gradient-to-br from-[#0EA5E9]/20 to-transparent border border-[#0EA5E9]/30 backdrop-blur-sm text-center"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Join us on our mission</h2>
            <p className="text-xl text-white/70 mb-8">Be part of the movement transforming real estate technology. Start your free trial today.</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <LinkButton href="/sign-up" variant="primary">
                Start Free Trial
                <ArrowRight size={18} className="ml-2" />
              </LinkButton>
              <LinkButton href="/about" variant="outline">Learn More About Us</LinkButton>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
