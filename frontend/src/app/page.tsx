"use client";

import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import HeroExplodedView from "@/components/marketing/sections/HeroExplodedView";
import PipelineDemoSection from "@/components/marketing/sections/PipelineDemoSection";
import AIChatDemoSection from "@/components/marketing/sections/AIChatDemoSection";
import AnalyticsShowcaseSection from "@/components/marketing/sections/AnalyticsShowcaseSection";
import ContactIntelligenceSection from "@/components/marketing/sections/ContactIntelligenceSection";
import SecurityTrustSection from "@/components/marketing/sections/SecurityTrustSection";
import PricingSection from "@/components/marketing/sections/PricingSection";
import FinalCTASection from "@/components/marketing/sections/FinalCTASection";
import MiniMap from "@/components/marketing/sections/MiniMap";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0F172A] font-[family-name:var(--font-josefin)]">
      <MarketingNav />
      <MiniMap />

      <main>
        <HeroExplodedView />
        <PipelineDemoSection />
        <AIChatDemoSection />
        <AnalyticsShowcaseSection />
        <ContactIntelligenceSection />
        <SecurityTrustSection />
        <PricingSection />
        <FinalCTASection />
      </main>

      <MarketingFooter />
    </div>
  );
}
