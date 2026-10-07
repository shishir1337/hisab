import { Tabs } from 'expo-router'
import { TabBar } from '@/components/tab-bar'

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="people" />
    </Tabs>
  )
}
