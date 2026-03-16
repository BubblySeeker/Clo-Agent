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

const spring = { type: "spring", stiffness: 80, damping: 20 };
const springFast = { type: "spring", stiffness: 120, damping: 18 };

export default function AboutPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
            className="text-center max-w-3xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springFast, delay: 0.1 }}
              className="inline-block px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm mb-8"
            >
              <span className="text-white/50 text-sm font-medium tracking-wide uppercase">About Us</span>
            </motion.div>
            <h1 className="font-[family-name:var(--font-sora)] text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-[1.1]">
              We&apos;re building the future of
              <br />
              <span className="text-gradient">real estate CRM</span>
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.2 }}
              className="text-lg md:text-xl text-white/50 leading-relaxed max-w-2xl mx-auto"
            >
              CloAgent was founded by real estate professionals who were tired of clunky, outdated CRM systems. We set out to build something better—a platform that&apos;s powerful yet intuitive, and designed specifically for the way agents work today.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: index * 0.1 }}
                className="glass-card text-center p-10 group"
              >
                <div className="relative w-16 h-16 rounded-2xl bg-[#0EA5E9]/10 flex items-center justify-center mx-auto mb-5 transition-all duration-500 group-hover:bg-[#0EA5E9]/20 group-hover:shadow-[0_0_30px_rgba(14,165,233,0.2)]">
                  <stat.icon size={30} className="text-[#0EA5E9] transition-transform duration-500 group-hover:scale-110" />
                </div>
                <div className="font-[family-name:var(--font-sora)] text-4xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-white/30 text-sm tracking-wide uppercase">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={spring}
            >
              <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-8">Our Story</h2>
              <div className="space-y-5 text-white/50 text-lg leading-relaxed">
                <p>
                  In 2021, our founders—experienced real estate agents and technology leaders—sat down over coffee to discuss a shared frustration: existing CRM tools were built for generic sales teams, not real estate professionals.
                </p>
                <p>
                  They envisioned a platform that understood the unique challenges of real estate—long sales cycles, complex relationships, and the need for mobility. A tool that would save time instead of creating busywork.
                </p>
                <p>
                  That vision became CloAgent. Today, we&apos;re proud to serve thousands of agents, brokers, and teams who are closing more deals and spending less time on administrative tasks.
                </p>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={spring}
              className="relative"
            >
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl">
                {/* Layered gradient overlays for depth */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/20 via-transparent to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-tl from-[#6366F1]/10 via-transparent to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/40 z-10" />
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#0EA5E9]/10 to-transparent z-10" />
                <div className="bg-[#060B14] p-12 aspect-[4/3] flex items-center justify-center relative">
                  <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(14, 165, 233, 0.15) 0%, transparent 60%), radial-gradient(circle at 70% 60%, rgba(99, 102, 241, 0.1) 0%, transparent 50%)' }} />
                  <div className="text-center relative z-20">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#0EA5E9]/70 mx-auto mb-4 flex items-center justify-center shadow-[0_0_40px_rgba(14,165,233,0.3)]">
                      <Users size={48} className="text-white" />
                    </div>
                    <div className="text-white/30 text-sm tracking-wide">Building the future together</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={spring}
            className="text-center mb-16"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">Our Core Values</h2>
            <p className="text-lg text-white/30 max-w-2xl mx-auto">The principles that guide everything we do</p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: index * 0.1 }}
                className="glass-card-hover p-8 group cursor-default"
              >
                <div className="w-14 h-14 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center mb-5 transition-all duration-500 group-hover:bg-[#0EA5E9]/15">
                  <value.icon
                    size={28}
                    className="text-[#0EA5E9] transition-all duration-500 group-hover:scale-110 group-hover:rotate-6"
                  />
                </div>
                <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-white mb-3">{value.title}</h3>
                <p className="text-white/50 leading-relaxed">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={spring}
            className="text-center mb-20"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">Our Journey</h2>
            <p className="text-lg text-white/30">Key milestones that shaped CloAgent</p>
          </motion.div>
          <div className="relative">
            {/* Vertical glowing line */}
            <div className="absolute left-6 md:left-8 top-0 bottom-0 w-px">
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, #0EA5E9 0%, rgba(14, 165, 233, 0.4) 50%, transparent 100%)',
                }}
              />
              <div
                className="absolute inset-0 blur-sm"
                style={{
                  background: 'linear-gradient(to bottom, #0EA5E9 0%, rgba(14, 165, 233, 0.3) 40%, transparent 100%)',
                }}
              />
            </div>

            <div className="space-y-8">
              {milestones.map((milestone, index) => (
                <motion.div
                  key={milestone.year}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...spring, delay: index * 0.08 }}
                  className="relative flex gap-8 items-start pl-0"
                >
                  {/* Glowing node */}
                  <div className="relative flex-shrink-0 w-12 md:w-16 flex justify-center">
                    <div className="relative">
                      {/* Pulse glow */}
                      <div className="absolute inset-0 w-4 h-4 rounded-full bg-[#0EA5E9]/40 animate-ping" style={{ animationDuration: '3s' }} />
                      {/* Outer glow */}
                      <div className="absolute -inset-1 rounded-full bg-[#0EA5E9]/20 blur-sm" />
                      {/* Core dot */}
                      <div className="relative w-4 h-4 rounded-full bg-[#0EA5E9] shadow-[0_0_12px_rgba(14,165,233,0.5)]" />
                    </div>
                  </div>

                  {/* Content card */}
                  <div className="flex-1 glass-card p-6 mb-2">
                    <div className="text-[#0EA5E9]/70 text-sm font-medium tracking-wider uppercase mb-1">{milestone.year}</div>
                    <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-white mb-2">{milestone.title}</h3>
                    <p className="text-white/50 leading-relaxed">{milestone.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={spring}
            className="relative p-12 md:p-16 rounded-3xl text-center"
          >
            {/* Gradient border effect */}
            <div className="absolute inset-0 rounded-3xl p-px bg-gradient-to-br from-[#0EA5E9]/40 via-[#0EA5E9]/10 to-transparent">
              <div className="w-full h-full rounded-[calc(1.5rem-1px)] bg-[#060B14]" />
            </div>
            {/* Ambient glow */}
            <div className="absolute -inset-px rounded-3xl opacity-50 blur-xl bg-gradient-to-br from-[#0EA5E9]/10 via-transparent to-transparent pointer-events-none" />

            <div className="relative z-10">
              <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">Join us on our mission</h2>
              <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto leading-relaxed">
                We&apos;re looking for talented people to help shape the future of real estate technology.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <LinkButton href="/team" variant="primary">
                  Meet the Team
                  <ArrowRight size={18} className="ml-2" />
                </LinkButton>
                <a
                  href="mailto:careers@cloagent.com"
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-sm font-medium transition-all duration-300 border border-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.04] hover:border-white/[0.12]"
                >
                  Join Our Team
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
