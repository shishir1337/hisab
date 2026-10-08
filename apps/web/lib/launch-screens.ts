/**
 * iOS launch images (apple-touch-startup-image) for an installed Hisab. iOS only uses one whose media query
 * matches the device exactly (CSS size, pixel ratio, portrait), so each iPhone size is listed; light and dark
 * variants follow the system appearance. Rendered by `scripts/generate-icons.mts` into public/splash/.
 */
export interface LaunchScreen {
  /** CSS px (portrait). */
  w: number
  h: number
  dpr: 2 | 3
  /** Which phones use it (for humans). */
  devices: string
}

export const LAUNCH_SCREENS: LaunchScreen[] = [
  { w: 440, h: 956, dpr: 3, devices: 'iPhone 16 Pro Max, 17 Pro Max' },
  { w: 402, h: 874, dpr: 3, devices: 'iPhone 16 Pro, 17, 17 Pro' },
  { w: 430, h: 932, dpr: 3, devices: 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus' },
  { w: 393, h: 852, dpr: 3, devices: 'iPhone 14 Pro, 15, 15 Pro, 16, 16e' },
  { w: 428, h: 926, dpr: 3, devices: 'iPhone 12/13 Pro Max, 14 Plus' },
  { w: 390, h: 844, dpr: 3, devices: 'iPhone 12, 12 Pro, 13, 13 Pro, 14' },
  { w: 375, h: 812, dpr: 3, devices: 'iPhone X, XS, 11 Pro, 12/13 mini (zoomed)' },
  { w: 360, h: 780, dpr: 3, devices: 'iPhone 12 mini, 13 mini' },
  { w: 414, h: 896, dpr: 3, devices: 'iPhone XS Max, 11 Pro Max' },
  { w: 414, h: 896, dpr: 2, devices: 'iPhone XR, 11' },
  { w: 414, h: 736, dpr: 3, devices: 'iPhone 6s/7/8 Plus' },
  { w: 375, h: 667, dpr: 2, devices: 'iPhone SE (2nd/3rd gen), 6s/7/8' },
]

export const launchImagePath = (s: LaunchScreen, scheme: 'light' | 'dark') => `/splash/launch-${s.w * s.dpr}x${s.h * s.dpr}-${scheme}.png`

export const launchImageMedia = (s: LaunchScreen, scheme: 'light' | 'dark') =>
  `screen and (device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`
