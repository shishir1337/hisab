import { Tabs } from 'expo-router'
import { TabBar } from '@/components/tab-bar'
import { QuickLogProvider } from '@/features/quick-log/provider'

export default function TabsLayout() {
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
