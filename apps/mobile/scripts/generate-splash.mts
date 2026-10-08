/**
 * Renders the native splash icons from the shared brand geometry:
 *   node scripts/generate-splash.mts   (Node ≥ 22.18 runs .ts directly)
 * Outputs assets/images/splash-icon.png (light) and splash-icon-dark.png (dark), 1024 px square — the tile
 * only, no padding; expo-splash-screen scales it to `imageWidth` dp in the 288 dp Android 12+ icon box.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandTileSvg } from '../src/lib/brand-geometry.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
// sharp is installed in the workspace (via Expo's image tooling); resolve it from the repo root.
const require = createRequire(path.join(here, '../../../package.json'))
let sharp: (input: Buffer) => { png: () => { toFile: (p: string) => Promise<unknown> } }
try {
  sharp = require('sharp')
} catch {
  const pnpm = path.join(here, '../../../node_modules/.pnpm')
  const fs = await import('node:fs')
  const dir = fs.readdirSync(pnpm).find((d) => d.startsWith('sharp@'))
  if (!dir) throw new Error('sharp not found — install it to regenerate the splash icons')
  sharp = require(path.join(pnpm, dir, 'node_modules/sharp'))
}

const SIZE = 1024
for (const scheme of ['light', 'dark'] as const) {
  const out = path.join(here, '../assets/images', scheme === 'light' ? 'splash-icon.png' : 'splash-icon-dark.png')
  await sharp(Buffer.from(brandTileSvg(scheme, SIZE))).png().toFile(out)
  console.log('wrote', path.relative(process.cwd(), out))
}
