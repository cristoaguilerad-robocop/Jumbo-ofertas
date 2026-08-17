/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        jumbo: {
          green: '#00A650',
          'green-dark': '#007A3C',
          red: '#E31837',
        }
      }
    },
  },
  plugins: [],
}
