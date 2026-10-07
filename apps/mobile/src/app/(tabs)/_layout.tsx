import { Tabs } from 'expo-router'
import { TabBar } from '@/components/tab-bar'
import { useNotificationScheduler } from '@/features/notify/use-scheduler'
import { useAutoPostRecurring } from '@/features/plan/use-auto-post'
import { QuickLogProvider } from '@/features/quick-log/provider'

export default function TabsLayout() {
  useAutoPostRecurring()
  useNotificationScheduler()
  return (
    <QuickLogProvider>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="activity" />
        <Tabs.Screen name="plan" />
        <Tabs.Screen name="people" />
      </Tabs>
    </QuickLogProvider>
  )
}
