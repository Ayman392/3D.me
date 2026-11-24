import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#0b0c0f",
          900: "#111317",
          850: "#16181f",
          800: "#1c1f28",
          750: "#242834",
          700: "#2e3342",
          600: "#454b5f",
          500: "#606880",
          400: "#8c94a8",
          300: "#b5bcd0",
          200: "#dbe0eb",
          100: "#f3f5f9",
        },
        forge: {
          DEFAULT: "#ff7700",
          hover: "#e66a00",
          subtle: "rgba(255, 119, 0, 0.12)",
          border: "rgba(255, 119, 0, 0.35)",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "Monaco", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
