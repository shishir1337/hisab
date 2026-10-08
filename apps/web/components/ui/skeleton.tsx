import { cn } from '@/lib/utils'

const WIDTHS = [['46%', '28%'], ['34%', '22%'], ['52%', '30%'], ['40%', '24%'], ['30%', '20%']] as const

/**
 * Placeholder rows shaped exactly like a transaction row (TxLine: 36px tile, 21px title line, 19px meta line,
 * amount on the right), so nothing moves when the real rows arrive.
 */
export function TxSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <ul aria-hidden className={cn('flex flex-col', className)}>
      {Array.from({ length: count }, (_, i) => {
        const [a, b] = WIDTHS[i % WIDTHS.length]!
        return (
          <li key={i} className="flex items-center gap-3 px-2 py-2.5">
            <span className="skeleton size-9 shrink-0 rounded-tile" />
            <span className="min-w-0 flex-1">
              <span className="flex h-[21px] items-center">
                <span className="skeleton block h-3.5" style={{ width: a }} />
              </span>
              <span className="flex h-[19px] items-center">
                <span className="skeleton block h-3" style={{ width: b }} />
              </span>
            </span>
            <span className="skeleton block h-3.5 w-16 shrink-0" />
          </li>
        )
      })}
    </ul>
  )
}
