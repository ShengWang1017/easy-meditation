import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../src/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentStrong,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600'
        },
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 12,
          borderTopWidth: 0,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          shadowColor: '#4a4a70',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 12
        }
      }}
    >
      <Tabs.Screen
        name="practice"
        options={{
          title: '冥想',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'flower' : 'flower-outline'} size={size} color={color} />
          )
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '记录',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          )
        }}
      />
    </Tabs>
  );
}
