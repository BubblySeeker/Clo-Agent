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

export default function FeaturesPage() {
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
              <span className="text-[#0EA5E9] text-sm font-medium">Features</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Everything you need to
              <br />
              <span className="text-[#0EA5E9]">dominate your market</span>
            </h1>
            <p className="text-xl text-white/70">
              CloAgent combines powerful features with an intuitive interface to help you close more deals and grow your real estate business.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="space-y-24">
            {mainFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="grid md:grid-cols-2 gap-12 items-center"
              >
                <div className={index % 2 === 1 ? "md:order-2" : ""}>
                  <div className="w-16 h-16 rounded-2xl bg-[#0EA5E9]/10 flex items-center justify-center mb-6">
                    <feature.icon size={32} className="text-[#0EA5E9]" />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{feature.title}</h2>
                  <p className="text-lg text-white/70 mb-6">{feature.description}</p>
                  <ul className="space-y-3">
                    {feature.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-[#0EA5E9]/20 flex items-center justify-center flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-[#0EA5E9]" />
                        </div>
                        <span className="text-white/80">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={index % 2 === 1 ? "md:order-1" : ""}>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/20 to-transparent backdrop-blur-sm z-10" />
                    <div className="bg-[#0F1E36] p-12 aspect-[4/3] flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-24 h-24 rounded-2xl bg-[#0EA5E9] mx-auto mb-4 flex items-center justify-center">
                          <feature.icon size={48} className="text-white" />
                        </div>
                        <div className="text-white/40 text-sm">{feature.title}</div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Features Grid */}
      <section className="py-24 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">And so much more</h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">Every feature you need to run a modern real estate business</p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {additionalFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -5 }}
                className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon size={24} className="text-[#0EA5E9]" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-white/60 text-sm">{feature.description}</p>
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
            className="text-center max-w-3xl mx-auto"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Integrates with your favorite tools</h2>
            <p className="text-xl text-white/60 mb-12">Connect CloAgent with the tools you already use. Seamless integration with email, calendar, MLS, and more.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
              {["Gmail", "Outlook", "Zillow", "MLS", "Slack", "Zapier", "Calendly", "Stripe"].map((tool, index) => (
                <motion.div
                  key={tool}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="p-6 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white font-semibold hover:bg-white/10 transition-colors"
                >
                  {tool}
                </motion.div>
              ))}
            </div>
            <p className="text-white/60 text-sm mb-6">And 100+ more integrations via Zapier</p>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative p-12 rounded-3xl bg-gradient-to-br from-[#0EA5E9]/20 to-transparent border border-[#0EA5E9]/30 backdrop-blur-sm text-center"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Experience all features free for 14 days</h2>
            <p className="text-xl text-white/70 mb-8">No credit card required. Get started in minutes.</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <LinkButton href="/sign-up" variant="primary">
                Start Free Trial
                <ArrowRight size={18} className="ml-2" />
              </LinkButton>
              <LinkButton href="/pricing" variant="outline">View Pricing</LinkButton>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
