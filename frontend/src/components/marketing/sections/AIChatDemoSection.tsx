"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import { Bot, User, Send, Search, CheckCircle2, Loader2 } from "lucide-react";

const AI_RESPONSES: Record<string, string> = {
  "how many deals": "You have 5 active deals worth $8.84M total. 2 in Lead stage, 1 Contacted, 1 Touring, and 1 at Offer. Would you like me to dive deeper into any of them?",
  "show pipeline": "Here's your pipeline summary:\n• Lead (2): $1.69M\n• Contacted (1): $2.8M\n• Touring (1): $950K\n• Offer (1): $3.4M\n\nTotal pipeline value: $8.84M",
  "follow up": "I'll create follow-up tasks for your leads:\n✅ Call Sarah about 742 Evergreen - Tomorrow 10am\n✅ Email showing schedule for 221B Baker - Today 3pm\n✅ Check-in on 1600 Pennsylvania - Wednesday 2pm\n\nWant me to set these up?",
  default: "I can help you manage your pipeline, create contacts, log activities, and analyze your deals. Try asking about your deals, pipeline, or follow-ups!",
};

function getAIResponse(input: string): string {
  const lower = input.toLowerCase();
  for (const [key, response] of Object.entries(AI_RESPONSES)) {
    if (key !== "default" && lower.includes(key)) return response;
  }
  return AI_RESPONSES.default;
}

interface ToolCard {
  id: string;
  title: string;
  status: "loading" | "done";
  result: string;
  icon: typeof Search;
}

const AUTO_PLAY_SCRIPT = {
  userMessage: "Show me my top deals",
  aiResponse: "Here are your top 5 deals by value:\n\n1. **10 Downing Street** — $3.4M (Offer stage)\n2. **1600 Pennsylvania Ave** — $2.8M (Contacted)\n3. **221B Baker Street** — $1.2M (Lead)\n4. **350 Fifth Avenue** — $950K (Touring)\n5. **742 Evergreen Terrace** — $485K (Lead)\n\nTotal pipeline: $8.84M. Want me to create follow-up tasks?",
  tools: [
    { id: "t1", title: "Searching deals...", result: "Found 5 active deals", icon: Search },
    { id: "t2", title: "Calculating values...", result: "Pipeline: $8.84M", icon: CheckCircle2 },
  ] as ToolCard[],
};

