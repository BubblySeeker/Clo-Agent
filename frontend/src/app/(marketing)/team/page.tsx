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

export default function TeamPage() {
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
              <span className="text-[#0EA5E9] text-sm font-medium">Our Team</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Meet the people behind
              <br />
              <span className="text-[#0EA5E9]">CloAgent</span>
            </h1>
            <p className="text-xl text-white/70">
              We're a diverse team of engineers, designers, and real estate experts united by a passion for building exceptional products.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Leadership */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Leadership Team</h2>
            <p className="text-white/60">The visionaries guiding CloAgent's mission</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8">
            {leadership.map((member, index) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="group"
              >
                <div className="p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all text-center">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#0EA5E9]/60 flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold group-hover:scale-110 transition-transform">
                    {member.avatar}
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-1">{member.name}</h3>
                  <p className="text-[#0EA5E9] mb-4">{member.role}</p>
                  <p className="text-white/60 text-sm mb-6">{member.bio}</p>
                  <div className="flex gap-3 justify-center">
                    <a href={member.linkedin} className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#0EA5E9] flex items-center justify-center transition-colors group/icon">
                      <Linkedin size={16} className="text-white/60 group-hover/icon:text-white" />
                    </a>
                    <a href={member.twitter} className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#0EA5E9] flex items-center justify-center transition-colors group/icon">
                      <Twitter size={16} className="text-white/60 group-hover/icon:text-white" />
                    </a>
                    <a href={`mailto:${member.email}`} className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#0EA5E9] flex items-center justify-center transition-colors group/icon">
                      <Mail size={16} className="text-white/60 group-hover/icon:text-white" />
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Grid */}
      <section className="py-24 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">The Team</h2>
            <p className="text-white/60">Talented individuals making it all happen</p>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {team.map((member, index) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -5 }}
                className="p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all text-center group"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#0EA5E9]/60 to-[#0EA5E9]/30 flex items-center justify-center mx-auto mb-3 text-white text-lg font-bold group-hover:scale-110 transition-transform">
                  {member.avatar}
                </div>
                <h3 className="text-white font-semibold mb-1">{member.name}</h3>
                <p className="text-white/60 text-sm">{member.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Our Departments</h2>
            <p className="text-white/60">Cross-functional teams working in harmony</p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {departments.map((dept, index) => (
              <motion.div
                key={dept.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm text-center"
              >
                <div className="text-4xl font-bold text-[#0EA5E9] mb-2">{dept.count}</div>
                <h3 className="text-xl font-semibold text-white mb-2">{dept.name}</h3>
                <p className="text-white/60 text-sm">{dept.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Join Us */}
      <section className="py-24 bg-black/20">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative p-12 rounded-3xl bg-gradient-to-br from-[#0EA5E9]/20 to-transparent border border-[#0EA5E9]/30 backdrop-blur-sm text-center"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Join our growing team</h2>
            <p className="text-xl text-white/70 mb-8">We're always looking for talented, passionate people to join us on our mission.</p>
            <div className="flex flex-col md:flex-row gap-4 justify-center">
              <a href="mailto:careers@cloagent.com" className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-[#0EA5E9] hover:bg-[#0EA5E9]/90 text-white font-medium transition-colors">
                View Open Positions
              </a>
              <a href="mailto:careers@cloagent.com" className="inline-flex items-center justify-center px-8 py-3 rounded-lg border border-white/20 text-white hover:bg-white/10 font-medium transition-colors">
                Send Your Resume
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Culture */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Life at CloAgent</h2>
            <p className="text-white/60 max-w-2xl mx-auto">We believe in creating an environment where people can do their best work.</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6">
            {perks.map((perk, index) => (
              <motion.div
                key={perk.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
              >
                <h3 className="text-lg font-semibold text-white mb-2">{perk.title}</h3>
                <p className="text-white/60 text-sm">{perk.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
