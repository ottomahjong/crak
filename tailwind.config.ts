import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Original CRAK palette — warm ivory tiles on deep charcoal/navy felt.
        ivory: "#f4ecdd",
        "ivory-edge": "#e2d6bd",
        felt: "#1c2230",
        "felt-2": "#141926",
        ink: "#26221b",
        dot: "#3f7cac",
        bam: "#3f8f5f",
        crak: "#c85a54",
        "dragon-red": "#c0392b",
        "dragon-green": "#2f855a",
        gold: "#c8a44d",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        tile: "0 2px 0 0 rgba(0,0,0,0.18), 0 6px 12px -4px rgba(0,0,0,0.35)",
        "tile-dark": "0 2px 0 0 rgba(0,0,0,0.5), 0 6px 14px -4px rgba(0,0,0,0.6)",
      },
      transitionTimingFunction: {
        tile: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        "scale-in": {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pop": {
          "0%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" },
        },
        "celebrate": {
          "0%": { transform: "scale(0.7)", opacity: "0" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "scale-in": "scale-in 140ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "pop": "pop 120ms ease-out",
        "celebrate": "celebrate 250ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
