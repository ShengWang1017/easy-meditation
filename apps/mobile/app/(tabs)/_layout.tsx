import { Tabs } from 'expo-router';
import { colors } from '../../src/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentStrong,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          borderTopColor: colors.tabBorder,
          backgroundColor: colors.surfaceStrong
        }
      }}
    >
      <Tabs.Screen name="practice" options={{ title: '冥想' }} />
      <Tabs.Screen name="records" options={{ title: '记录' }} />
    </Tabs>
  );
}
