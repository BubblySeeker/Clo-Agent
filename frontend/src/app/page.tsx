"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useScroll, useTransform, useSpring } from "framer-motion";
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

/* ── Animation variants ─────────────────────────────────────────────── */

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 80, damping: 20 },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 70, damping: 18 },
  },
};

const heroWordReveal = {
  hidden: { opacity: 0, y: 30, filter: "blur(8px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 20,
      delay: 0.15 + i * 0.08,
    },
  }),
};

/* ── Component ──────────────────────────────────────────────────────── */

export default function Home() {
  const heroRef = useRef(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 180]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  // Smooth parallax for ambient orbs
  const orbY1 = useSpring(useTransform(scrollY, [0, 1000], [0, -120]), { stiffness: 40, damping: 30 });
  const orbY2 = useSpring(useTransform(scrollY, [0, 1000], [0, -80]), { stiffness: 30, damping: 25 });
  const orbY3 = useSpring(useTransform(scrollY, [0, 1000], [0, -60]), { stiffness: 50, damping: 35 });

  const heroLine1Words = ["Close", "More", "Deals,"];
  const heroLine2Words = ["Faster", "Than", "Ever"];

  return (
    <div className="min-h-screen bg-[#070B14]">
      <style>{`html, body { background-color: #070B14; }`}</style>
      <MarketingNav />
      <main className="overflow-hidden bg-transparent">

        {/* ━━ Hero Section ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section ref={heroRef} className="relative min-h-screen flex items-center">
          {/* Ambient glow orbs */}
          <motion.div
            style={{ y: orbY1 }}
            className="pointer-events-none absolute top-[10%] left-[8%] w-[420px] h-[420px] rounded-full bg-[#0EA5E9]/[0.07] blur-[120px]"
          />
          <motion.div
            style={{ y: orbY2 }}
            className="pointer-events-none absolute top-[30%] right-[5%] w-[350px] h-[350px] rounded-full bg-[#6366F1]/[0.06] blur-[100px]"
          />
          <motion.div
            style={{ y: orbY3 }}
            className="pointer-events-none absolute bottom-[5%] left-[40%] w-[500px] h-[500px] rounded-full bg-[#0EA5E9]/[0.04] blur-[140px]"
          />

          <motion.div style={{ y, opacity }} className="relative z-10 w-full">
            <div className="max-w-7xl mx-auto px-6 pt-32 pb-20">
              <div className="grid md:grid-cols-2 gap-16 items-center">

                {/* Left: Content */}
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {/* Badge */}
                  <motion.div variants={fadeUp} className="mb-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0EA5E9] opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0EA5E9]" />
                      </span>
                      <span className="text-white/60 text-sm font-medium">The Future of Real Estate CRM</span>
                    </div>
                  </motion.div>

                  {/* Heading with staggered word reveal */}
                  <div className="mb-8">
                    <h1 className="font-[family-name:var(--font-sora)] text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight">
                      <span className="block">
                        {heroLine1Words.map((word, i) => (
                          <motion.span
                            key={word}
                            custom={i}
                            variants={heroWordReveal}
                            initial="hidden"
                            animate="visible"
                            className="inline-block mr-[0.3em] text-white"
                          >
                            {word}
                          </motion.span>
                        ))}
                      </span>
                      <span className="block mt-1">
                        {heroLine2Words.map((word, i) => (
                          <motion.span
                            key={word}
                            custom={i + heroLine1Words.length}
                            variants={heroWordReveal}
                            initial="hidden"
                            animate="visible"
                            className="inline-block mr-[0.3em] text-gradient"
                          >
                            {word}
                          </motion.span>
                        ))}
                      </span>
                    </h1>
                  </div>

                  {/* Subheading */}
                  <motion.p
                    variants={fadeUp}
                    className="text-lg md:text-xl text-white/50 mb-10 leading-relaxed max-w-lg"
                  >
                    CloAgent is the AI-powered CRM built exclusively for real estate professionals. Streamline your workflow, nurture leads, and grow your business with confidence.
                  </motion.p>

                  {/* CTAs */}
                  <motion.div variants={fadeUp} className="flex flex-wrap gap-4">
                    <LinkButton href="/sign-up" variant="primary">
                      Start Free Trial
                      <ArrowRight size={18} className="ml-2" />
                    </LinkButton>
                    <LinkButton href="/features" variant="outline">Watch Demo</LinkButton>
                  </motion.div>

                  {/* Trust signals */}
                  <motion.div
                    variants={fadeUp}
                    className="flex items-center gap-6 mt-10 text-white/30 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-[#0EA5E9]/70" />
                      No credit card required
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-[#0EA5E9]/70" />
                      14-day free trial
                    </div>
                  </motion.div>
                </motion.div>

                {/* Right: Product Mockup */}
                <motion.div
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="relative"
                >
                  <div className="relative rounded-2xl overflow-hidden glass-card shadow-2xl shadow-[#0EA5E9]/[0.08]">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/10 via-transparent to-[#6366F1]/5 z-10" />
                    <div className="bg-transparent p-8 aspect-[4/3] flex items-center justify-center">
                      <div className="text-center">
                        <motion.div
                          animate={{ rotate: [0, 5, -5, 0] }}
                          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                          className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#0284C7] mx-auto mb-4 flex items-center justify-center shadow-lg shadow-[#0EA5E9]/30"
                        >
                          <TrendingUp size={40} className="text-white" />
                        </motion.div>
                        <div className="text-white/30 text-sm font-medium">Dashboard Preview</div>
                      </div>
                    </div>
                  </div>

                  {/* Floating glow accents */}
                  <motion.div
                    animate={{ y: [0, -14, 0], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-[#0EA5E9]/40 blur-2xl"
                  />
                  <motion.div
                    animate={{ y: [0, 12, 0], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -bottom-6 -left-6 w-36 h-36 rounded-full bg-[#6366F1]/30 blur-2xl"
                  />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ━━ Stats ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="relative py-24 border-y border-white/[0.06] bg-transparent">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.01] to-transparent" />
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="grid grid-cols-2 md:grid-cols-4 gap-8"
            >
              {stats.map((stat) => (
                <motion.div
                  key={stat.label}
                  variants={fadeUp}
                  className="relative text-center group"
                >
                  {/* Glow behind number */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-[#0EA5E9]/[0.08] blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
                  <div className="relative">
                    <div className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-gradient mb-3">
                      <CountUp end={stat.value} />
                      {stat.suffix}
                    </div>
                    <div className="text-white/30 text-sm font-medium tracking-wide uppercase">{stat.label}</div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ━━ Features Grid ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-28 bg-transparent relative">
          {/* Ambient orb */}
          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#0EA5E9]/[0.03] blur-[150px]" />

          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ type: "spring", stiffness: 60, damping: 20 }}
              className="text-center mb-20"
            >
              <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-5 tracking-tight">
                Everything you need to{" "}
                <span className="text-gradient">succeed</span>
              </h2>
              <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto">
                Built for real estate professionals who demand the best tools to manage their business.
              </p>
            </motion.div>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="grid md:grid-cols-2 gap-6"
            >
              {features.map((feature) => (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  className="group relative"
                >
                  {/* Gradient border on hover */}
                  <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-[#0EA5E9]/0 via-[#0EA5E9]/0 to-[#6366F1]/0 group-hover:from-[#0EA5E9]/30 group-hover:via-[#0EA5E9]/10 group-hover:to-[#6366F1]/20 transition-all duration-500 opacity-0 group-hover:opacity-100" />
                  <div className="relative glass-card-hover p-8 md:p-10">
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      className="w-14 h-14 rounded-xl bg-[#0EA5E9]/[0.08] border border-[#0EA5E9]/[0.12] flex items-center justify-center mb-5"
                    >
                      <feature.icon size={28} className="text-[#0EA5E9]" />
                    </motion.div>
                    <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-white mb-3 tracking-tight">
                      {feature.title}
                    </h3>
                    <p className="text-white/50 leading-relaxed">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 60, damping: 20, delay: 0.3 }}
              className="text-center mt-14"
            >
              <LinkButton href="/features" variant="outline-blue">
                View All Features
                <ArrowRight size={18} className="ml-2" />
              </LinkButton>
            </motion.div>
          </div>
        </section>

        {/* ━━ Testimonials ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-28 bg-transparent relative">
          <div className="pointer-events-none absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ type: "spring", stiffness: 60, damping: 20 }}
              className="text-center mb-20"
            >
              <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-5 tracking-tight">
                Loved by{" "}
                <span className="text-gradient">top agents</span>
              </h2>
              <p className="text-lg md:text-xl text-white/50">
                See what real estate professionals are saying about CloAgent
              </p>
            </motion.div>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="grid md:grid-cols-3 gap-6"
            >
              {testimonials.map((testimonial) => (
                <motion.div
                  key={testimonial.name}
                  variants={fadeUp}
                  whileHover={{ y: -6, transition: { type: "spring", stiffness: 300, damping: 20 } }}
                  className="group relative"
                >
                  {/* Hover glow */}
                  <div className="absolute -inset-4 rounded-3xl bg-[#0EA5E9]/[0.03] blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
                  <div className="relative glass-card-hover p-7">
                    <div className="flex gap-1 mb-5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={16} className="text-[#0EA5E9] fill-[#0EA5E9]" />
                      ))}
                    </div>
                    <p className="text-white/50 mb-7 italic leading-relaxed">
                      &ldquo;{testimonial.quote}&rdquo;
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#0284C7] flex items-center justify-center text-white text-sm font-semibold shadow-lg shadow-[#0EA5E9]/20">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <div className="text-white font-semibold text-sm">{testimonial.name}</div>
                        <div className="text-white/30 text-xs">{testimonial.role}, {testimonial.company}</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ━━ CTA Section ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-28 bg-transparent">
          <div className="max-w-4xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ type: "spring", stiffness: 60, damping: 20 }}
              className="relative"
            >
              {/* Animated gradient border */}
              <div className="absolute -inset-[1px] rounded-3xl overflow-hidden">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0%,#0EA5E9_20%,transparent_40%,#6366F1_60%,transparent_80%)]"
                />
                <div className="absolute inset-[1px] rounded-3xl bg-[#070B14]" />
              </div>

              <div className="relative glass-card rounded-3xl p-14 md:p-16 text-center overflow-hidden">
                {/* Background glow */}
                <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px] rounded-full bg-[#0EA5E9]/[0.08] blur-[100px]" />

                <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-5 tracking-tight relative z-10">
                  Ready to transform{" "}
                  <span className="text-gradient">your business?</span>
                </h2>
                <p className="text-lg md:text-xl text-white/50 mb-10 relative z-10">
                  Join thousands of real estate professionals already using CloAgent
                </p>
                <div className="flex flex-wrap gap-4 justify-center relative z-10">
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
      </main>
      <MarketingFooter />
    </div>
  );
}
