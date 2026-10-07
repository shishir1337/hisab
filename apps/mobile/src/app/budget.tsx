import { parseAmount } from '@hisab/core'
import { Q, removeBudget, setBudget, type CategoryOption } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { AmountField, ErrorLine, FormScreen, Label } from '@/components/form'
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
    <FormScreen title={overall ? 'Monthly budget' : 'Category budget'}>
      {!overall && !params.category && (
        <>
          <Label>Category</Label>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} icon={<Text style={{ fontSize: 14 }}>{c.icon}</Text>} selected={categoryId === c.id} onPress={() => (setCategoryId(c.id), setError(null))} />
            ))}
          </View>
        </>
      )}
      <Label hint={overall ? 'Everything you spend in a month' : 'Per month'}>Budget</Label>
      <AmountField value={amount} onChange={(v) => (setAmount(v), setError(null))} currency={currency} accessibilityLabel="Monthly budget" />
      <ErrorLine message={error} />
      <Button onPress={() => void save()} loading={busy}>
        Save budget
      </Button>
      {current && (
        <View className="mt-2">
          <Button variant="ghost" onPress={() => void remove()}>
            Remove budget
          </Button>
        </View>
      )}
    </FormScreen>
  )
}
