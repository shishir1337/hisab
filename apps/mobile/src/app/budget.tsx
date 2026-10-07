import { parseAmount } from '@hisab/core'
import { Q, removeBudget, setBudget, type CategoryOption } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, FooterError, FormLink, FormScreen, Label } from '@/components/form'
import { IconTile } from '@/components/icon-tile'
import { useTheme } from '@/lib/theme'
import { useProfile } from '@/lib/profile'
import { useToast } from '@/lib/undo'

/**
 * Set a monthly budget. `?category=` (empty) edits the overall budget; `?category=<id>` a category's;
 * no param lets the user pick a category.
 */
export default function BudgetScreen() {
  const params = useLocalSearchParams<{ category?: string }>()
  const overall = params.category === ''
  const db = usePowerSync()
  const { userId, currency } = useProfile()
  const toast = useToast()
  const { data: categories } = useQuery<CategoryOption>(Q.categories, ['expense'])
  const { data: budgets, isLoading } = useQuery<{ category_id: string | null; amount_minor: number }>(
    'select category_id, amount_minor from budgets where deleted_at is null',
  )

  const [categoryId, setCategoryId] = useState<string | null>(params.category ? params.category : null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const target = overall ? null : categoryId
  const fixed = params.category ? categories.find((c) => c.id === params.category) : undefined
  const { colors } = useTheme()
  const current = overall || target ? budgets.find((b) => (b.category_id ?? null) === target) : undefined

  // Prefill once per chosen target, after the budgets query has loaded.
  const loadedFor = useRef<string | null>(null)
  const key = overall ? 'overall' : (target ?? '')
  useEffect(() => {
    if (isLoading || !key || loadedFor.current === key) return
    loadedFor.current = key
    setAmount(current ? String(current.amount_minor / 100) : '')
  }, [key, current, isLoading])

  const save = async () => {
    if (busy) return
    if (!overall && !categoryId) return setError('Pick a category')
    const parsed = parseAmount(amount)
    if (!parsed.ok) return setError('Enter a monthly amount')
    setBusy(true)
    await setBudget(db, userId, target, parsed.minor)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    router.back()
  }

  const remove = async () => {
    const before = current
    await removeBudget(db, target)
    toast({ message: 'Budget removed', onUndo: before ? () => setBudget(db, userId, target, before.amount_minor) : undefined })
    router.back()
  }

  return (
    <FormScreen
      title={overall ? 'Monthly budget' : 'Category budget'}
      footer={
        <>
          <FooterError message={error} />
          <Button onPress={() => void save()} loading={busy}>
            Save budget
          </Button>
        </>
      }
    >
      {!overall && !params.category && (
        <>
          <Label first>Category</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} icon={<Text style={{ fontSize: 14 }}>{c.icon}</Text>} selected={categoryId === c.id} onPress={() => (setCategoryId(c.id), setError(null))} />
            ))}
          </View>
        </>
      )}
      {params.category ? <TargetCard icon={fixed?.icon ?? '•'} tint={fixed?.color ?? null} name={fixed?.name ?? 'Category'} /> : null}
      {overall ? <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4 }}>One number for everything you spend in a month. Home and Plan show what’s safe to spend each day.</Text> : null}
      <Label hint={overall ? 'Per month, all spending' : 'Per month'}>Budget</Label>
      <AmountField value={amount} onChange={(v) => (setAmount(v), setError(null))} currency={currency} accessibilityLabel="Monthly budget" />
      {current && <FormLink danger label="Remove budget" onPress={() => void remove()} />}
    </FormScreen>
  )
}

function TargetCard({ icon, tint, name }: { icon: string; tint: string | null; name: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 }}>
      <IconTile icon={icon} tint={tint} size={40} />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{name}</Text>
    </View>
  )
}
