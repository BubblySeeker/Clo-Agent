"use client";

import { motion } from "framer-motion";
import { LinkButton } from "@/components/marketing/LinkButton";
import { Target, Users, Lightbulb, Heart, TrendingUp, Award, ArrowRight } from "lucide-react";

const values = [
  { icon: Target, title: "Customer First", description: "Every decision we make starts with our customers. Their success is our success." },
  { icon: Lightbulb, title: "Innovation", description: "We continuously push boundaries to create cutting-edge solutions that transform real estate." },
  { icon: Heart, title: "Integrity", description: "We build trust through transparency, honesty, and ethical business practices." },
  { icon: Users, title: "Collaboration", description: "Great things happen when talented people work together toward a common goal." },
];

const milestones = [
  { year: "2021", title: "Founded", description: "CloAgent was born from a frustration with outdated CRM tools in real estate." },
  { year: "2022", title: "First 1,000 Users", description: "Reached our first major milestone with agents across 5 states." },
  { year: "2023", title: "Series A Funding", description: "Raised $12M to expand our team and accelerate product development." },
  { year: "2024", title: "AI Features Launch", description: "Introduced AI-powered insights and automation to help agents work smarter." },
  { year: "2025", title: "10,000+ Active Users", description: "Became the fastest-growing CRM platform for real estate professionals." },
  { year: "2026", title: "Global Expansion", description: "Expanding to international markets with multi-language support." },
];

const stats = [
  { icon: Users, value: "10,000+", label: "Active Users" },
  { icon: TrendingUp, value: "$2.5B+", label: "Deals Closed" },
  { icon: Award, value: "98%", label: "Satisfaction Rate" },
];

export default function AboutPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="inline-block px-4 py-2 rounded-full bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 mb-6">
              <span className="text-[#0EA5E9] text-sm font-medium">About Us</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              We're building the future of
              <br />
              <span className="text-[#0EA5E9]">real estate CRM</span>
            </h1>
            <p className="text-xl text-white/70">
              CloAgent was founded by real estate professionals who were tired of clunky, outdated CRM systems. We set out to build something better—a platform that's powerful yet intuitive, and designed specifically for the way agents work today.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#0EA5E9]/10 flex items-center justify-center mx-auto mb-4">
                  <stat.icon size={32} className="text-[#0EA5E9]" />
                </div>
                <div className="text-4xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-white/60">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <h2 className="text-4xl font-bold text-white mb-6">Our Story</h2>
              <div className="space-y-4 text-white/70 text-lg">
                <p>
                  In 2021, our founders—experienced real estate agents and technology leaders—sat down over coffee to discuss a shared frustration: existing CRM tools were built for generic sales teams, not real estate professionals.
                </p>
                <p>
                  They envisioned a platform that understood the unique challenges of real estate—long sales cycles, complex relationships, and the need for mobility. A tool that would save time instead of creating busywork.
                </p>
                <p>
                  That vision became CloAgent. Today, we're proud to serve thousands of agents, brokers, and teams who are closing more deals and spending less time on administrative tasks.
                </p>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/20 to-transparent backdrop-blur-sm z-10" />
                <div className="bg-[#0F1E36] p-12 aspect-[4/3] flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-2xl bg-[#0EA5E9] mx-auto mb-4 flex items-center justify-center">
                      <Users size={48} className="text-white" />
                    </div>
                    <div className="text-white/40 text-sm">Building the future together</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Our Core Values</h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">The principles that guide everything we do</p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all group"
              >
                <div className="w-14 h-14 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <value.icon size={28} className="text-[#0EA5E9]" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{value.title}</h3>
                <p className="text-white/60">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Our Journey</h2>
            <p className="text-xl text-white/60">Key milestones that shaped CloAgent</p>
          </motion.div>
          <div className="space-y-8">
            {milestones.map((milestone, index) => (
              <motion.div
                key={milestone.year}
                initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex gap-6 items-start"
              >
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-[#0EA5E9] flex items-center justify-center text-white font-bold flex-shrink-0">
                    {milestone.year.slice(-2)}
                  </div>
                  {index < milestones.length - 1 && (
                    <div className="w-0.5 h-full bg-[#0EA5E9]/20 mt-2" />
                  )}
                </div>
                <div className="flex-1 pb-8">
                  <div className="text-[#0EA5E9] font-semibold mb-1">{milestone.year}</div>
                  <h3 className="text-xl font-semibold text-white mb-2">{milestone.title}</h3>
                  <p className="text-white/60">{milestone.description}</p>
                </div>
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
            <p className="text-xl text-white/70 mb-8">We're looking for talented people to help shape the future of real estate technology.</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <LinkButton href="/team" variant="primary">
                Meet the Team
                <ArrowRight size={18} className="ml-2" />
              </LinkButton>
              <a href="mailto:careers@cloagent.com" className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-sm font-medium transition-all border border-white/20 text-white hover:bg-white/10">Join Our Team</a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
