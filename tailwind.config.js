/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg: "#020617",
          navy: "#050B18",
          panel: "#0A152B",
          cyan: "#00E5FF",
          blue: "#0EA5E9",
          glow: "#38BDF8",
        },
      },
      fontFamily: {
        display: ["Orbitron", "Rajdhani", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      animation: {
        "spin-slow": "spin 18s linear infinite",
        "spin-reverse": "spin-reverse 11s linear infinite",
        "pulse-core": "pulse-core 2.6s ease-in-out infinite",
      },
      keyframes: {
        "spin-reverse": {
          from: { transform: "rotate(360deg)" },
          to: { transform: "rotate(0deg)" },
        },
        "pulse-core": {
          "0%, 100%": { opacity: "0.75", transform: "scale(0.97)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
      },
    },
  },
  plugins: [],
};
