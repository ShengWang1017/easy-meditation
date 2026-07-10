import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, layout, typography } from '../theme/tokens';
import { AppText } from './AppText';

const TAB_LABELS: Record<string, '冥想' | '记录'> = {
  practice: '冥想',
  records: '记录'
};

export function BottomPillNav({
  state,
  navigation,
  insets
}: BottomTabBarProps) {
  const routes = state.routes
    .filter((route) => route.name in TAB_LABELS)
    .slice(0, 2);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <View
        accessibilityLabel="主导航"
        accessibilityRole="tablist"
        style={styles.pill}
        testID="bottom-pill-nav"
      >
        {routes.map((route) => {
          const routeIndex = state.routes.findIndex(
            (candidate) => candidate.key === route.key
          );
          const focused = state.index === routeIndex;
          const label = TAB_LABELS[route.name]!;

          function press() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          }

          function longPress() {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key
            });
          }

          return (
            <Pressable
              accessibilityLabel={label}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              hitSlop={{ top: 5, right: 0, bottom: 5, left: 0 }}
              key={route.key}
              onLongPress={longPress}
              onPress={press}
              style={({ pressed }) => [
                styles.tab,
                focused ? styles.activeTab : null,
                pressed ? styles.pressedTab : null
              ]}
              testID={`bottom-pill-${route.name}`}
            >
              <AppText
                style={[styles.label, focused ? styles.activeLabel : null]}
                variant="label"
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.underline} testID="bottom-pill-underline" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingTop: 4
  },
  pill: {
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
    borderRadius: layout.navRadius,
    flexDirection: 'row',
    height: layout.navHeight,
    padding: 4,
    width: layout.navWidth
  },
  tab: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minWidth: 0
  },
  activeTab: {
    backgroundColor: colors.activeNav
  },
  pressedTab: {
    opacity: 0.78
  },
  label: {
    ...typography.nav,
    color: '#73808c',
    lineHeight: 20
  },
  activeLabel: {
    color: colors.accent
  },
  underline: {
    backgroundColor: colors.activeNav,
    borderRadius: 99,
    height: 5,
    marginTop: 12,
    width: 108
  }
});
