import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "rotate(-0.8deg)" },
          "50%": { transform: "rotate(0.8deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(-30px) rotate(3deg)" },
        },
        "border-glow": {
          "0%, 100%": { borderColor: "rgba(14, 165, 233, 0.2)" },
          "50%": { borderColor: "rgba(14, 165, 233, 0.5)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "dot-pulse": {
          "0%, 100%": { opacity: "0.15" },
          "50%": { opacity: "0.6" },
        },
        "orb-float": {
          "0%, 100%": { transform: "translateY(0) translateX(0)" },
          "33%": { transform: "translateY(-12px) translateX(8px)" },
          "66%": { transform: "translateY(6px) translateX(-6px)" },
        },
        "spotlight-pulse": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.7" },
        },
        "card-drift": {
          "0%": { transform: "translate3d(0, 0, 0) rotate(0deg)" },
          "33%": { transform: "translate3d(6px, -8px, 0) rotate(0.5deg)" },
          "66%": { transform: "translate3d(-4px, 5px, 0) rotate(-0.3deg)" },
          "100%": { transform: "translate3d(0, 0, 0) rotate(0deg)" },
        },
        "orb-breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.12" },
          "50%": { transform: "scale(1.15)", opacity: "0.18" },
        },
        "comm-fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        wiggle: "wiggle 0.35s ease-in-out infinite",
        shimmer: "shimmer 3s ease-in-out infinite",
        "glow-pulse": "glow-pulse 4s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float-slow 8s ease-in-out infinite",
        "border-glow": "border-glow 3s ease-in-out infinite",
        "slide-up": "slide-up 0.6s ease-out",
        "dot-pulse": "dot-pulse 3s ease-in-out infinite",
        "orb-float": "orb-float 8s ease-in-out infinite",
        "spotlight-pulse": "spotlight-pulse 4s ease-in-out infinite",
        "card-drift": "card-drift 12s ease-in-out infinite",
        "orb-breathe": "orb-breathe 4s ease-in-out infinite",
        "comm-fade-in": "comm-fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
