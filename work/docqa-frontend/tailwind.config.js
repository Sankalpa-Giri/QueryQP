/** @type {import('tailwindcss').Config} */
// All colours come from config/theme.json so the palette lives in ONE place.
const theme = require("./config/theme.json");
const c = theme.colors;

module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // surfaces, from page background up to hovered controls
        ground: c.ground,
        frame: c.frame,
        surface: c.surface,
        raised: c.raised,
        lift: c.lift,
        // hairlines
        line: { DEFAULT: c.line, soft: c.lineSoft, strong: c.lineStrong },
        // text
        ink: { DEFAULT: c.ink, soft: c.inkSoft, muted: c.inkMuted, faint: c.inkFaint, dim: c.inkDim },
        // the single accent
        primary: { DEFAULT: c.primary, hover: c.primaryHover, foreground: c.ground },
        // ten-stop strip used by the intro
        ribbon: Object.fromEntries(theme.ribbon.map((hex, i) => [String(i), hex])),
        // legacy names kept so nothing that referenced them breaks
        border: c.line,
        input: c.line,
        ring: c.primary,
        background: c.ground,
        foreground: c.ink,
      },
      borderColor: { DEFAULT: c.line },
      divideColor: { DEFAULT: c.line },
      ringColor: { DEFAULT: c.primary },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius, 0.5rem)",
        md: "calc(var(--radius, 0.5rem) - 2px)",
        sm: "calc(var(--radius, 0.5rem) - 4px)",
      },
    },
  },
  plugins: [],
};
