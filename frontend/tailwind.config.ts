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
        base: "#080b13",
        surface: "#111827",
        inset: "#0d1420",
        sidebar: "#0d1220",
        line: "rgba(148,163,184,0.14)",
        "line-strong": "rgba(148,163,184,0.18)",
        text: "#e7ecf5",
        muted: "#8b98b3",
        cyan: "#22d3ee",
        blue: "#3b82f6",
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#f87171",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        control: "9px",
        card: "14px",
        panel: "16px",
      },
      boxShadow: {
        card: "0 20px 60px rgba(0,0,0,0.45)",
        glow: "0 0 60px rgba(34,211,238,0.08)",
        "glow-cyan": "0 8px 30px rgba(34,211,238,0.45)",
        "lift-cyan": "0 14px 34px rgba(34,211,238,0.2)",
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
