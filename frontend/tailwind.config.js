/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // "The counting room at night" — a polling place in its own materials
        ink: "#0C110F",     // ballot-box steel, green-black
        panel: "#151D19",   // booth shadow
        edge: "#2A342E",    // worn brass hinge line
        ballot: "#F0E9D8",  // ballot-paper cream (primary text)
        seal: "#C8502E",    // wax-seal vermilion
        verify: "#46A578",  // inked VERIFIED green
        muted: "#93A096",   // sage ledger-grey
        foil: "#C9A227",    // brass foil (focus, seal ring, accents)
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Public Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      keyframes: {
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "stamp-in": {
          "0%": { opacity: "0", transform: "scale(1.4) rotate(-8deg)" },
          "60%": { opacity: "1", transform: "scale(0.96) rotate(-2deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-2deg)" },
        },
      },
      animation: {
        "spin-slow": "spin-slow 48s linear infinite",
        "fade-up": "fade-up 0.35s ease-out both",
        "stamp-in": "stamp-in 0.45s cubic-bezier(0.2, 1.2, 0.4, 1) both",
      },
    },
  },
  plugins: [],
};
