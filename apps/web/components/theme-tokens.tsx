import { cssVariables } from '@hisab/tokens'

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`

/** Emits the design tokens as CSS variables for light (:root) and dark (.dark). */
export function ThemeTokens() {
  const css = block(':root', cssVariables('light')) + block('.dark', cssVariables('dark'))
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
