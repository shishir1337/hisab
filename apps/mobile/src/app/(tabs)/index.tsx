import { HeroCard } from '@/components/hero-card'
import { Screen } from '@/components/screen'
import { SyncPill } from '@/components/sync-pill'

export default function HomeScreen() {
  return (
    <Screen title="Home" accessory={<SyncPill />}>
      <HeroCard />
    </Screen>
  )
}
