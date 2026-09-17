/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // El tema lo decide una clase en <html>, no la preferencia del sistema, para
  // que la elección del usuario mande sobre ella.
  darkMode: 'class',
  theme: {
    extend: {
      // Colores por función, no por tono: «la tarjeta», «el texto atenuado».
      // Cada uno se resuelve contra una variable CSS que cambia con el tema, de
      // modo que las pantallas no repiten un gris concreto que solo sirve en
      // modo oscuro.
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        'card-hover': 'rgb(var(--c-card-hover) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        'muted-strong': 'rgb(var(--c-muted-strong) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        content: 'rgb(var(--c-content) / <alpha-value>)',
        'content-soft': 'rgb(var(--c-content-soft) / <alpha-value>)',
        'content-dim': 'rgb(var(--c-content-dim) / <alpha-value>)',
        'content-faint': 'rgb(var(--c-content-faint) / <alpha-value>)',
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
