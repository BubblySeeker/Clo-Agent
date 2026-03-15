"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

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
              <span className="text-[#0EA5E9] text-sm font-medium">Pricing</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">Simple, transparent pricing</h1>
            <p className="text-xl text-white/70 mb-8">
              Choose the perfect plan for your business. All plans include a 14-day free trial.
            </p>
            <div className="inline-flex items-center gap-3 p-1 rounded-full bg-white/5 border border-white/10">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-6 py-2 rounded-full transition-all ${billingPeriod === "monthly" ? "bg-[#0EA5E9] text-white" : "text-white/60 hover:text-white"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod("annual")}
                className={`px-6 py-2 rounded-full transition-all flex items-center gap-2 ${billingPeriod === "annual" ? "bg-[#0EA5E9] text-white" : "text-white/60 hover:text-white"}`}
              >
                Annual
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Save 20%</span>
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className={`relative p-8 rounded-2xl border backdrop-blur-sm ${
                  plan.popular
                    ? "bg-gradient-to-b from-[#0EA5E9]/10 to-transparent border-[#0EA5E9]/30 shadow-2xl scale-105"
                    : "bg-white/5 border-white/10"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="px-4 py-1 rounded-full bg-[#0EA5E9] text-white text-sm font-medium flex items-center gap-1">
                      <Sparkles size={14} />
                      Most Popular
                    </div>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-white/60 text-sm">{plan.description}</p>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold text-white">
                      ${billingPeriod === "monthly" ? plan.monthlyPrice : plan.annualPrice}
                    </span>
                    <span className="text-white/60">/month</span>
                  </div>
                  {billingPeriod === "annual" && (
                    <p className="text-white/40 text-sm mt-2">Billed annually at ${plan.annualPrice * 12}</p>
                  )}
                </div>
                <LinkButton
                  href={plan.name === "Enterprise" ? "mailto:sales@cloagent.com" : "/sign-up"}
                  variant={plan.popular ? "primary" : "outline"}
                  className={`w-full mb-6${plan.popular ? "" : " bg-white/10 hover:bg-white/20"}`}
                >
                  {plan.cta}
                  {plan.name !== "Enterprise" && <ArrowRight size={16} className="ml-2" />}
                </LinkButton>
                <div className="space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#0EA5E9]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check size={14} className="text-[#0EA5E9]" />
                      </div>
                      <span className="text-white/80 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-24 bg-black/20">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-white mb-4">Compare all features</h2>
            <p className="text-white/60">See what's included in each plan</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="overflow-x-auto"
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-4 px-4 text-white font-semibold">Feature</th>
                  <th className="text-center py-4 px-4 text-white font-semibold">Starter</th>
                  <th className="text-center py-4 px-4 text-white font-semibold">Professional</th>
                  <th className="text-center py-4 px-4 text-white font-semibold">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "Contacts", values: ["500", "Unlimited", "Unlimited"] },
                  { feature: "AI Insights", values: ["-", "✓", "✓"] },
                  { feature: "Automation", values: ["-", "✓", "✓"] },
                  { feature: "Custom Fields", values: ["-", "✓", "✓"] },
                  { feature: "API Access", values: ["-", "-", "✓"] },
                  { feature: "SSO/SAML", values: ["-", "-", "✓"] },
                ].map((row) => (
                  <tr key={row.feature} className="border-b border-white/5">
                    <td className="py-4 px-4 text-white/80">{row.feature}</td>
                    {row.values.map((value, i) => (
                      <td key={i} className="text-center py-4 px-4 text-white/60">{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-white mb-4">Frequently asked questions</h2>
            <p className="text-white/60">Everything you need to know about pricing</p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-8">
            {faqs.map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <h3 className="text-lg font-semibold text-white mb-2">{faq.question}</h3>
                <p className="text-white/60">{faq.answer}</p>
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
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Still have questions?</h2>
            <p className="text-xl text-white/70 mb-8">Our team is here to help. Schedule a demo or reach out to sales.</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <LinkButton href="/sign-up" variant="primary">
                Start Free Trial
                <ArrowRight size={18} className="ml-2" />
              </LinkButton>
              <a href="mailto:sales@cloagent.com" className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-sm font-medium transition-all border border-white/20 text-white hover:bg-white/10">Contact Sales</a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
