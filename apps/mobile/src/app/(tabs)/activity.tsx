import { EmptyState, Screen } from '@/components/screen'

export default function ActivityScreen() {
  return (
    <Screen title="Activity">
      <EmptyState title="Nothing here yet" description="Every transaction, grouped by day, will appear here." />
    </Screen>
  )
}
