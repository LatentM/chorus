/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // "Cyanotype" — a blueprint is a plan published so anyone can inspect it.
        // Token NAMES are stable so pages never need edits when values change.
        ink: "#05121F",     // drafting-table ground — deep blue, never pure black
        panel: "#0A2135",   // sheet laid on the table
        edge: "#17405F",    // hairline / grid rule
        ballot: "#E6EEF4",  // primary text — cool chalk, like blueprint linework
        muted: "#7E9BB2",   // secondary text
        seal: "#FF6B5A",    // FAILURE. Every `text-seal` in the app is an error.
        verify: "#4FE0B0",  // PASS. Verdicts, matched recounts, confirmations.
        foil: "#FFC943",    // ATTESTED. On-chain truth, focus rings, the mark.
      },
      fontFamily: {
        display: ['"Archivo"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Instrument Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      keyframes: {
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "stamp-in": {
          "0%": { opacity: "0", transform: "translateY(6px) scaleX(0.94)" },
          "100%": { opacity: "1", transform: "translateY(0) scaleX(1)" },
        },
      },
      animation: {
        "spin-slow": "spin-slow 48s linear infinite",
        "fade-up": "fade-up 0.38s cubic-bezier(0.2, 0.7, 0.3, 1) both",
        "stamp-in": "stamp-in 0.4s cubic-bezier(0.2, 0.9, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
