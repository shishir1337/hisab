/**
 * Small monochrome empty-state illustrations in the app's ink style: hairline strokes in the text colour,
 * paper-white and muted fills, one solid ink accent. Purely decorative (aria-hidden), theme-aware via tokens.
 */
const frame = { width: 120, height: 84, viewBox: '0 0 120 84', fill: 'none', 'aria-hidden': true } as const
const ink = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** A month page with nothing written on it, and a receipt curling off the side. */
export function EmptyMonthArt() {
  return (
    <svg {...frame} className="text-text-faint">
      <ellipse cx="60" cy="77" rx="38" ry="3.5" fill="var(--surface-muted)" />
      <rect x="22" y="14" width="56" height="58" rx="9" fill="var(--surface)" {...ink} />
      <path d="M22 28h56" {...ink} />
      <rect x="22.75" y="14.75" width="54.5" height="13" rx="8.25" fill="var(--text)" stroke="none" opacity="0.9" />
      <path d="M36 10v8M64 10v8" {...ink} stroke="var(--text)" strokeWidth="2.2" />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => <circle key={`${r}${c}`} cx={32 + c * 9} cy={38 + r * 8.5} r="1.6" fill="currentColor" opacity={r === 1 && c === 2 ? 0 : 0.45} />),
      )}
      <rect x="47.5" y="44" width="9" height="9" rx="2.5" stroke="var(--text)" strokeWidth="1.5" fill="var(--surface)" />
      <path d="M80 34h18a3 3 0 0 1 3 3v30l-3.5-2.5L94 67l-3.5-2.5L87 67l-3.5-2.5L80 67Z" fill="var(--surface)" {...ink} />
      <path d="M85 42h11M85 48h8M85 54h10" {...ink} />
    </svg>
  )
}

/** Two people and a coin passing between them. */
export function PeopleArt() {
  return (
    <svg {...frame} className="text-text-faint">
      <ellipse cx="60" cy="77" rx="40" ry="3.5" fill="var(--surface-muted)" />
      <circle cx="34" cy="32" r="10" fill="var(--surface)" {...ink} />
      <path d="M17 70c0-11 7.5-19 17-19s17 8 17 19" fill="var(--surface)" {...ink} />
      <circle cx="86" cy="32" r="10" fill="var(--surface-muted)" {...ink} />
      <path d="M69 70c0-11 7.5-19 17-19s17 8 17 19" fill="var(--surface-muted)" {...ink} />
      <path d="M48 20c7-6 17-6 24 0" {...ink} strokeDasharray="2 3.5" />
      <path d="m69.5 16.5 3 3.6-4.4 1.2" {...ink} />
      <circle cx="60" cy="44" r="8" fill="var(--text)" />
      <path d="M57.5 44h5M60 41.5v5" stroke="var(--page)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** A target with an arrow resting in the centre ring. */
export function BudgetArt() {
  return (
    <svg {...frame} className="text-text-faint">
      <ellipse cx="60" cy="77" rx="34" ry="3.5" fill="var(--surface-muted)" />
      <circle cx="56" cy="42" r="28" fill="var(--surface)" {...ink} />
      <circle cx="56" cy="42" r="19" fill="var(--surface-muted)" {...ink} />
      <circle cx="56" cy="42" r="10" fill="var(--surface)" {...ink} />
      <circle cx="56" cy="42" r="3.5" fill="var(--text)" />
      <path d="M58 40 92 12" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
      <path d="m92 12-1 7m1-7-7 1M88 9.5l8 0m-2.5-3.5 0 8" {...ink} />
    </svg>
  )
}

/** A calendar card with a repeat loop. */
export function RecurringArt() {
  return (
    <svg {...frame} className="text-text-faint">
      <ellipse cx="60" cy="77" rx="36" ry="3.5" fill="var(--surface-muted)" />
      <rect x="28" y="18" width="50" height="52" rx="9" fill="var(--surface)" {...ink} />
      <path d="M28 31h50M40 13v9M66 13v9" {...ink} />
      <path d="M38 41h10M38 50h18M38 59h12" {...ink} />
      <circle cx="80" cy="54" r="15" fill="var(--text)" />
      <path d="M73.5 51.5a7 7 0 0 1 12.2-2.8M86.5 56.5a7 7 0 0 1-12.2 2.8" stroke="var(--page)" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <path d="M86.3 44.8v4.2h-4.2M73.7 63.2V59h4.2" stroke="var(--page)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

/** A bank front with a progress bar beneath. */
export function LoanArt() {
  return (
    <svg {...frame} className="text-text-faint">
      <ellipse cx="60" cy="77" rx="38" ry="3.5" fill="var(--surface-muted)" />
      <path d="M30 32 60 15l30 17Z" fill="var(--surface)" {...ink} />
      <path d="M30 32h60" {...ink} />
      {[38, 51, 64, 77].map((x) => (
        <rect key={x} x={x - 2.5} y="36" width="5" height="22" rx="1.5" fill="var(--surface-muted)" {...ink} />
      ))}
      <path d="M28 61h64" {...ink} />
      <rect x="34" y="67" width="52" height="5" rx="2.5" fill="var(--surface-muted)" {...ink} />
      <rect x="34" y="67" width="30" height="5" rx="2.5" fill="var(--text)" />
      <circle cx="60" cy="25" r="2.2" fill="var(--text)" />
    </svg>
  )
}
