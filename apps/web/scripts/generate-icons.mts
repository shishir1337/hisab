/**
 * Renders every web app icon and iOS launch image from the shared brand geometry (lib/brand.ts):
 *   node scripts/generate-icons.mts        (from apps/web; Node ≥ 22.18 runs .mts directly)
 * The outputs are committed, so this only needs re-running when the mark or the launch screen list changes.
 *
 *   app/favicon.ico, app/icon.svg, app/apple-icon.png (180, full bleed: iOS rounds the corners)
 *   public/icons/icon-{192,512}.png          purpose "any" (the rounded tile)
 *   public/icons/maskable-{192,512}.png      purpose "maskable" (full bleed; the H sits well inside the safe zone)
 *   public/icons/monochrome-512.png          purpose "monochrome" (the H alone; the OS tints it)
 *   public/splash/launch-*.png               apple-touch-startup-image, light + dark per iPhone size
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BRAND_COLORS, brandTileSvg, H_PATH, LAUNCH_TILE_PX, TILE_RADIUS } from '../lib/brand.ts'
import { LAUNCH_SCREENS, launchImagePath } from '../lib/launch-screens.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const web = path.join(here, '..')
// sharp is in the workspace (hoisted via Expo's image tooling); it is not a dependency of the web app.
const require = createRequire(path.join(web, '../../package.json'))
// Minimal shape of the sharp API used here (sharp's own types aren't a dependency of the web app).
interface SharpImage {
  png: (o?: object) => SharpImage
  flatten: (o: { background: string }) => SharpImage
  composite: (layers: { input: Buffer; left: number; top: number }[]) => SharpImage
  toFile: (path: string) => Promise<unknown>
  toBuffer: () => Promise<Buffer>
}
type Sharp = (input: Buffer | { create: { width: number; height: number; channels: 3 | 4; background: string } }) => SharpImage
let sharp: Sharp
try {
  sharp = require('sharp')
} catch {
  throw new Error('sharp not found: run `pnpm install` at the repo root (it comes with the mobile toolchain)')
}

const out = (rel: string) => {
  const p = path.join(web, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  return p
}
const png = (svg: string) => sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false })
const log = (p: string) => console.log('wrote', path.relative(web, p))

// App icons
for (const px of [192, 512]) {
  const any = out(`public/icons/icon-${px}.png`)
  await png(brandTileSvg('light', px)).toFile(any)
  log(any)
  const maskable = out(`public/icons/maskable-${px}.png`)
  await png(brandTileSvg('light', px, { square: true })).toFile(maskable)
  log(maskable)
}
const mono = out('public/icons/monochrome-512.png')
await png(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100"><path d="${H_PATH}" fill="#FFFFFF"/></svg>`).toFile(mono)
log(mono)

const apple = out('app/apple-icon.png')
await sharp(Buffer.from(brandTileSvg('light', 180, { square: true }))).flatten({ background: BRAND_COLORS.light.tile }).png().toFile(apple)
log(apple)

// Favicon: an SVG that follows the browser's colour scheme, plus a classic .ico (16/32/48, PNG-encoded entries).
const L = BRAND_COLORS.light
const D = BRAND_COLORS.dark
const iconSvg = out('app/icon.svg')
fs.writeFileSync(
  iconSvg,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.t{fill:${L.tile}}.g{fill:${L.glyph}}@media (prefers-color-scheme:dark){.t{fill:${D.tile}}.g{fill:${D.glyph}}}</style><rect class="t" width="100" height="100" rx="${TILE_RADIUS}"/><path class="g" d="${H_PATH}"/></svg>\n`,
)
log(iconSvg)
const sizes = [16, 32, 48]
const images = await Promise.all(sizes.map((s) => png(brandTileSvg('light', s)).toBuffer()))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((s, i) => {
  const e = 6 + 16 * i
  header.writeUInt8(s, e)
  header.writeUInt8(s, e + 1)
  header.writeUInt16LE(1, e + 4) // colour planes
  header.writeUInt16LE(32, e + 6) // bits per pixel
  header.writeUInt32LE(images[i].length, e + 8)
  header.writeUInt32LE(offset, e + 12)
  offset += images[i].length
})
const ico = out('app/favicon.ico')
fs.writeFileSync(ico, Buffer.concat([header, ...images]))
log(ico)

// iOS launch images: the page colour with the tile centred at the launch size, exactly what the standalone
// launch intro (components/pwa/launch-intro.tsx) shows on its first frame.
for (const s of LAUNCH_SCREENS) {
  const W = s.w * s.dpr
  const H = s.h * s.dpr
  const tile = LAUNCH_TILE_PX * s.dpr
  for (const scheme of ['light', 'dark'] as const) {
    const file = out(`public${launchImagePath(s, scheme)}`)
    const mark = await png(brandTileSvg(scheme, tile)).toBuffer()
    await sharp({ create: { width: W, height: H, channels: 3, background: BRAND_COLORS[scheme].page } })
      .composite([{ input: mark, left: Math.round((W - tile) / 2), top: Math.round((H - tile) / 2) }])
      .png({ compressionLevel: 9 })
      .toFile(file)
    log(file)
  }
}
