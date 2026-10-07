import type { Grouping } from '@hisab/core'
import type { TransactionView } from '@hisab/db'
import { ArrowLeftRight } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'
import { IconTile } from './icon-tile'
import { Money } from './money'

/** One ledger line: tile, title, account/time, signed amount. Transfers render neutral (spec §7.3). */
export function TransactionRow({
  tx,
  currency,
  grouping,
  onPress,
  showTime = true,
}: {
  tx: TransactionView
  currency: string
  grouping: Grouping
  onPress?: () => void
  showTime?: boolean
}) {
  const { colors } = useTheme()
  const isTransfer = tx.type === 'transfer'
  const positive = tx.type === 'income' || tx.type === 'lending_in'
  const title = isTransfer ? `${tx.account_name ?? ''} → ${tx.to_account_name ?? ''}` : tx.note || tx.category_name || 'Transaction'
  const subtitle = [
    isTransfer ? 'Transfer' : tx.note ? tx.category_name : null,
    tx.party_name,
    isTransfer ? null : tx.account_name,
    showTime ? new Date(tx.occurred_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center py-2.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {isTransfer ? (
        <View className="h-9 w-9 items-center justify-center rounded-[11px] bg-surface-muted">
          <ArrowLeftRight size={16} color={colors.textMuted} />
        </View>
      ) : (
        <IconTile icon={tx.category_icon} tint={tx.category_color} />
      )}
      <View className="ml-3 flex-1">
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14.5, fontWeight: '500' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Money
        minor={positive ? tx.amount_minor : isTransfer ? tx.amount_minor : -tx.amount_minor}
        currency={currency}
        grouping={grouping}
        sign={isTransfer ? 'never' : 'always'}
        hideCode
        size={14.5}
        weight="600"
        color={isTransfer ? colors.textFaint : positive ? colors.positive : colors.text}
      />
    </Pressable>
  )
}
