/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  safelist: [
    // Rank badge colors (dynamic)
    'bg-green-100', 'text-green-700',
    'bg-blue-100',  'text-blue-700',
    'bg-yellow-100','text-yellow-700',
    'bg-red-100',   'text-red-700',
    'bg-purple-100','text-purple-700',
    'bg-orange-100','text-orange-700',
    'bg-orange-50', 'border-orange-200', 'border-orange-300', 'border-orange-400',
    'text-orange-700', 'text-orange-800',
    'bg-blue-600',  'hover:bg-blue-700',
    'bg-cyan-500',  'hover:bg-cyan-600',
    'bg-orange-500','hover:bg-orange-600',
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand primary (dark brown) ───────────────────────────
        primary: {
          DEFAULT: '#1E1400',   // brown-deep — navbar, dark bg
          light:   '#3D2B00',   // brown-mid  — hover states
        },
        // ── Brand accent (gold) ──────────────────────────────────
        accent:  '#C9A84C',     // gold — buttons, highlights
        // ── Status ──────────────────────────────────────────────
        danger:  '#A32D2D',
        warn:    '#B8860B',
        success: '#27500A',
        // ── Page background ─────────────────────────────────────
        bg:      '#FAF5E9',     // gold-pale

        // ── Full brand palette (use as needed) ───────────────────
        gold: {
          DEFAULT: '#C9A84C',
          light:   '#E8D5A3',
          muted:   '#C49A6C',
          pale:    '#FAF5E9',
        },
        brown: {
          deep:  '#1A0E06',
          mid:   '#3D2B1F',
          light: '#6B4226',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Times New Roman', 'serif'],
        sans:  ['Arial', 'Helvetica', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
