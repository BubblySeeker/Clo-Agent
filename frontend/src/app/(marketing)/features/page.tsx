"use client";

import { motion } from "framer-motion";
import { LinkButton } from "@/components/marketing/LinkButton";
import {
  Brain, GitBranch, Users, BarChart2, Zap, Calendar,
  MessageSquare, FileText, TrendingUp, Shield, Clock,
  Smartphone, ArrowRight,
} from "lucide-react";

const mainFeatures = [
  {
    icon: Brain,
    title: "AI-Powered Assistant",
    description: "Get intelligent insights and recommendations powered by advanced AI. Automate follow-ups, predict deal outcomes, and receive personalized suggestions.",
    benefits: ["Smart lead scoring", "Automated follow-up suggestions", "Predictive analytics", "Natural language queries"],
  },
  {
    icon: GitBranch,
    title: "Visual Pipeline Management",
    description: "Drag-and-drop deals through customizable stages. Get a bird's-eye view of your entire sales process and never lose track of opportunities.",
    benefits: ["Customizable stages", "Drag-and-drop interface", "Real-time updates", "Deal value tracking"],
  },
  {
    icon: Users,
    title: "Smart Contact Management",
    description: "Organize contacts with powerful segmentation, tagging, and filtering. Track every interaction and never miss important context.",
    benefits: ["Advanced filtering", "Custom fields", "Interaction history", "Bulk actions"],
  },
  {
    icon: BarChart2,
    title: "Advanced Analytics & Reporting",
    description: "Make data-driven decisions with comprehensive reports and real-time dashboards. Track KPIs, conversion rates, and team performance.",
    benefits: ["Customizable dashboards", "Export reports", "Team leaderboards", "Trend analysis"],
  },
];

const additionalFeatures = [
  { icon: Zap, title: "Workflow Automation", description: "Automate repetitive tasks and save hours every week" },
  { icon: Calendar, title: "Smart Calendar", description: "Schedule meetings and set reminders effortlessly" },
  { icon: MessageSquare, title: "Built-in Communication", description: "Email and SMS integration for seamless outreach" },
  { icon: FileText, title: "Document Management", description: "Store and share documents with clients securely" },
  { icon: TrendingUp, title: "Lead Tracking", description: "Monitor lead sources and optimize your marketing" },
  { icon: Shield, title: "Enterprise Security", description: "Bank-level encryption and data protection" },
  { icon: Clock, title: "Activity Timeline", description: "Complete history of all interactions and touchpoints" },
  { icon: Smartphone, title: "Mobile App", description: "Full-featured iOS and Android apps" },
];

const springTransition = { type: "spring" as const, stiffness: 100, damping: 20 };

const meshGradients = [
  "radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.05) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(37,99,235,0.04) 0%, transparent 50%)",
  "radial-gradient(ellipse at 80% 50%, rgba(37,99,235,0.08) 0%, transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(56,189,248,0.05) 0%, transparent 50%), radial-gradient(ellipse at 50% 20%, rgba(99,102,241,0.04) 0%, transparent 50%)",
  "radial-gradient(ellipse at 50% 30%, rgba(37,99,235,0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(125,211,252,0.05) 0%, transparent 50%), radial-gradient(ellipse at 20% 60%, rgba(99,102,241,0.04) 0%, transparent 50%)",
  "radial-gradient(ellipse at 30% 70%, rgba(37,99,235,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(56,189,248,0.04) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.05) 0%, transparent 50%)",
];

