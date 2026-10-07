import { clearIssues, describeIssue, discardIssue, Q, type UploadIssue } from '@hisab/db'
import { usePowerSync, useQuery } from '@powersync/react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { Button } from '@/components/button'
import { FormLink, FormScreen } from '@/components/form'
import { EmptyState } from '@/components/screen'
import { useTheme } from '@/lib/theme'

/** Changes the server refused permanently (spec §9). Discarding removes only this notice. */
export default function IssuesScreen() {
  const db = usePowerSync()
  const { colors } = useTheme()
  const { data: issues } = useQuery<UploadIssue>(Q.uploadIssues)
  return (
    <FormScreen title="Unsynced changes">
      {issues.length === 0 ? (
        <View style={{ marginTop: 8 }}>
          <EmptyState icon={<CheckCircle2 size={20} color={colors.positive} />} title="Everything is in sync" description="Nothing is waiting or was refused." />
        </View>
      ) : (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: 16 }}>
            The server refused these changes, so they were undone on this phone. Re-enter any you still need — your other data is fine.
          </Text>
          <View style={{ gap: 10 }}>
            {issues.map((i) => (
              <View key={i.id} style={{ flexDirection: 'row', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 }}>
                <AlertTriangle size={18} color={colors.warning} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{describeIssue(i)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 17 }}>{i.message}</Text>
                  <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                    <Button size="sm" variant="secondary" onPress={() => void discardIssue(db, i.id)}>
                      Dismiss
                    </Button>
                  </View>
                </View>
              </View>
            ))}
          </View>
          {issues.length > 1 && <FormLink label="Dismiss all" onPress={() => void clearIssues(db)} />}
        </>
      )}
    </FormScreen>
  )
}
