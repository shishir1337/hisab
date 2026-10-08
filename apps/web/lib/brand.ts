/**
 * The "H" brand tile on a 100×100 grid — the same geometry as the Android app
 * (apps/mobile/src/lib/brand-geometry.ts), so the web icons, iOS launch images, the in-app mark and the
 * standalone launch intro all match the native app pixel for pixel. `scripts/generate-icons.mts` renders it.
 */
export const TILE_RADIUS = 31

/** H glyph: two stems and a crossbar, slightly rounded, optically centred. */
export const H_PATH = [
  'M33 32.5a2.5 2.5 0 0 1 2.5-2.5h5.5a2.5 2.5 0 0 1 2.5 2.5v35a2.5 2.5 0 0 1-2.5 2.5h-5.5a2.5 2.5 0 0 1-2.5-2.5z',
  'M56.5 32.5a2.5 2.5 0 0 1 2.5-2.5h5.5a2.5 2.5 0 0 1 2.5 2.5v35a2.5 2.5 0 0 1-2.5 2.5h-5.5a2.5 2.5 0 0 1-2.5-2.5z',
  'M42 45.5h16v8.5h-16z',
].join('')

/** Colours per scheme (match tokens.color.*.brand / brandFg / page). */
export const BRAND_COLORS = {
  light: { tile: '#141414', glyph: '#FFFFFF', page: '#F5F5F3' },
  dark: { tile: '#EDEDEC', glyph: '#0C0C0D', page: '#0C0C0D' },
} as const

/** Tile size on the launch screen, in CSS px (= the Android splash's 88 dp). */
export const LAUNCH_TILE_PX = 88

/** The tile as an SVG document; `square` drops the rounded corners (iOS and maskable icons are masked by the OS). */
export function brandTileSvg(scheme: 'light' | 'dark', px: number, { square = false } = {}): string {
  const c = BRAND_COLORS[scheme]
  const rx = square ? 0 : TILE_RADIUS
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="${scheme === 'light' ? 0.07 : 0}"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="${rx}" fill="${c.tile}"/>
  <rect width="100" height="100" rx="${rx}" fill="url(#hl)"/>
  <path d="${H_PATH}" fill="${c.glyph}"/>
</svg>`
}