export default function AIChatDemoSection() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [toolCards, setToolCards] = useState<ToolCard[]>([]);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: true, margin: "-200px" });
  const reduced = useReducedMotion() ?? false;

  // Auto-play script on scroll into view
  useEffect(() => {
    if (!inView || hasAutoPlayed) return;
    setHasAutoPlayed(true);

    const script = AUTO_PLAY_SCRIPT;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Step 1: User message appears
    timers.push(setTimeout(() => {
      setMessages([{ role: "user", content: script.userMessage }]);
    }, 500));

    // Step 2: Show tool cards loading
    timers.push(setTimeout(() => {
      setIsTyping(true);
      setToolCards(script.tools.map((t) => ({ ...t, status: "loading" as const })));
    }, 1200));

    // Step 3: Tool cards complete
    timers.push(setTimeout(() => {
      setToolCards(script.tools.map((t) => ({ ...t, status: "done" as const })));
    }, 2200));

    // Step 4: AI response
    timers.push(setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: "assistant", content: script.aiResponse }]);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 2800));

    return () => timers.forEach(clearTimeout);
  }, [inView, hasAutoPlayed]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsTyping(true);
    setToolCards([]);

    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: "assistant", content: getAIResponse(userMsg) }]);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 800);
  }, [input]);

  return (
    <section id="section-ai-chat" className="relative py-24 lg:py-32" ref={sectionRef}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-[#F97316] font-[family-name:var(--font-josefin)]">
            Layer 2
          </span>
          <h2 className="mt-4 text-4xl lg:text-5xl font-bold font-[family-name:var(--font-cinzel)] text-white">
            AI <span className="text-gradient-orange">Intelligence</span>
          </h2>
          <p className="mt-4 text-lg text-slate-400 font-[family-name:var(--font-josefin)] max-w-xl mx-auto">
            Watch the AI work in real-time, then try it yourself.
          </p>
        </motion.div>

        {/* Split layout */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-5 gap-6"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Chat panel - 3 cols */}
          <div className="lg:col-span-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm overflow-hidden flex flex-col" style={{ minHeight: 420 }}>
            {/* Chat header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
              <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="text-xs text-slate-400 font-[family-name:var(--font-josefin)]">Clo Assistant</span>
              <div className="flex-1" />
              <span className="text-[10px] text-slate-600 font-[family-name:var(--font-josefin)]">Live Demo</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 p-4 max-h-[350px]">
              {messages.length === 0 && !isTyping && (
                <div className="text-center py-12">
                  <Bot className="w-8 h-8 text-[#F97316]/40 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 font-[family-name:var(--font-josefin)]">
                    {hasAutoPlayed ? "Type a message below..." : "Watch the demo..."}
                  </p>
                </div>
              )}
              <AnimatePresence>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={reduced ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-[#F97316]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot size={14} className="text-[#F97316]" />
                      </div>
                    )}
                    <div className={`rounded-xl px-4 py-2.5 text-sm font-[family-name:var(--font-josefin)] max-w-[80%] whitespace-pre-line ${
                      msg.role === "user"
                        ? "bg-[#2563EB] text-white"
                        : "bg-white/[0.06] text-slate-300"
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-[#2563EB]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User size={14} className="text-[#2563EB]" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {isTyping && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#F97316]/20 flex items-center justify-center flex-shrink-0">
                    <Bot size={14} className="text-[#F97316]" />
                  </div>
                  <div className="bg-white/[0.06] rounded-xl px-4 py-3 flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-slate-400"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/[0.08] p-4">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Try: how many deals, follow up..."
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-[#F97316]/40 font-[family-name:var(--font-josefin)]"
                />
                <button
                  onClick={handleSend}
                  className="w-10 h-10 rounded-xl bg-[#F97316] hover:bg-[#EA6C10] flex items-center justify-center transition-colors"
                >
                  <Send size={14} className="text-white" />
                </button>
              </div>
              <div className="flex gap-2 mt-2.5">
                {["how many deals", "show pipeline", "follow up"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white hover:border-white/[0.12] transition-colors font-[family-name:var(--font-josefin)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tool execution panel - 2 cols */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 font-[family-name:var(--font-josefin)] mb-2">
              Tool Execution
            </h3>
            <AnimatePresence>
              {toolCards.map((tool) => (
                <motion.div
                  key={tool.id}
                  initial={reduced ? false : { opacity: 0, rotateX: -90, transformOrigin: "top" }}
                  animate={{ opacity: 1, rotateX: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4"
                >
                  <div className="flex items-center gap-3">
                    {tool.status === "loading" ? (
                      <Loader2 className="w-4 h-4 text-[#F97316] animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                    )}
                    <div>
                      <p className="text-xs font-semibold text-white font-[family-name:var(--font-josefin)]">
                        {tool.status === "loading" ? tool.title : tool.result}
                      </p>
                      {tool.status === "done" && (
                        <p className="text-[10px] text-slate-500 font-[family-name:var(--font-josefin)]">
                          Completed
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {toolCards.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center">
                <Search className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-[family-name:var(--font-josefin)]">
                  Tool calls will appear here
                </p>
              </div>
            )}

            {/* Confirmation card mockup */}
            <motion.div
              className="rounded-xl border border-[#F97316]/20 bg-[#F97316]/5 p-4"
              initial={{ opacity: 0 }}
              animate={inView && hasAutoPlayed ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 3.5 }}
            >
              <p className="text-xs font-semibold text-[#F97316] font-[family-name:var(--font-josefin)] mb-2">
                Pending Confirmation
              </p>
              <p className="text-xs text-slate-400 font-[family-name:var(--font-josefin)] mb-3">
                Create follow-up task: &quot;Call Sarah about 742 Evergreen&quot;
              </p>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded-lg bg-[#F97316] text-white text-[11px] font-semibold font-[family-name:var(--font-josefin)] hover:bg-[#EA6C10] transition-colors">
                  Confirm
                </button>
                <button className="px-3 py-1.5 rounded-lg border border-white/[0.1] text-slate-400 text-[11px] font-[family-name:var(--font-josefin)] hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
