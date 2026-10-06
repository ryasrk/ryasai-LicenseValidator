import type { Config } from 'tailwindcss'

// Theme-aware color: the RGB channels live in CSS variables (see globals.css)
const themed = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./src/**/*.{ts,tsx}'],
  // Dark styles apply under .dark, except inside a .light subtree (used by the login's theme layers)
  darkMode: ['variant', '&:is(.dark *):not(.light *)'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: themed('brand-50'), 100: themed('brand-100'), 200: themed('brand-200'),
          300: '#a5adf8', 400: '#828fff', 500: '#5e6ad2',
          600: '#4f5abc', 700: '#3f48a0', 800: '#2f3580', 900: '#1e2260',
        },
        surface: {
          0: themed('surface-0'),
          1: themed('surface-1'),
          2: themed('surface-2'),
          3: themed('surface-3'),
        },
        ink: {
          DEFAULT: themed('ink'),
          muted: themed('ink-muted'),
          subtle: themed('ink-subtle'),
          tertiary: themed('ink-tertiary'),
        },
        hairline: {
          DEFAULT: themed('hairline'),
          strong: themed('hairline-strong'),
        },
        // Fixed dark backdrop behind the login artwork, in both themes
        stage: '#0b0c14',
      },
    },
  },
} satisfies Config
