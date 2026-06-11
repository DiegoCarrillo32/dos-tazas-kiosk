import type { Config } from "tailwindcss";

// Brand/semantic colors are stored as "R G B" channels in globals.css so that
// Tailwind opacity modifiers (e.g. text-expresso/70) work with CSS variables.
const withAlpha = (varName: string) => `rgb(var(${varName}) / <alpha-value>)`;

const config: Config = {
  // The .dark class is toggled on <html> by the inline theme script + ThemeToggle,
  // so dark: variants must be class-driven (not the "media" default).
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dos Tazas brand palette
        expresso: withAlpha("--expresso"),
        "warm-roast": withAlpha("--warm-roast"),
        "coffee-fruit": withAlpha("--coffee-fruit"),
        "white-pergamino": withAlpha("--white-pergamino"),
        "fruit-light": withAlpha("--fruit-light"),
        // shadcn semantic tokens (mapped onto the brand)
        background: withAlpha("--background"),
        foreground: withAlpha("--foreground"),
        card: withAlpha("--card"),
        "card-foreground": withAlpha("--card-foreground"),
        popover: withAlpha("--popover"),
        "popover-foreground": withAlpha("--popover-foreground"),
        primary: withAlpha("--primary"),
        "primary-foreground": withAlpha("--primary-foreground"),
        secondary: withAlpha("--secondary"),
        "secondary-foreground": withAlpha("--secondary-foreground"),
        muted: withAlpha("--muted"),
        "muted-foreground": withAlpha("--muted-foreground"),
        accent: withAlpha("--accent"),
        "accent-foreground": withAlpha("--accent-foreground"),
        destructive: withAlpha("--destructive"),
        border: withAlpha("--border"),
        input: withAlpha("--input"),
        ring: withAlpha("--ring"),
      },
      fontFamily: {
        sans: ["Gotham", "system-ui", "sans-serif"],
        heading: ['"Titan One"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
