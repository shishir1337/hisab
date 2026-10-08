/**
 * Which ids are new since the last render — the rows that should animate in. Nothing animates on the first
 * render or first load, after a scope change (another month, filter or search) or when many arrive at once (a sync or a
 * restore of the whole list), so only a row the user just created or restored moves.
 */
export function arrivals(prev: ReadonlySet<string> | null, next: readonly string[], max = 3): Set<string> {
  // An empty baseline is "not loaded yet" as often as "really empty": never animate the first rows in.
  if (!prev || prev.size === 0) return new Set()
  const fresh = new Set<string>()
  for (const id of next) if (!prev.has(id)) fresh.add(id)
  return fresh.size > max ? new Set() : fresh
}
