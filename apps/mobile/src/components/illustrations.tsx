import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { useTheme } from '@/lib/theme'

/**
 * Small monochrome line illustrations for empty states (ink style: one muted fill, hairline strokes, a single
 * ink accent). 120×84, drawn on a 4px grid so they stay crisp at 1×–3×.
 */
function useInk() {
  const { colors, scheme } = useTheme()
  return {
    fill: colors.surfaceMuted,
    paper: colors.surface,
    line: scheme === 'dark' ? '#5A5B60' : '#C9C9C3',
    faint: scheme === 'dark' ? '#3A3B3F' : '#E2E2DC',
    ink: colors.text,
  }
}

/** A receipt with empty lines and a pen mark — "nothing logged in this month". */
export function LedgerArt({ size = 120 }: { size?: number }) {
  const c = useInk()
  const h = (size * 84) / 120
  return (
    <Svg width={size} height={h} viewBox="0 0 120 84" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={60} cy={44} r={36} fill={c.fill} />
      <Path d="M40 14h40v58l-5-4-5 4-5-4-5 4-5-4-5 4-5-4-5 4z" fill={c.paper} stroke={c.line} strokeWidth={1.5} strokeLinejoin="round" />
      <Line x1={47} y1={26} x2={73} y2={26} stroke={c.line} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={47} y1={35} x2={66} y2={35} stroke={c.faint} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={47} y1={44} x2={70} y2={44} stroke={c.faint} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={47} y1={53} x2={62} y2={53} stroke={c.faint} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M86 50l10-10 4 4-10 10-5 1z" fill={c.ink} />
      <Line x1={94} y1={42} x2={98} y2={46} stroke={c.paper} strokeWidth={1.2} />
    </Svg>
  )
}

/** Two people and a coin passing between them — "lent someone money?". */
export function PeopleArt({ size = 120 }: { size?: number }) {
  const c = useInk()
  const h = (size * 84) / 120
  return (
    <Svg width={size} height={h} viewBox="0 0 120 84" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={60} cy={44} r={36} fill={c.fill} />
      <Circle cx={38} cy={34} r={9} fill={c.paper} stroke={c.line} strokeWidth={1.5} />
      <Path d="M22 66c0-10 7-17 16-17s16 7 16 17" fill={c.paper} stroke={c.line} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={82} cy={34} r={9} fill={c.paper} stroke={c.line} strokeWidth={1.5} />
      <Path d="M66 66c0-10 7-17 16-17s16 7 16 17" fill={c.paper} stroke={c.line} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M50 20c6-6 14-6 20 0" fill="none" stroke={c.line} strokeWidth={1.5} strokeLinecap="round" strokeDasharray="2 4" />
      <Circle cx={60} cy={15} r={7} fill={c.ink} />
      <Line x1={60} y1={12} x2={60} y2={18} stroke={c.paper} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  )
}

/** A calendar page with one day ringed — budgets, recurring items and loans. */
export function PlanArt({ size = 120 }: { size?: number }) {
  const c = useInk()
  const h = (size * 84) / 120
  const days = [0, 1, 2, 3, 4].flatMap((col) => [0, 1, 2].map((row) => ({ x: 44 + col * 8, y: 40 + row * 9 })))
  return (
    <Svg width={size} height={h} viewBox="0 0 120 84" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={60} cy={44} r={36} fill={c.fill} />
      <Rect x={36} y={18} width={48} height={52} rx={8} fill={c.paper} stroke={c.line} strokeWidth={1.5} />
      <Line x1={36} y1={31} x2={84} y2={31} stroke={c.line} strokeWidth={1.5} />
      <Line x1={46} y1={13} x2={46} y2={22} stroke={c.line} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={74} y1={13} x2={74} y2={22} stroke={c.line} strokeWidth={1.5} strokeLinecap="round" />
      {days.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={1.6} fill={i === 4 ? c.ink : c.faint} />
      ))}
      <Circle cx={52} cy={49} r={6} fill="none" stroke={c.ink} strokeWidth={1.6} />
    </Svg>
  )
}

/** Three bars, one filled in ink — "set a budget". */
export function BudgetArt({ size = 120 }: { size?: number }) {
  const c = useInk()
  const h = (size * 84) / 120
  const bars = [
    { y: 30, w: 30 },
    { y: 42, w: 22, ink: true },
    { y: 54, w: 38 },
  ]
  return (
    <Svg width={size} height={h} viewBox="0 0 120 84" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={60} cy={44} r={36} fill={c.fill} />
      <Rect x={32} y={20} width={56} height={46} rx={8} fill={c.paper} stroke={c.line} strokeWidth={1.5} />
      {bars.map((b) => (
        <Rect key={b.y} x={40} y={b.y} width={40} height={4} rx={2} fill={c.faint} />
      ))}
      {bars.map((b) => (
        <Rect key={`f${b.y}`} x={40} y={b.y} width={b.w} height={4} rx={2} fill={b.ink ? c.ink : c.line} />
      ))}
    </Svg>
  )
}

/** Steps going down to a flag — "a loan you're paying off". */
export function LoanArt({ size = 120 }: { size?: number }) {
  const c = useInk()
  const h = (size * 84) / 120
  return (
    <Svg width={size} height={h} viewBox="0 0 120 84" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={60} cy={44} r={36} fill={c.fill} />
      <Path d="M30 30h16v10h14v10h14v10h16v8H30z" fill={c.paper} stroke={c.line} strokeWidth={1.5} strokeLinejoin="round" />
      <Line x1={84} y1={34} x2={84} y2={60} stroke={c.ink} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M84 34h10l-3 4 3 4H84z" fill={c.ink} />
    </Svg>
  )
}