export default function FeaturesPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springTransition}
            className="text-center max-w-3xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springTransition, delay: 0.1 }}
              className="inline-block px-4 py-2 rounded-full bg-[#2563EB]/10 border border-[#2563EB]/20 mb-8"
            >
              <span className="text-[#2563EB] text-sm font-medium tracking-wide">Features</span>
            </motion.div>
            <h1 className="font-[family-name:var(--font-sora)] text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Everything you need to
              <br />
              <span className="text-gradient-blue">dominate your market</span>
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-xl text-slate-400 leading-relaxed"
            >
              CloAgent combines powerful features with an intuitive interface to help you close more deals and grow your real estate business.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Main Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="space-y-32">
            {mainFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ ...springTransition, delay: 0.1 }}
                className="grid md:grid-cols-2 gap-16 items-center"
              >
                <div className={index % 2 === 1 ? "md:order-2" : ""}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ ...springTransition, delay: 0.2 }}
                    className="w-14 h-14 rounded-2xl bg-[#2563EB]/10 flex items-center justify-center mb-6 group/icon relative"
                  >
                    <div className="absolute inset-0 rounded-2xl bg-[#2563EB]/20 opacity-0 blur-xl transition-opacity duration-500 group-hover/icon:opacity-100" />
                    <feature.icon size={28} className="text-[#2563EB] relative z-10" />
                  </motion.div>
                  <h2 className="font-[family-name:var(--font-sora)] text-3xl md:text-4xl font-bold text-white mb-4">
                    {feature.title}
                  </h2>
                  <p className="text-lg text-slate-400 mb-8 leading-relaxed">{feature.description}</p>
                  <ul className="space-y-4">
                    {feature.benefits.map((benefit, bIdx) => (
                      <motion.li
                        key={benefit}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ ...springTransition, delay: 0.3 + bIdx * 0.08 }}
                        className="flex items-center gap-3"
                      >
                        <div className="relative flex items-center justify-center flex-shrink-0">
                          <span className="absolute w-4 h-4 rounded-full bg-[#2563EB]/20 animate-ping" style={{ animationDuration: "3s" }} />
                          <span className="relative w-2 h-2 rounded-full bg-[#2563EB]" />
                        </div>
                        <span className="text-slate-400">{benefit}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
                <div className={index % 2 === 1 ? "md:order-1" : ""}>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    transition={springTransition}
                    className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl group"
                  >
                    {/* Gradient mesh overlay */}
                    <div
                      className="absolute inset-0 z-20 opacity-60 group-hover:opacity-80 transition-opacity duration-700"
                      style={{ background: meshGradients[index] }}
                    />
                    {/* Subtle grid pattern */}
                    <div
                      className="absolute inset-0 z-10 opacity-[0.06]"
                      style={{
                        backgroundImage: "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                      }}
                    />
                    <div className="relative bg-white/[0.03] aspect-[4/3] flex items-center justify-center">
                      {/* Abstract glow orbs */}
                      <div className="absolute w-32 h-32 rounded-full bg-[#2563EB]/20 blur-3xl top-1/4 left-1/4 group-hover:bg-[#2563EB]/30 transition-colors duration-700" />
                      <div className="absolute w-24 h-24 rounded-full bg-[#6366F1]/15 blur-3xl bottom-1/4 right-1/4 group-hover:bg-[#6366F1]/25 transition-colors duration-700" />
                      <div className="absolute w-16 h-16 rounded-full bg-[#38BDF8]/20 blur-2xl top-1/2 right-1/3 group-hover:bg-[#38BDF8]/30 transition-colors duration-700" />
                      {/* Floating icon */}
                      <motion.div
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="relative z-30"
                      >
                        <feature.icon size={48} className="text-slate-500" strokeWidth={1} />
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Features Grid */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={springTransition}
            className="text-center mb-16"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">
              And <span className="text-gradient-blue">so much more</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">Every feature you need to run a modern real estate business</p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {additionalFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...springTransition, delay: index * 0.06 }}
                whileHover={{ y: -6 }}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl hover:shadow-lg hover:border-white/[0.15] transition-all duration-300 p-6 group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#2563EB]/10 flex items-center justify-center mb-4 relative">
                  <div className="absolute inset-0 rounded-xl bg-[#2563EB]/20 opacity-0 blur-lg group-hover:opacity-100 transition-opacity duration-500" />
                  <feature.icon size={24} className="text-[#2563EB] relative z-10 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={springTransition}
            className="text-center max-w-3xl mx-auto"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">
              Integrates with your <span className="text-gradient-blue">favorite tools</span>
            </h2>
            <p className="text-xl text-slate-400 mb-12 leading-relaxed">Connect CloAgent with the tools you already use. Seamless integration with email, calendar, MLS, and more.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
              {["Gmail", "Outlook", "Zillow", "MLS", "Slack", "Zapier", "Calendly", "Stripe"].map((tool, index) => (
                <motion.div
                  key={tool}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ ...springTransition, delay: index * 0.06 }}
                  whileHover={{
                    scale: 1.05,
                    borderColor: "rgba(37, 99, 235, 0.3)",
                    boxShadow: "0 0 20px rgba(37, 99, 235, 0.1)",
                  }}
                  className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-center justify-center font-[family-name:var(--font-sora)] text-white font-semibold transition-colors duration-300 cursor-default"
                >
                  {tool}
                </motion.div>
              ))}
            </div>
            <p className="text-slate-400 text-sm mb-6">And 100+ more integrations via Zapier</p>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={springTransition}
            className="relative p-12 rounded-3xl text-center overflow-hidden"
          >
            {/* Animated border glow */}
            <div className="absolute inset-0 rounded-3xl animate-border-glow p-px">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#2563EB]/20 via-transparent to-[#6366F1]/20" />
            </div>
            {/* Inner background */}
            <div className="absolute inset-px rounded-[23px] bg-white/[0.02] backdrop-blur-sm" />
            {/* Border */}
            <div className="absolute inset-0 rounded-3xl border border-white/[0.08]" />
            {/* Content */}
            <div className="relative z-10">
              <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4">
                Experience all features <span className="text-gradient-blue">free for 14 days</span>
              </h2>
              <p className="text-xl text-slate-400 mb-8">No credit card required. Get started in minutes.</p>
              <div className="flex flex-wrap gap-4 justify-center">
                <LinkButton href="/sign-up" variant="primary">
                  Start Free Trial
                  <ArrowRight size={18} className="ml-2" />
                </LinkButton>
                <LinkButton href="/pricing" variant="outline">View Pricing</LinkButton>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
