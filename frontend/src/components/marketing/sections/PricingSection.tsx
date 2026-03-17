"use client";

import { useState, useRef, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useInView,
  useReducedMotion,
  AnimatePresence,
} from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

const TILT_MAX = 6;

interface Plan {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  cta: string;
  href: string;
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    monthlyPrice: 29,
    annualPrice: 23,
    features: ["Up to 100 contacts", "Basic pipeline management", "Email integration", "5 AI conversations/day", "Standard support"],
    cta: "Get Started",
    href: "/sign-up",
  },
  {
    name: "Professional",
    monthlyPrice: 79,
    annualPrice: 63,
    features: ["Up to 1,000 contacts", "Advanced pipeline + analytics", "Full AI assistant (unlimited)", "Buyer matching", "Task automation", "Priority support"],
    cta: "Start Free Trial",
    href: "/sign-up",
    popular: true,
  },
  {
    name: "Enterprise",
    monthlyPrice: 199,
    annualPrice: 159,
    features: ["Unlimited contacts", "Everything in Professional", "Custom integrations", "Dedicated account manager", "Team management", "White-label options"],
    cta: "Contact Sales",
    href: "/about",
  },
];

function PricingCard({ plan, annual, index, reduced }: {
  plan: Plan; annual: boolean; index: number; reduced: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-60px" });

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-TILT_MAX, TILT_MAX]), { stiffness: 200, damping: 30 });
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [TILT_MAX, -TILT_MAX]), { stiffness: 200, damping: 30 });

  const spotlightX = useMotionValue(50);
  const spotlightY = useMotionValue(50);
  const isPopular = plan.popular;
  const spotlightBg = useTransform(
    [spotlightX, spotlightY],
    ([x, y]: number[]) =>
      `radial-gradient(400px circle at ${x}px ${y}px, ${isPopular ? "#F97316" : "#2563EB"}, transparent 70%)`
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (reduced) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
    spotlightX.set(e.clientX - rect.left);
    spotlightY.set(e.clientY - rect.top);
  }, [reduced, mouseX, mouseY, spotlightX, spotlightY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);

  const price = annual ? plan.annualPrice : plan.monthlyPrice;
  const checkColor = isPopular ? "text-[#F97316]" : "text-[#2563EB]";

  const cardContent = (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={reduced ? {} : { rotateX, rotateY, transformStyle: "preserve-3d" as const }}
      className={`relative overflow-hidden rounded-2xl border flex flex-col h-full ${
        isPopular ? "border-transparent p-8 lg:p-10 bg-[#1E293B]" : "border-white/[0.1] bg-white/[0.04] p-7 lg:p-9"
      }`}
    >
      {!reduced && (
        <motion.div className="pointer-events-none absolute inset-0 z-10 rounded-2xl opacity-[0.08]" style={{ background: spotlightBg }} />
      )}

      {isPopular && (
        <div className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <span className="inline-block bg-[#F97316] text-white text-xs font-semibold font-[family-name:var(--font-josefin)] px-4 py-1 rounded-full shadow-md">
            Most Popular
          </span>
        </div>
      )}

      <h3 className="text-lg font-semibold font-[family-name:var(--font-cinzel)] text-white text-center mt-2">{plan.name}</h3>

      <div className="mt-4 mb-6">
        <div className="h-16 flex items-end justify-center overflow-hidden">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={price}
              layout
              initial={reduced ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduced ? undefined : { scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="text-5xl font-bold font-[family-name:var(--font-cinzel)] text-white"
            >
              ${price}
            </motion.span>
          </AnimatePresence>
          <span className="text-base text-slate-400 font-[family-name:var(--font-josefin)] ml-1 mb-1.5">/mo</span>
        </div>
        {annual && (
          <p className="text-center text-xs text-slate-500 font-[family-name:var(--font-josefin)] mt-1">
            billed annually (${price * 12}/yr)
          </p>
        )}
      </div>

      <div className="w-full h-px bg-white/[0.08] mb-6" />

      <ul className="flex-1 space-y-3 mb-8">
        {plan.features.map((feature, fi) => (
          <motion.li
            key={feature}
            className="flex items-start gap-2.5 text-sm font-[family-name:var(--font-josefin)] text-slate-300"
            initial={reduced ? false : { opacity: 0, x: -10 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: index * 0.15 + fi * 0.05 + 0.3 }}
          >
            <CheckCircle2 className={`w-4.5 h-4.5 mt-0.5 flex-shrink-0 ${checkColor}`} strokeWidth={2.2} />
            {feature}
          </motion.li>
        ))}
      </ul>

      {isPopular ? (
        <Link href={plan.href} className="block w-full py-3 rounded-xl bg-[#F97316] hover:bg-[#EA6C10] text-white font-semibold font-[family-name:var(--font-josefin)] text-sm text-center transition-colors shadow-lg shadow-orange-500/20">
          {plan.cta}
        </Link>
      ) : (
        <Link href={plan.href} className="block w-full py-3 rounded-xl border-2 border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB] hover:text-white font-semibold font-[family-name:var(--font-josefin)] text-sm text-center transition-colors">
          {plan.cta}
        </Link>
      )}
    </motion.div>
  );

  return (
    <motion.div
      ref={sectionRef}
      initial={{ opacity: 0, y: 60 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ type: "spring", stiffness: 80, damping: 18, delay: index * 0.15 }}
      style={reduced ? {} : { perspective: 1000 }}
      className={isPopular ? "lg:scale-[1.02] z-10" : ""}
    >
      {isPopular ? (
        <div className="relative rounded-2xl p-[2px]">
          <div
            className={`absolute inset-0 rounded-2xl ${reduced ? "" : "animate-gradient-rotate"}`}
            style={{
              background: reduced
                ? "linear-gradient(135deg, #2563EB, #F97316)"
                : "conic-gradient(from 0deg, #2563EB, #F97316, #3B82F6, #2563EB)",
            }}
          />
          <div className="relative">{cardContent}</div>
        </div>
      ) : cardContent}
    </motion.div>
  );
}

export default function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const reduced = useReducedMotion() ?? false;

  return (
    <section id="pricing" className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-[#2563EB] font-[family-name:var(--font-josefin)]">
            Pricing
          </span>
          <h2 className="mt-4 text-4xl lg:text-5xl font-bold font-[family-name:var(--font-cinzel)] text-white">
            Simple, <span className="text-gradient-blue">Transparent</span> Pricing
          </h2>
          <p className="mt-4 text-lg text-slate-400 font-[family-name:var(--font-josefin)] max-w-2xl mx-auto">
            Choose the plan that fits your business. Upgrade or downgrade anytime, no contracts.
          </p>
        </motion.div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-4 mb-14">
          <span className={`text-sm font-[family-name:var(--font-josefin)] transition-colors ${!annual ? "text-white font-semibold" : "text-slate-500"}`}>
            Monthly
          </span>
          <button
            onClick={() => setAnnual((a) => !a)}
            className="relative w-14 h-7 rounded-full bg-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            aria-label={`Switch to ${annual ? "monthly" : "annual"} billing`}
          >
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              className="absolute top-0.5 w-6 h-6 rounded-full bg-[#2563EB] shadow-md"
              style={{ left: annual ? "calc(100% - 1.625rem)" : "0.125rem" }}
            />
          </button>
          <span className={`text-sm font-[family-name:var(--font-josefin)] transition-colors ${annual ? "text-white font-semibold" : "text-slate-500"}`}>
            Annual
            <span className="ml-1.5 text-xs text-[#F97316] font-semibold">Save 20%</span>
          </span>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-4 items-start">
          {PLANS.map((plan, i) => (
            <PricingCard key={plan.name} plan={plan} annual={annual} index={i} reduced={reduced} />
          ))}
        </div>

        <p className="text-center text-sm text-slate-500 font-[family-name:var(--font-josefin)] mt-12">
          All plans include a 14-day free trial. No credit card required.
        </p>
      </div>
    </section>
  );
}
