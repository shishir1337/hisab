import type { Grouping } from '@hisab/core'
import type { TransactionView } from '@hisab/db'
import { ArrowLeftRight } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'
import { IconTile } from './icon-tile'
import { Money } from './money'
import { Press } from './press'

const LABEL: Record<TransactionView['type'], string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  emi: 'EMI',
  lending_out: 'Money given',
  lending_in: 'Money received',
}

/** Same title rule as web: note, else category, else what kind of entry it is. */
export function txTitle(tx: TransactionView): string {
  return tx.type === 'transfer' ? `${tx.account_name ?? ''} → ${tx.to_account_name ?? ''}` : tx.note || tx.category_name || LABEL[tx.type]
}

/** One ledger line: tile, title, category · account · time, signed amount. Transfers render neutral (spec §7.3). */
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
  const title = txTitle(tx)
  const subtitle = [
    isTransfer ? 'Transfer' : tx.note ? (tx.category_name ?? LABEL[tx.type]) : null,
    tx.party_name,
    isTransfer ? null : tx.account_name,
    showTime ? new Date(tx.occurred_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Press
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Opens to edit' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 10 }}
    >
      {isTransfer ? (
        <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
          <ArrowLeftRight size={17} color={colors.textMuted} />
        </View>
      ) : (
        <IconTile icon={tx.category_icon ?? (tx.type === 'emi' ? '🏦' : tx.type.startsWith('lending') ? '🤝' : null)} tint={tx.category_color} size={40} />
      )}
      <View style={{ flex: 1, marginLeft: 12, marginRight: 12 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '500', letterSpacing: -0.1 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 2 }}>
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
        size={15}
        weight="600"
        color={isTransfer ? colors.textFaint : positive ? colors.positive : colors.text}
      />
    </Press>
  )
}
