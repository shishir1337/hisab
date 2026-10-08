/**
 * The "H" brand tile, drawn on a 100×100 grid. One source of truth for the in-app mark (react-native-svg)
 * and the native splash PNGs (`scripts/generate-splash.mts` renders this exact geometry), so the launch
 * intro's first frame matches the OS splash pixel for pixel.
 */
export const TILE_RADIUS = 31

/** H glyph: two stems and a crossbar, slightly rounded, optically centred (the bar sits a hair above middle). */
export const H_PATH = [
  // left stem
  'M33 32.5a2.5 2.5 0 0 1 2.5-2.5h5.5a2.5 2.5 0 0 1 2.5 2.5v35a2.5 2.5 0 0 1-2.5 2.5h-5.5a2.5 2.5 0 0 1-2.5-2.5z',
  // right stem
  'M56.5 32.5a2.5 2.5 0 0 1 2.5-2.5h5.5a2.5 2.5 0 0 1 2.5 2.5v35a2.5 2.5 0 0 1-2.5 2.5h-5.5a2.5 2.5 0 0 1-2.5-2.5z',
  // crossbar
  'M42 45.5h16v8.5h-16z',
].join('')

/** Colours per scheme (match tokens.color.*.brand / brandFg / page). */
export const BRAND_COLORS = {
  light: { tile: '#141414', glyph: '#FFFFFF', page: '#F5F5F3' },
  dark: { tile: '#EDEDEC', glyph: '#0C0C0D', page: '#0C0C0D' },
} as const

/** Size of the tile on the native splash, in dp (app.json → expo-splash-screen `imageWidth`). */
export const SPLASH_TILE_DP = 88

/** The full mark as an SVG document (used by the splash generator). */
export function brandTileSvg(scheme: 'light' | 'dark', px: number): string {
  const c = BRAND_COLORS[scheme]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="${scheme === 'light' ? 0.07 : 0.0}"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="100" height="100" rx="${TILE_RADIUS}" fill="${c.tile}"/>
  <rect x="0" y="0" width="100" height="100" rx="${TILE_RADIUS}" fill="url(#hl)"/>
  <path d="${H_PATH}" fill="${c.glyph}"/>
</svg>`
}
