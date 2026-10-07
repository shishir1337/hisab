import { cssVariables } from '@hisab/tokens'

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`

/** Emits the design tokens as CSS variables for light (:root) and dark (.dark). */
export function ThemeTokens() {
  // Printing always uses the light palette so a PDF from dark mode stays readable.
  const css = block(':root', cssVariables('light')) + block('.dark', cssVariables('dark')) + `@media print{${block('.dark', cssVariables('light'))}}`
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
