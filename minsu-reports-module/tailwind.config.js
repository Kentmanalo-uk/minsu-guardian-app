/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Same brand colors as the main app's tailwind.config.js
      colors: {
        minsu: {
          primary: '#059669',
          secondary: '#10b981',
          accent: '#34d399',
          dark: '#047857',
          light: '#d1fae5',
        },
      },
    },
  },
  plugins: [],
}
