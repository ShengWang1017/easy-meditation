import { Tabs } from 'expo-router';
import { BottomPillNav } from '../../src/components/BottomPillNav';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomPillNav {...props} />}
      screenOptions={{
        headerShown: false
      }}
    >
      <Tabs.Screen
        name="practice"
        options={{
          title: '冥想'
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '记录'
        }}
      />
    </Tabs>
  );
}
