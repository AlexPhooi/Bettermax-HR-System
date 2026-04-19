/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  safelist: [
    // Rank badge colors
    'bg-green-100', 'text-green-700',
    'bg-blue-100',  'text-blue-700',
    'bg-yellow-100','text-yellow-700',
    'bg-red-100',   'text-red-700',
    'bg-purple-100','text-purple-700',
    'bg-orange-100','text-orange-700',
    // Rework
    'bg-orange-50', 'border-orange-200', 'border-orange-300', 'border-orange-400',
    'text-orange-700', 'text-orange-800',
    'bg-blue-600',  'hover:bg-blue-700',
    'bg-cyan-500',  'hover:bg-cyan-600',
    'bg-orange-500','hover:bg-orange-600',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1a3a5c',
          light: '#2a5a8c',
        },
        accent: '#28a745',
        danger: '#dc3545',
        warn: '#fd7e14',
        bg: '#f0f3f8',
      },
    },
  },
  plugins: [],
};
