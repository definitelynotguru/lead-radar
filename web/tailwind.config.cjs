/** @type {import('tailwindcss').Config} */
const path = require("node:path");

module.exports = {
  content: [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "src/**/*.{ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        ink: "#161c1a",
        panel: "#1f2725",
        panelSoft: "#28322f",
        line: "rgba(148, 163, 184, 0.18)",
        mist: "#a4aaa2",
        hn: "#ff8a3d",
        github: "#a78bfa",
        remotive: "#60a5fa",
      },
      boxShadow: {
        glow: "0 20px 80px rgba(59, 130, 246, 0.14)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
