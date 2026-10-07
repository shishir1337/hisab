const { tokens } = require('./tokens.cjs')

const colorKeys = Object.keys(tokens.color.light)
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

/** Colors resolve to CSS variables set per theme with nativewind `vars()` (see src/lib/theme.tsx). */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(colorKeys.map((k) => [kebab(k), `var(--${kebab(k)})`])),
      borderRadius: {
        tile: `${tokens.radius.tile}px`,
        chip: `${tokens.radius.chip}px`,
        card: `${tokens.radius.card}px`,
        hero: `${tokens.radius.hero}px`,
        sheet: `${tokens.radius.sheet}px`,
      },
    },
  },
}
