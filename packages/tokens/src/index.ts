export type ThemeName = 'light' | 'dark'

export interface ThemeColors {
  page: string
  surface: string
  surfaceMuted: string
  border: string
  borderSubtle: string
  text: string
  textMuted: string
  textFaint: string
  brand: string
  brandFg: string
  positive: string
  warning: string
  danger: string
  heroFrom: string
  heroTo: string
  heroBorder: string
  heroText: string
  overlay: string
}

const light: ThemeColors = {
  page: '#F5F5F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F1EE',
  border: '#EAEAE5',
  borderSubtle: '#F0F0EC',
  text: '#141414',
  textMuted: '#55554F',
  textFaint: '#6E6E69',
  brand: '#141414',
  brandFg: '#FFFFFF',
  positive: '#15803D',
  warning: '#B45309',
  danger: '#C2410C',
  heroFrom: '#2B2E35',
  heroTo: '#121315',
  heroBorder: '#121315',
  heroText: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.28)',
}

const dark: ThemeColors = {
  page: '#0C0C0D',
  surface: '#161718',
  surfaceMuted: '#1D1E20',
  border: '#232427',
  borderSubtle: '#1F2023',
  text: '#EDEDEC',
  textMuted: '#ABABA8',
  textFaint: '#86868A',
  brand: '#EDEDEC',
  brandFg: '#0C0C0D',
  positive: '#4ADE80',
  warning: '#FBBF24',
  danger: '#EA580C',
  heroFrom: '#2E3138',
  heroTo: '#17181B',
  heroBorder: '#26282C',
  heroText: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.5)',
}

/** Soft per-category tile tints (icon backgrounds). */
const tints = {
  amber: { light: '#FEF3E2', dark: '#2A2216' },
  green: { light: '#E6F6EC', dark: '#16261C' },
  blue: { light: '#E8F0FE', dark: '#172033' },
  violet: { light: '#EEEAFE', dark: '#221C33' },
  rose: { light: '#FDECEF', dark: '#2E1A1F' },
  teal: { light: '#E3F4F2', dark: '#13282A' },
  orange: { light: '#FFEEDF', dark: '#2D1E12' },
  slate: { light: '#EEEFF2', dark: '#1F2125' },
} as const

export type TintName = keyof typeof tints
export const tintNames = Object.keys(tints) as TintName[]

export function categoryTint(name: TintName, theme: ThemeName): string {
  return (tints[name] ?? tints.slate)[theme]
}

export const tokens = {
  color: { light, dark },
  radius: { tile: 11, chip: 12, card: 18, hero: 24, sheet: 26, pill: 999 },
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  font: {
    sans: 'Inter',
    size: { xs: 11, sm: 12.5, base: 14, md: 16, lg: 20, xl: 26, hero: 32, amount: 40 },
    weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
    /** Currency code relative to the number it prefixes. */
    currencyCode: { scale: 0.62, weight: '500', opacity: 0.45 },
    numberTracking: -0.025,
  },
  motion: {
    fast: 150,
    base: 220,
    slow: 320,
    spring: { damping: 22, stiffness: 260, mass: 1 },
    undoMs: 5000,
  },
  touchTarget: 44,
} as const

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

export function cssVariables(theme: ThemeName): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tokens.color[theme])) out[`--${kebab(k)}`] = v
  return out
}
