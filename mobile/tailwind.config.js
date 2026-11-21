/** LeadFlow design tokens — shared by both apps. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
          900: "#1E1B4B",
        },
        wa: { 50: "#ECFDF5", 100: "#D1FAE5", 600: "#059669", 700: "#047857" },
        ink: {
          DEFAULT: "#0F172A",
          muted: "#64748B",
          faint: "#94A3B8",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8FAFC",
          dark: "#0B1120",
          "dark-card": "#111827",
          "dark-muted": "#1F2937",
        },
      },
      borderRadius: { xl: "14px", "2xl": "18px", "3xl": "24px" },
      fontSize: { "2xs": ["11px", "14px"] },
    },
  },
  plugins: [],
};
