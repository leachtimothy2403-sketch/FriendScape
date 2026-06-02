/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        purple: '#7F77DD',
        green: '#5DCAA5',
        orange: '#EF9F27',
        pink: '#ED93B1',
        red: '#D85A30',
        bg: '#F8F7FF',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
