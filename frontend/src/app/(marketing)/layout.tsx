import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html, body { background-color: #0F1E36; }`}</style>
      <div className="min-h-screen bg-gradient-to-b from-[#0F1E36] via-[#162843] to-[#0F1E36]">
        <MarketingNav />
        <main>{children}</main>
        <MarketingFooter />
      </div>
    </>
  );
}
