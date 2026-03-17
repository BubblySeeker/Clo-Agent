"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LinkButton } from "@/components/marketing/LinkButton";
import { Check, ArrowRight, Sparkles } from "lucide-react";

const plans = [
  {
    name: "Starter",
    description: "Perfect for individual agents getting started",
    monthlyPrice: 29,
    annualPrice: 24,
    features: [
      "Up to 500 contacts",
      "Basic pipeline management",
      "Email integration",
      "Mobile app access",
      "Basic reporting",
      "Email support",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Professional",
    description: "For growing teams and power users",
    monthlyPrice: 79,
    annualPrice: 65,
    features: [
      "Unlimited contacts",
      "Advanced pipeline & automation",
      "AI-powered insights",
      "Custom fields & tags",
      "Advanced analytics",
      "Workflow automation",
      "SMS integration",
      "Priority support",
      "Team collaboration",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    description: "For large teams with advanced needs",
    monthlyPrice: 199,
    annualPrice: 165,
    features: [
      "Everything in Professional",
      "Dedicated account manager",
      "Custom integrations",
      "Advanced security & compliance",
      "SSO & SAML",
      "Custom training",
      "SLA guarantee",
      "API access",
      "White-label options",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

const faqs = [
  { question: "Can I change plans later?", answer: "Yes! You can upgrade or downgrade your plan at any time. Changes are prorated automatically." },
  { question: "What payment methods do you accept?", answer: "We accept all major credit cards (Visa, Mastercard, Amex) and ACH transfers for Enterprise plans." },
  { question: "Is there a setup fee?", answer: "No setup fees. You only pay for your subscription. We even provide free onboarding assistance." },
  { question: "What happens after my trial ends?", answer: "After your 14-day trial, you can choose a plan or your account will revert to our free tier with limited features." },
  { question: "Can I cancel anytime?", answer: "Absolutely. There are no long-term contracts. Cancel anytime with one click from your settings." },
  { question: "Do you offer discounts for non-profits?", answer: "Yes! We offer 50% off for qualified non-profit organizations. Contact sales for details." },
];

const comparisonRows = [
  { feature: "Contacts", values: ["500", "Unlimited", "Unlimited"] },
  { feature: "AI Insights", values: ["-", "check", "check"] },
  { feature: "Automation", values: ["-", "check", "check"] },
  { feature: "Custom Fields", values: ["-", "check", "check"] },
  { feature: "API Access", values: ["-", "-", "check"] },
  { feature: "SSO/SAML", values: ["-", "-", "check"] },
];

const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="pt-32 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="text-center max-w-3xl mx-auto"
          >
            <motion.div variants={fadeUp} className="inline-block px-4 py-2 rounded-full bg-[#2563EB]/10 border border-[#2563EB]/20 mb-8">
              <span className="text-[#2563EB] text-sm font-medium tracking-wide uppercase">Pricing</span>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="font-[family-name:var(--font-sora)] text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight"
            >
              Simple, <span className="text-gradient-blue">transparent</span> pricing
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg md:text-xl text-slate-400 mb-10 leading-relaxed">
              Choose the perfect plan for your business. All plans include a 14-day free trial.
            </motion.p>

            {/* Billing Toggle */}
            <motion.div variants={fadeUp} className="inline-flex items-center gap-1 p-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className="relative px-6 py-2.5 rounded-full text-sm font-medium transition-colors duration-300"
              >
                {billingPeriod === "monthly" && (
                  <motion.div
                    layoutId="billing-indicator"
                    className="absolute inset-0 rounded-full bg-[#2563EB]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className={`relative z-10 ${billingPeriod === "monthly" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}>
                  Monthly
                </span>
              </button>
              <button
                onClick={() => setBillingPeriod("annual")}
                className="relative px-6 py-2.5 rounded-full text-sm font-medium transition-colors duration-300 flex items-center gap-2"
              >
                {billingPeriod === "annual" && (
                  <motion.div
                    layoutId="billing-indicator"
                    className="absolute inset-0 rounded-full bg-[#2563EB]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className={`relative z-10 ${billingPeriod === "annual" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}>
                  Annual
                </span>
                <span className="relative z-10 text-xs bg-[#2563EB]/20 px-2 py-0.5 rounded-full text-slate-300">
                  Save 20%
                </span>
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="grid md:grid-cols-3 gap-6 lg:gap-8 items-start"
          >
            {plans.map((plan) => (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                whileHover={{ y: -6, transition: { duration: 0.3 } }}
                className={`relative bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 lg:p-10 ${
                  plan.popular
                    ? "border-[#2563EB]/20 shadow-[0_0_60px_-12px_rgba(37,99,235,0.15)] md:scale-[1.04]"
                    : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="relative px-5 py-1.5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white text-xs font-semibold tracking-wide uppercase flex items-center gap-1.5 overflow-hidden">
                      <div className="absolute inset-0 shimmer-btn" />
                      <Sparkles size={13} className="relative z-10" />
                      <span className="relative z-10">Most Popular</span>
                    </div>
                  </div>
                )}

                <div className="mb-8">
                  <h3 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-white mb-2">{plan.name}</h3>
                  <p className="text-slate-500 text-sm">{plan.description}</p>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-500 text-2xl">$</span>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`${plan.name}-${billingPeriod}`}
                        initial={{ opacity: 0, scale: 0.9, y: 4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -4 }}
                        transition={{ duration: 0.25 }}
                        className="text-5xl font-bold text-white font-[family-name:var(--font-sora)] tabular-nums"
                      >
                        {billingPeriod === "monthly" ? plan.monthlyPrice : plan.annualPrice}
                      </motion.span>
                    </AnimatePresence>
                    <span className="text-slate-500 text-sm">/month</span>
                  </div>
                  <div className="h-5 mt-2">
                    {billingPeriod === "annual" && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-slate-500 text-sm"
                      >
                        Billed annually at ${plan.annualPrice * 12}
                      </motion.p>
                    )}
                  </div>
                </div>

                <LinkButton
                  href={plan.name === "Enterprise" ? "mailto:sales@cloagent.com" : "/sign-up"}
                  variant={plan.popular ? "primary" : "outline"}
                  className={`w-full mb-8 ${!plan.popular ? "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.08]" : ""}`}
                >
                  {plan.cta}
                  {plan.name !== "Enterprise" && <ArrowRight size={16} className="ml-2" />}
                </LinkButton>

                <div className="space-y-3.5">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#2563EB]/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check size={12} className="text-[#2563EB]" />
                      </div>
                      <span className="text-slate-400 text-sm leading-relaxed">{feature}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.h2 variants={fadeUp} className="font-[family-name:var(--font-sora)] text-4xl font-bold text-white mb-4">
              Compare all <span className="text-gradient-blue">features</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-slate-500">See what&apos;s included in each plan</motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left py-5 px-6 text-slate-400 text-xs font-semibold uppercase tracking-wider">Feature</th>
                    <th className="text-center py-5 px-6 text-slate-400 text-xs font-semibold uppercase tracking-wider">Starter</th>
                    <th className="text-center py-5 px-6 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <span className="text-gradient-blue">Professional</span>
                    </th>
                    <th className="text-center py-5 px-6 text-slate-400 text-xs font-semibold uppercase tracking-wider">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, rowIndex) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-white/[0.06] ${rowIndex % 2 === 0 ? "bg-white/[0.02]" : ""}`}
                    >
                      <td className="py-4 px-6 text-slate-400 text-sm">{row.feature}</td>
                      {row.values.map((value, i) => (
                        <td key={i} className="text-center py-4 px-6">
                          {value === "check" ? (
                            <div className="inline-flex w-5 h-5 rounded-full bg-[#2563EB]/[0.08] items-center justify-center">
                              <Check size={12} className="text-[#2563EB]" />
                            </div>
                          ) : value === "-" ? (
                            <span className="text-slate-500">&mdash;</span>
                          ) : (
                            <span className="text-slate-400 text-sm">{value}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.h2 variants={fadeUp} className="font-[family-name:var(--font-sora)] text-4xl font-bold text-white mb-4">
              Frequently asked <span className="text-gradient-blue">questions</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-slate-500">Everything you need to know about pricing</motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger}
            className="grid md:grid-cols-2 gap-4"
          >
            {faqs.map((faq) => (
              <motion.div
                key={faq.question}
                variants={fadeUp}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.15]"
              >
                <h3 className="font-[family-name:var(--font-sora)] text-base font-semibold text-white mb-2">{faq.question}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{faq.answer}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative p-12 md:p-16 rounded-3xl text-center overflow-hidden"
          >
            {/* Gradient border glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#2563EB]/20 via-[#3B82F6]/10 to-[#6366F1]/10 p-px">
              <div className="absolute inset-px rounded-[23px] bg-white/[0.04]" />
            </div>
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-3xl shadow-[0_0_80px_-20px_rgba(37,99,235,0.2)]" />

            <div className="relative z-10">
              <h2 className="font-[family-name:var(--font-sora)] text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                Still have <span className="text-gradient-blue">questions</span>?
              </h2>
              <p className="text-lg text-slate-400 mb-10 max-w-lg mx-auto leading-relaxed">
                Our team is here to help. Schedule a demo or reach out to sales.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <LinkButton href="/sign-up" variant="primary">
                  Start Free Trial
                  <ArrowRight size={18} className="ml-2" />
                </LinkButton>
                <a
                  href="mailto:sales@cloagent.com"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3 text-sm font-medium transition-all duration-300 border border-white/[0.1] text-slate-300 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.2]"
                >
                  Contact Sales
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
