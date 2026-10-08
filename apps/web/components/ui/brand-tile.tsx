import { H_PATH, TILE_RADIUS } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * The H brand tile as vector art (same geometry as the app icons, launch images and the Android mark).
 * Colours follow the theme (`brand` / `brand-fg`) unless `inverted` (white tile, for the ink panel).
 */
export function BrandTile({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn('shrink-0', className)}>
      <rect width="100" height="100" rx={TILE_RADIUS} className={inverted ? 'fill-white' : 'fill-brand'} />
      <path d={H_PATH} className={inverted ? 'fill-[#141414]' : 'fill-brand-fg'} />
    </svg>
  )
}
