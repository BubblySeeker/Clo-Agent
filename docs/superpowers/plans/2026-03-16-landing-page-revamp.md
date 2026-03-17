# Landing Page Revamp Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete from-scratch revamp of Estate CRM marketing landing page with world-class animations.

**Architecture:** Single-page landing at `app/page.tsx` composed of 6 section components under `components/marketing/sections/`. Shared animation primitives in `components/marketing/animations/`. Light theme (#F8FAFC bg), Cinzel headings, Josefin Sans body, blue primary (#2563EB), orange CTA (#F97316).

**Tech Stack:** Next.js 14, Tailwind CSS, Framer Motion, Lucide icons, Cinzel + Josefin Sans fonts via next/font/google.

---

## File Structure

### Modified Files
- `frontend/src/app/layout.tsx` — Add Cinzel + Josefin Sans font imports
- `frontend/src/app/globals.css` — New marketing utility classes, updated color tokens
- `frontend/tailwind.config.ts` — New keyframes for marketing animations
- `frontend/src/app/page.tsx` — Complete rewrite: orchestrator importing section components
- `frontend/src/app/(marketing)/layout.tsx` — Update to light theme
- `frontend/src/components/marketing/MarketingNav.tsx` — Rewrite for light theme + scroll progress
- `frontend/src/components/marketing/MarketingFooter.tsx` — Rewrite for light theme
- `frontend/src/components/marketing/LinkButton.tsx` — Update variants to new color scheme

### New Files
- `frontend/src/components/marketing/sections/HeroSection.tsx` — Magnetic cursor field, kinetic typography, particle grid, 3D tilt mockup
- `frontend/src/components/marketing/sections/FeaturesSection.tsx` — Bento grid with scroll-driven reveals, animated SVG illustrations
- `frontend/src/components/marketing/sections/HowItWorksSection.tsx` — 3-step timeline with SVG line drawing on scroll, traveling orb
- `frontend/src/components/marketing/sections/SocialProofSection.tsx` — Logo ticker, spring-physics stat counters, testimonial cards
- `frontend/src/components/marketing/sections/PricingSection.tsx` — 3D tilt cards with cursor spotlight, animated gradient border on popular
- `frontend/src/components/marketing/sections/CTASection.tsx` — Final conversion with animated gradient border

---

## Task 1: Foundation (fonts, colors, tailwind, globals)

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tailwind.config.ts`

- [ ] **Step 1:** Add Cinzel + Josefin Sans to layout.tsx alongside existing DM Sans + Sora (keep those for dashboard)
- [ ] **Step 2:** Add marketing utility classes to globals.css (new gradients, glass effects for light theme, marquee animation)
- [ ] **Step 3:** Add new keyframes to tailwind.config.ts (marquee, draw-line, gradient-rotate, dot-pulse)
- [ ] **Step 4:** Verify fonts load by running `npm run dev` in frontend

## Task 2: Marketing Layout + Nav + Footer + LinkButton

**Files:**
- Modify: `frontend/src/app/(marketing)/layout.tsx`
- Modify: `frontend/src/components/marketing/MarketingNav.tsx`
- Modify: `frontend/src/components/marketing/MarketingFooter.tsx`
- Modify: `frontend/src/components/marketing/LinkButton.tsx`

- [ ] **Step 1:** Rewrite marketing layout for light theme (#F8FAFC background, Josefin Sans body font)
- [ ] **Step 2:** Rewrite MarketingNav — light theme, scroll progress bar, slide-in underline hover on links, simplified link list (Features, Pricing, About)
- [ ] **Step 3:** Rewrite MarketingFooter — light theme, 4-column layout, new brand colors
- [ ] **Step 4:** Update LinkButton variants — primary uses #2563EB→#1D4ED8 gradient, CTA uses #F97316, outline uses slate borders

## Task 3: Hero Section

**Files:**
- Create: `frontend/src/components/marketing/sections/HeroSection.tsx`

Complex animations:
- [ ] **Step 1:** Build particle dot grid background — grid of dots that ripple outward from cursor position using `useMotionValue` + distance calculations
- [ ] **Step 2:** Build kinetic typography — split headline into individual characters, each pulls toward cursor with spring physics (magnetic effect)
- [ ] **Step 3:** Build 3D tilt mockup — dashboard preview card that rotates on mouse move using `perspective` + `rotateX/Y` transforms with `useSpring`
- [ ] **Step 4:** Staggered entrance — badge, headline chars, subheading, CTAs, trust signals all cascade in with blur+y+opacity
- [ ] **Step 5:** Wire together and add prefers-reduced-motion fallback

## Task 4: Features Bento Grid

**Files:**
- Create: `frontend/src/components/marketing/sections/FeaturesSection.tsx`

- [ ] **Step 1:** Build bento grid layout — 2 large + 4 small cards in asymmetric grid
- [ ] **Step 2:** Add scroll-driven entrance — each card enters with unique animation (scale from center, slide from side, rotate in)
- [ ] **Step 3:** Add animated SVG illustrations inside each card (pipeline flow, contact network, chart bars growing, AI brain pulse)
- [ ] **Step 4:** Add hover effects — elevation + glow + illustration loop acceleration

## Task 5: How It Works Timeline

**Files:**
- Create: `frontend/src/components/marketing/sections/HowItWorksSection.tsx`

- [ ] **Step 1:** Build 3-step horizontal layout with SVG connecting paths
- [ ] **Step 2:** SVG line drawing animation — stroke-dashoffset driven by `useScroll` + `useTransform`
- [ ] **Step 3:** Traveling glowing orb along the path (follows scroll progress)
- [ ] **Step 4:** Step nodes pulse/scale when line reaches them, content fades in from alternating sides

## Task 6: Social Proof Section

**Files:**
- Create: `frontend/src/components/marketing/sections/SocialProofSection.tsx`

- [ ] **Step 1:** Build infinite logo ticker — CSS-only marquee with duplicated logos, pauses on hover
- [ ] **Step 2:** Build spring-physics stat counters — numbers animate with spring easing on scroll into view
- [ ] **Step 3:** Build testimonial cards — slide in with slight rotation, hover lifts with shadow

## Task 7: Pricing Cards

**Files:**
- Create: `frontend/src/components/marketing/sections/PricingSection.tsx`

- [ ] **Step 1:** Build 3 pricing cards with monthly/annual toggle (layout animation on price morph)
- [ ] **Step 2:** Add 3D tilt effect — each card tracks mouse position, applies rotateX/Y with useSpring
- [ ] **Step 3:** Add cursor spotlight — radial gradient follows mouse on card surface
- [ ] **Step 4:** Popular card gets continuously animated gradient border (conic-gradient rotation)

## Task 8: CTA + Page Assembly

**Files:**
- Create: `frontend/src/components/marketing/sections/CTASection.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1:** Build CTA section with animated gradient border (rotating conic gradient)
- [ ] **Step 2:** Rewrite page.tsx to import all 6 sections + nav + footer
- [ ] **Step 3:** Verify full page renders, all animations work, responsive at 375/768/1024/1440px
- [ ] **Step 4:** Verify prefers-reduced-motion disables all complex animations
- [ ] **Step 5:** Commit
