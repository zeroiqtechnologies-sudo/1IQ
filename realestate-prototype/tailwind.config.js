/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50: '#f1f4f9', 100: '#dde4f0', 600: '#24406e', 700: '#1b315a', 800: '#142647', 900: '#0d1b35', 950: '#081226' },
        teal: { 50: '#ecfbf8', 100: '#d0f4ec', 500: '#14a38b', 600: '#0d8a76', 700: '#0c6f60', 800: '#0d594e' },
        amber: { 50: '#fff8eb', 100: '#feeac7', 400: '#f7b23b', 500: '#ef9a13', 600: '#d3780c', 700: '#af560e' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
