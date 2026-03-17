"use client";

import { motion } from "framer-motion";
import { Linkedin, Twitter, Mail } from "lucide-react";

const leadership = [
  {
    name: "Sarah Johnson",
    role: "Co-Founder & CEO",
    bio: "Former real estate broker with 15 years of experience. Led sales teams to close $500M+ in transactions.",
    avatar: "SJ",
    linkedin: "#",
    twitter: "#",
    email: "sarah@cloagent.com",
  },
  {
    name: "Michael Chen",
    role: "Co-Founder & CTO",
    bio: "Ex-Google engineer with expertise in AI and scalable systems. Built infrastructure serving millions of users.",
    avatar: "MC",
    linkedin: "#",
    twitter: "#",
    email: "michael@cloagent.com",
  },
  {
    name: "Jessica Martinez",
    role: "VP of Product",
    bio: "Product leader from Salesforce with a passion for user-centric design and innovation.",
    avatar: "JM",
    linkedin: "#",
    twitter: "#",
    email: "jessica@cloagent.com",
  },
];

const team = [
  { name: "David Park", role: "Head of Engineering", avatar: "DP" },
  { name: "Emily Rodriguez", role: "Head of Customer Success", avatar: "ER" },
  { name: "James Wilson", role: "Head of Marketing", avatar: "JW" },
  { name: "Lisa Thompson", role: "Head of Sales", avatar: "LT" },
  { name: "Ryan Kumar", role: "Lead AI Engineer", avatar: "RK" },
  { name: "Amanda Foster", role: "Lead Designer", avatar: "AF" },
  { name: "Chris Anderson", role: "Senior Backend Engineer", avatar: "CA" },
  { name: "Nina Patel", role: "Senior Frontend Engineer", avatar: "NP" },
  { name: "Marcus Brown", role: "Customer Success Manager", avatar: "MB" },
];

const departments = [
  { name: "Engineering", count: 12, description: "Building scalable, reliable systems" },
  { name: "Product", count: 5, description: "Crafting delightful user experiences" },
  { name: "Customer Success", count: 8, description: "Ensuring customer happiness" },
  { name: "Sales", count: 6, description: "Helping agents find the right solution" },
];

const perks = [
  { title: "Remote-First", description: "Work from anywhere in the world. We've been remote since day one." },
  { title: "Flexible Hours", description: "We trust our team to manage their own schedules and deliver great work." },
  { title: "Health & Wellness", description: "Comprehensive health insurance and wellness stipends for the whole team." },
  { title: "Learning Budget", description: "$2,000 annual budget for courses, books, and conferences." },
  { title: "Equity", description: "Everyone gets equity. When we win, everyone wins together." },
  { title: "Unlimited PTO", description: "Take the time you need to recharge. We encourage it." },
];

const stagger = {
  container: {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.08 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 120, damping: 20 },
    },
  },
};

