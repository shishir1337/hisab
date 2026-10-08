import { daysBetween } from '@hisab/core'
import { markEmiPaid, postOccurrence, softDeleteTransaction } from '@hisab/db'
import { usePowerSync } from '@powersync/react'
import { router } from 'expo-router'
import { Check } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { DueItem } from '@/features/plan/use-due'
import { useProfile } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/undo'
import { shortDay } from './form'
import { IconTile } from './icon-tile'
import { Money } from './money'
import { Press } from './press'
import { Divider, SectionHeader } from './screen'

const MAX_ROWS = 4

/** Home "Due soon" (spec §7.3, same list as web): ✓ records it, tapping the row opens it to adjust or skip. */
export function DueStrip({ items, today }: { items: DueItem[]; today: string }) {
  const { colors } = useTheme()
  if (items.length === 0) return null
  const shown = items.slice(0, MAX_ROWS)
  const more = items.length - shown.length
  return (
    <View>
      <SectionHeader title="Due soon" action="See all" onAction={() => router.navigate('/plan')} />
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
        {shown.map((item, i) => (
          <View key={item.key}>
            {i > 0 && <Divider inset={52} />}
            <DueRow item={item} today={today} />
          </View>
        ))}
        {more > 0 && (
          <>
            <Divider />
            <Press accessibilityRole="button" onPress={() => router.navigate('/plan')} style={{ height: 48, justifyContent: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 13.5, fontWeight: '500' }}>
                {more} more due · <Text style={{ color: colors.text, fontWeight: '600' }}>Open Plan</Text>
              </Text>
            </Press>
          </>
        )}
      </View>
    </View>
  )
}

/** Today · Tomorrow · In 3 days · 12 Oct — or "Overdue · 4 days". */
export function dueLabel(date: string, today: string, overdue: boolean): string {
  const d = daysBetween(today, date)
  if (overdue || d < 0) return d === -1 ? 'Overdue · since yesterday' : `Overdue · ${-d} days`
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d < 7) return `In ${d} days`
  return shortDay(date, today)
}

function DueRow({ item, today }: { item: DueItem; today: string }) {
  const { colors } = useTheme()
  const db = usePowerSync()
  const { userId, currency, grouping } = useProfile()
  const toast = useToast()
  const busy = useRef(false)
  const [saving, setSaving] = useState(false)

  const title = item.kind === 'emi' ? item.loan.name : item.rule.note || item.rule.category_name || (item.rule.type === 'transfer' ? 'Transfer' : 'Recurring')
  const amount = item.kind === 'emi' ? item.loan.emi_amount_minor : item.rule.amount_minor
  const positive = item.kind === 'recurring' && item.rule.type === 'income'
  const canQuickRecord = item.kind === 'recurring' || Boolean(item.loan.default_account_id)
  const when = dueLabel(item.date, today, item.overdue)
  const meta = item.kind === 'emi' ? `${when} · EMI ${item.progress.paid + 1} of ${item.loan.total_installments}` : when

  const record = async () => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    try {
      if (item.kind === 'recurring') {
        const r = await postOccurrence(db, userId, item.rule, item.date, { occurred_on: item.date > today ? today : item.date })
        toast(r.created ? { message: `Recorded · ${title}`, onUndo: () => softDeleteTransaction(db, r.id) } : { message: 'Already recorded' })
      } else {
        const id = await markEmiPaid(db, userId, item.loan.id, { occurred_on: today })
        toast({ message: `EMI paid · ${title}`, onUndo: () => softDeleteTransaction(db, id) })
      }
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t record it', kind: 'error' })
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const open = () =>
    router.push(item.kind === 'emi' ? { pathname: '/loan', params: { id: item.loan.id } } : { pathname: '/due', params: { rule: item.rule.id, date: item.date } })

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 64 }}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${meta}`}
        accessibilityHint={item.kind === 'emi' ? 'Opens the loan' : 'Opens it to change the amount or skip'}
        onPress={open}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
      >
        <IconTile icon={item.kind === 'emi' ? '🏦' : (item.rule.category_icon ?? '🔁')} tint={item.kind === 'emi' ? 'slate' : item.rule.category_color} size={40} />
        <View style={{ flex: 1, marginLeft: 12, marginRight: 10 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '500', letterSpacing: -0.1 }}>
            {title}
          </Text>
          <Text numberOfLines={1} style={{ color: item.overdue ? colors.danger : colors.textFaint, fontSize: 12.5, marginTop: 2, fontWeight: item.overdue ? '600' : '400' }}>
            {meta}
          </Text>
        </View>
        <Money minor={amount} currency={currency} grouping={grouping} hideCode size={15} weight="600" color={positive ? colors.positive : colors.text} />
      </Press>
      {/* Fixed-width action column so amounts line up whether or not a row can be recorded in one tap. */}
      <View style={{ width: 52, alignItems: 'flex-end' }}>
        {canQuickRecord && (
          <Press
            accessibilityRole="button"
            accessibilityLabel={item.kind === 'emi' ? `Mark ${title} EMI paid` : `Record ${title}`}
            hitSlop={6}
            feedback="scale"
            disabled={saving}
            onPress={() => void record()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            {saving ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Check size={18} color={colors.text} strokeWidth={2.4} />}
          </Press>
        )}
      </View>
    </View>
  )
}

export function ProgressBar({ ratio, color, height = 6 }: { ratio: number; color?: string; height?: number }) {
  const { colors } = useTheme()
  return (
    <View style={{ marginTop: 10, height, overflow: 'hidden', borderRadius: height / 2, backgroundColor: colors.surfaceMuted }}>
      <View style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, height: '100%', backgroundColor: color ?? colors.brand, borderRadius: height / 2 }} />
    </View>
  )
}
