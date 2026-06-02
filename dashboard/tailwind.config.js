/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        purple: '#7F77DD',
        green:  '#5DCAA5',
        orange: '#EF9F27',
        pink:   '#ED93B1',
        red:    '#D85A30',
        bg:     '#F8F7FF',
      },
    },
  },
  plugins: [],
};