export default function TeamPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-center max-w-3xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="inline-block px-4 py-2 rounded-full bg-blue-50 border border-blue-200/50 mb-6"
            >
              <span className="text-gradient text-sm font-medium">Our Team</span>
            </motion.div>
            <h1 className="font-[family-name:var(--font-sora)] text-5xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
              Meet the people behind
              <br />
              <span className="text-gradient">CloAgent</span>
            </h1>
            <p className="text-xl text-slate-500 leading-relaxed">
              We're a diverse team of engineers, designers, and real estate experts united by a passion for building exceptional products.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Leadership */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Leadership Team
            </h2>
            <p className="text-slate-500">The visionaries guiding CloAgent's mission</p>
          </motion.div>
          <motion.div
            variants={stagger.container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-8"
          >
            {leadership.map((member) => (
              <motion.div
                key={member.name}
                variants={stagger.item}
                whileHover={{ y: -6, transition: { type: "spring", stiffness: 300, damping: 20 } }}
                className="group"
              >
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 p-8 text-center relative overflow-hidden">
                  {/* Ambient glow behind avatar on hover */}
                  <div className="absolute top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-[#0EA5E9]/0 group-hover:bg-[#0EA5E9]/10 blur-3xl transition-all duration-700 pointer-events-none" />

                  <div className="relative mx-auto mb-5 w-32 h-32">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#0EA5E9]/40 to-[#38BDF8]/10 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative w-32 h-32 rounded-full ring-2 ring-[#0EA5E9]/30 flex items-center justify-center bg-gradient-to-br from-[#0EA5E9]/20 to-[#0EA5E9]/5 text-white text-2xl font-bold group-hover:scale-105 transition-transform duration-500">
                      {member.avatar}
                    </div>
                  </div>

                  <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-slate-900 mb-1">
                    {member.name}
                  </h3>
                  <p className="text-gradient text-sm font-medium mb-4">{member.role}</p>
                  <p className="text-slate-500 text-sm leading-relaxed mb-6">{member.bio}</p>

                  <div className="flex gap-3 justify-center">
                    <a
                      href={member.linkedin}
                      className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 hover:border-[#0EA5E9]/30 hover:bg-[#0EA5E9]/10 hover:shadow-[0_0_16px_rgba(14,165,233,0.15)] flex items-center justify-center transition-all duration-300 group/icon"
                    >
                      <Linkedin size={15} className="text-slate-400 group-hover/icon:text-slate-700 transition-colors" />
                    </a>
                    <a
                      href={member.twitter}
                      className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 hover:border-[#0EA5E9]/30 hover:bg-[#0EA5E9]/10 hover:shadow-[0_0_16px_rgba(14,165,233,0.15)] flex items-center justify-center transition-all duration-300 group/icon"
                    >
                      <Twitter size={15} className="text-slate-400 group-hover/icon:text-slate-700 transition-colors" />
                    </a>
                    <a
                      href={`mailto:${member.email}`}
                      className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 hover:border-[#0EA5E9]/30 hover:bg-[#0EA5E9]/10 hover:shadow-[0_0_16px_rgba(14,165,233,0.15)] flex items-center justify-center transition-all duration-300 group/icon"
                    >
                      <Mail size={15} className="text-slate-400 group-hover/icon:text-slate-700 transition-colors" />
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Team Grid */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              The Team
            </h2>
            <p className="text-slate-500">Talented individuals making it all happen</p>
          </motion.div>
          <motion.div
            variants={stagger.container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
          >
            {team.map((member) => (
              <motion.div
                key={member.name}
                variants={stagger.item}
                whileHover={{ y: -4, transition: { type: "spring", stiffness: 300, damping: 20 } }}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 p-5 text-center group"
              >
                <div className="relative mx-auto mb-3 w-20 h-20">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#0EA5E9]/15 to-[#38BDF8]/5 border border-slate-200 flex items-center justify-center text-white text-lg font-bold group-hover:scale-110 transition-transform duration-500">
                    {member.avatar}
                  </div>
                </div>
                <h3 className="font-[family-name:var(--font-sora)] text-slate-900 font-semibold text-sm mb-1">
                  {member.name}
                </h3>
                <p className="text-slate-400 text-xs">{member.role}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Departments */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Our Departments
            </h2>
            <p className="text-slate-500">Cross-functional teams working in harmony</p>
          </motion.div>
          <motion.div
            variants={stagger.container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {departments.map((dept) => (
              <motion.div
                key={dept.name}
                variants={stagger.item}
                whileHover={{ y: -4, transition: { type: "spring", stiffness: 300, damping: 20 } }}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center"
              >
                <div className="text-5xl font-bold text-gradient mb-3 font-[family-name:var(--font-sora)]">
                  {dept.count}
                </div>
                <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-slate-900 mb-2">
                  {dept.name}
                </h3>
                <p className="text-slate-500 text-sm">{dept.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Join Us */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="relative"
          >
            {/* Ambient glow */}
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-[#0EA5E9]/20 via-transparent to-[#38BDF8]/10 pointer-events-none" />
            <div className="absolute inset-0 rounded-3xl bg-[#0EA5E9]/[0.03] blur-2xl pointer-events-none" />

            <div className="relative p-12 rounded-3xl bg-white border border-slate-200 rounded-2xl shadow-sm text-center overflow-hidden">
              {/* Gradient border overlay */}
              <div className="absolute inset-0 rounded-3xl border border-gradient-to-br from-[#0EA5E9]/20 to-transparent pointer-events-none" />

              <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
                Join our growing team
              </h2>
              <p className="text-lg text-slate-500 mb-8 max-w-xl mx-auto leading-relaxed">
                We're always looking for talented, passionate people to join us on our mission.
              </p>
              <div className="flex flex-col md:flex-row gap-4 justify-center">
                <motion.a
                  href="mailto:careers@cloagent.com"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 hover:shadow-[0_0_32px_rgba(14,165,233,0.3)] text-white font-medium transition-all duration-300"
                >
                  View Open Positions
                </motion.a>
                <motion.a
                  href="mailto:careers@cloagent.com"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 font-medium transition-all duration-300"
                >
                  Send Your Resume
                </motion.a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Culture / Perks */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-[family-name:var(--font-sora)] text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Life at CloAgent
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto">
              We believe in creating an environment where people can do their best work.
            </p>
          </motion.div>
          <motion.div
            variants={stagger.container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-5"
          >
            {perks.map((perk) => (
              <motion.div
                key={perk.title}
                variants={stagger.item}
                whileHover={{ x: 4, transition: { type: "spring", stiffness: 300, damping: 20 } }}
                className="p-6 rounded-xl bg-white border border-slate-200 border-l-2 border-l-blue-400 transition-all duration-300 hover:bg-slate-50 hover:border-l-blue-500"
              >
                <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-slate-900 mb-2">
                  {perk.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">{perk.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
