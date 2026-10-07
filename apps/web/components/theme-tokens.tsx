import { categoryTint, cssVariables, tintNames, type ThemeName } from '@hisab/tokens'

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`

/** Design tokens plus the soft category-tile tints (`--tint-amber`, …). */
const vars = (theme: ThemeName) => ({
  ...cssVariables(theme),
  ...Object.fromEntries(tintNames.map((t) => [`--tint-${t}`, categoryTint(t, theme)])),
})

/** Emits the design tokens as CSS variables for light (:root) and dark (.dark). */
export function ThemeTokens() {
  // Printing always uses the light palette so a PDF from dark mode stays readable.
  const css = block(':root', vars('light')) + block('.dark', vars('dark')) + `@media print{${block('.dark', vars('light'))}}`
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
