/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        panel: "#1A2026",
        edge: "#2A333C",
        ballot: "#EDE6D6",
        seal: "#B4552D",
        verify: "#3E8E6E",
        muted: "#8A96A3",
      },
      fontFamily: {
        display: ['"Spectral"', "serif"],
        sans: ['"IBM Plex Sans"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
