/** @type {import('tailwindcss').Config} */ 
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#040a26", 900: "#091545", 800: "#0e1f66" },
        panel: { DEFAULT: "#11257f", hi: "#1b35a3" },
        line: "#2a47b8",
        brand: { DEFAULT: "#4a73f0", soft: "#93adff", deep: "#2447c9" },
        slate: { 300: "#d6defa", 400: "#a3b2e8", 500: "#7b8cd0" },
      },
      fontFamily: {
        display: ["Syncopate", "Michroma", "ui-sans-serif", "sans-serif"],
        sans: ["Hind", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
