import type { Config } from "tailwindcss";

/**
 * Design tokens transcribed from the handoff prototype so Tailwind utilities
 * map directly onto the intended palette, radii and typography.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Slate & Signal — chosen cool slate grounds, one restrained blue accent.
        base: "#0b0e15",
        surface: "#141922",
        inset: "#0e131b",
        sidebar: "#0f141d",
        line: "rgba(148,163,184,0.12)",
        "line-strong": "rgba(148,163,184,0.20)",
        text: "#e7eaf1",
        muted: "#8b94a6",
        // The single steel-blue accent. `accent` is the name to use; `cyan` and
        // `blue` remain as deprecated aliases so existing screens keep working
        // until they are migrated over.
        accent: "#5b8def",
        "accent-hover": "#7ba3f4",
        cyan: "#5b8def",
        blue: "#5b8def",
        // Severity — considered, desaturated (these are the only loud colors).
        success: "#4bb384",
        warning: "#e0994a",
        danger: "#e0575b",
      },
      fontFamily: {
        // One superfamily: IBM Plex Sans for interface, Plex Mono for anything
        // numeric. Reads as an instrument rather than a template.
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        control: "8px",
        card: "12px",
        panel: "14px",
      },
      boxShadow: {
        // Quiet elevation, no colored glow.
        card: "0 1px 0 rgba(255,255,255,0.02), 0 14px 40px rgba(0,0,0,0.38)",
        glow: "0 10px 34px rgba(0,0,0,0.34)",
        "glow-cyan": "0 4px 18px rgba(91,141,239,0.28)",
        "lift-cyan": "0 10px 26px rgba(0,0,0,0.36)",
      },
      keyframes: {
        floatOrbA: {
          "0%,100%": { transform: "translate3d(0,0,0) rotate(0deg)" },
          "50%": { transform: "translate3d(20px,-30px,0) rotate(8deg)" },
        },
        floatOrbB: {
          "0%,100%": { transform: "translate3d(0,0,0) rotate(0deg)" },
          "50%": { transform: "translate3d(-25px,25px,0) rotate(-6deg)" },
        },
        bgShift: {
          "0%": { backgroundPosition: "0% 0%" },
          "50%": { backgroundPosition: "100% 60%" },
          "100%": { backgroundPosition: "0% 0%" },
        },
        hueBlur20: {
          "0%,100%": { filter: "blur(20px) hue-rotate(0deg)" },
          "50%": { filter: "blur(20px) hue-rotate(70deg)" },
        },
        hueBlur30: {
          "0%,100%": { filter: "blur(30px) hue-rotate(0deg)" },
          "50%": { filter: "blur(30px) hue-rotate(70deg)" },
        },
      },
      animation: {
        floatOrbA: "floatOrbA 12s ease-in-out infinite",
        floatOrbB: "floatOrbB 14s ease-in-out infinite",
        bgShift: "bgShift 22s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
