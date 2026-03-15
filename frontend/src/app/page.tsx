"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { LinkButton } from "@/components/marketing/LinkButton";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import {
  TrendingUp,
  Users,
  Brain,
  Zap,
  CheckCircle2,
  ArrowRight,
  Star,
} from "lucide-react";

function CountUp({ end, duration = 2 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let startTime: number | null = null;
    const animateCount = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(animateCount);
    };
    requestAnimationFrame(animateCount);
  }, [isInView, end, duration]);

  return <span ref={ref}>{count}</span>;
}

const features = [
  {
    icon: Brain,
    title: "AI-Powered Insights",
    description: "Get intelligent recommendations and insights that help you close more deals faster.",
  },
  {
    icon: TrendingUp,
    title: "Visual Pipeline",
    description: "Track every deal from lead to close with our intuitive drag-and-drop pipeline.",
  },
  {
    icon: Users,
    title: "Smart Contact Management",
    description: "Organize and segment your contacts with powerful filtering and tagging.",
  },
  {
    icon: Zap,
    title: "Workflow Automation",
    description: "Automate repetitive tasks and focus on what matters: building relationships.",
  },
];

const stats = [
  { value: 98, suffix: "%", label: "Customer Satisfaction" },
  { value: 2500, suffix: "+", label: "Active Users" },
  { value: 40, suffix: "%", label: "Faster Deal Closure" },
  { value: 4, suffix: ".9★", label: "Average Rating" },
];

const testimonials = [
  {
    name: "Sarah Martinez",
    role: "Senior Real Estate Agent",
    company: "Prime Properties",
    quote: "CloAgent transformed how I manage my pipeline. I've closed 40% more deals since switching.",
    avatar: "SM",
  },
  {
    name: "Michael Chen",
    role: "Team Leader",
    company: "Urban Realty Group",
    quote: "The AI insights are incredible. It's like having a data analyst on my team 24/7.",
    avatar: "MC",
  },
  {
    name: "Jessica Williams",
    role: "Independent Broker",
    company: "Williams Real Estate",
    quote: "Finally, a CRM that doesn't feel like a chore. It's actually enjoyable to use.",
    avatar: "JW",
  },
];

export default function Home() {
  const heroRef = useRef(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 150]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0F1E36] via-[#162843] to-[#0F1E36]">
      <style>{`html, body { background-color: #0F1E36; }`}</style>
      <MarketingNav />
      <main className="overflow-hidden">
        {/* Hero Section */}
        <section ref={heroRef} className="relative min-h-screen flex items-center">
          <motion.div style={{ y, opacity }} className="w-full">
            <div className="max-w-7xl mx-auto px-6 pt-32 pb-20">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                {/* Left: Content */}
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <div className="inline-block px-4 py-2 rounded-full bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 mb-6">
                    <span className="text-[#0EA5E9] text-sm font-medium">✨ The Future of Real Estate CRM</span>
                  </div>
                  <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                    Close More Deals,
                    <br />
                    <span className="text-[#0EA5E9]">Faster Than Ever</span>
                  </h1>
                  <p className="text-xl text-white/70 mb-8 leading-relaxed">
                    CloAgent is the AI-powered CRM built exclusively for real estate professionals. Streamline your workflow, nurture leads, and grow your business with confidence.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <LinkButton href="/sign-up" variant="primary">
                      Start Free Trial
                      <ArrowRight size={18} className="ml-2" />
                    </LinkButton>
                    <LinkButton href="/features" variant="outline">Watch Demo</LinkButton>
                  </div>
                  <div className="flex items-center gap-6 mt-8 text-white/60 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-[#0EA5E9]" />
                      No credit card required
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-[#0EA5E9]" />
                      14-day free trial
                    </div>
                  </div>
                </motion.div>

                {/* Right: Product Mockup */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="relative"
                >
                  <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/20 to-transparent backdrop-blur-sm z-10" />
                    <div className="bg-[#0F1E36] p-8 aspect-[4/3] flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-20 h-20 rounded-2xl bg-[#0EA5E9] mx-auto mb-4 flex items-center justify-center">
                          <TrendingUp size={40} className="text-white" />
                        </div>
                        <div className="text-white/40 text-sm">Dashboard Preview</div>
                      </div>
                    </div>
                  </div>
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="absolute -top-4 -right-4 w-24 h-24 rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#0EA5E9]/60 blur-xl opacity-60"
                  />
                  <motion.div
                    animate={{ y: [0, 10, 0] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="absolute -bottom-4 -left-4 w-32 h-32 rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#0EA5E9]/60 blur-xl opacity-40"
                  />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Stats */}
        <section className="py-20 border-y border-white/10 bg-black/20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="text-4xl md:text-5xl font-bold text-[#0EA5E9] mb-2">
                    <CountUp end={stat.value} />
                    {stat.suffix}
                  </div>
                  <div className="text-white/60 text-sm">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Everything you need to succeed</h2>
              <p className="text-xl text-white/60 max-w-2xl mx-auto">
                Built for real estate professionals who demand the best tools to manage their business.
              </p>
            </motion.div>
            <div className="grid md:grid-cols-2 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -5 }}
                  className="group"
                >
                  <div className="relative p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all">
                    <div className="w-14 h-14 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <feature.icon size={28} className="text-[#0EA5E9]" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                    <p className="text-white/60">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mt-12"
            >
              <LinkButton href="/features" variant="outline-blue">
                View All Features
                <ArrowRight size={18} className="ml-2" />
              </LinkButton>
            </motion.div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-24 bg-black/20">
          <div className="max-w-7xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Loved by top agents</h2>
              <p className="text-xl text-white/60">See what real estate professionals are saying about CloAgent</p>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={testimonial.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={16} className="text-[#0EA5E9] fill-[#0EA5E9]" />
                    ))}
                  </div>
                  <p className="text-white/80 mb-6 italic">"{testimonial.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#0EA5E9] flex items-center justify-center text-white font-semibold">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <div className="text-white font-semibold">{testimonial.name}</div>
                      <div className="text-white/60 text-sm">{testimonial.role}, {testimonial.company}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24">
          <div className="max-w-4xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative p-12 rounded-3xl bg-gradient-to-br from-[#0EA5E9]/20 to-transparent border border-[#0EA5E9]/30 backdrop-blur-sm text-center"
            >
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Ready to transform your business?</h2>
              <p className="text-xl text-white/70 mb-8">
                Join thousands of real estate professionals already using CloAgent
              </p>
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
      </main>
      <MarketingFooter />
    </div>
  );
}
