import { Tabs } from 'expo-router'
import { TabBar } from '@/components/tab-bar'
import { useNotificationScheduler } from '@/features/notify/use-scheduler'
import { useAutoPostRecurring } from '@/features/plan/use-auto-post'
import { QuickLogProvider } from '@/features/quick-log/provider'
import { useTheme } from '@/lib/theme'

export default function TabsLayout() {
  useAutoPostRecurring()
  useNotificationScheduler()
  const { colors } = useTheme()
  return (
    <QuickLogProvider>
      {/* sceneStyle: without it every tab sat on React Navigation's default #F2F2F2, not the page token. */}
      <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.page } }} tabBar={(props) => <TabBar {...props} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="activity" />
        <Tabs.Screen name="plan" />
        <Tabs.Screen name="people" />
      </Tabs>
    </QuickLogProvider>
  )
}
