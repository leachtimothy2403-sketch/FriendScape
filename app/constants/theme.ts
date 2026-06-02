export const Colors = {
  purple: '#7F77DD',
  green:  '#5DCAA5',
  orange: '#EF9F27',
  pink:   '#ED93B1',
  red:    '#D85A30',
  bg:     '#F8F7FF',
  white:  '#FFFFFF',
  black:  '#1A1A2E',
  gray: {
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },
} as const;

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const FontSize = {
  xs:   12,
  sm:   14,
  base: 16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
} as const;

export const BorderRadius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 9999,
} as const;

export const Mascots: Record<string, { emoji: string; description: string }> = {
  luna:  { emoji: '🦉', description: 'Luna the Wise Owl — curious, calm, loves books' },
  cosmo: { emoji: '🚀', description: 'Cosmo the Space Fox — adventurous, brave, full of big ideas' },
  pip:   { emoji: '🐸', description: 'Pip the Happy Frog — funny, silly, always makes you smile' },
  finn:  { emoji: '🐬', description: 'Finn the Kind Dolphin — caring, gentle, loves music' },
  sunny: { emoji: '🌻', description: 'Sunny the Cheerful Sunflower — creative, warm, loves art' },
};
