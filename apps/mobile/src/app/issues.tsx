import { clearIssues, discardIssue, Q, type UploadIssue } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { Text, View } from 'react-native'
import { Button } from '@/components/button'
import { FormScreen } from '@/components/form'
import { useTheme } from '@/lib/theme'

const TABLE_LABEL: Record<string, string> = {
  transactions: 'Transaction',
  accounts: 'Account',
  categories: 'Category',
  parties: 'Person / company',
  loans: 'Loan',
  lendings: 'Lending',
  recurring_rules: 'Recurring item',
  budgets: 'Budget',
}

/** Changes the server refused permanently (spec §9). Discarding removes only this notice. */
export default function IssuesScreen() {
  const db = usePowerSync()
  const { colors } = useTheme()
  const { data: issues } = useQuery<UploadIssue>(Q.uploadIssues)
  return (
    <FormScreen title="Unsynced changes">
      <Text style={{ color: colors.textMuted, fontSize: 13.5, marginBottom: 16 }}>
        These changes were saved on this phone but the server couldn’t accept them. Your other data is fine.
      </Text>
      {issues.length === 0 ? (
        <Text style={{ color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 }}>Everything is in sync ✓</Text>
      ) : (
        <>
          {issues.map((i) => (
            <View key={i.id} className="mb-2 rounded-card border border-border bg-surface p-4">
              <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>{TABLE_LABEL[i.table_name] ?? i.table_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>{i.message}</Text>
              <View className="mt-3 self-start">
                <Button variant="secondary" onPress={() => void discardIssue(db, i.id)}>
                  Dismiss
                </Button>
              </View>
            </View>
          ))}
          <View className="mt-2">
            <Button variant="ghost" onPress={() => void clearIssues(db)}>
              Dismiss all
            </Button>
          </View>
        </>
      )}
    </FormScreen>
  )
}
