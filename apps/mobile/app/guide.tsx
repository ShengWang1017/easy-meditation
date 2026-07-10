import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '../src/components/AppText';
import { PrototypeIconButton } from '../src/components/PrototypeIconButton';
import { PrototypeScreen } from '../src/components/PrototypeScreen';
import { referenceImages } from '../src/theme/assets';
import { colors, shadows } from '../src/theme/tokens';

const GUIDE_ITEMS = [
  {
    title: '盒式呼吸法',
    description: '适合紧张或思绪很多的时候，用均匀节奏稳定自己。'
  },
  {
    title: '长呼气',
    description: '呼气更长，适合睡前或需要慢慢降速的时刻。'
  },
  {
    title: '等量呼吸法',
    description: '吸气和呼气等长，适合工作间隙重新找回专注。'
  },
  {
    title: '自定义',
    description: '按自己的舒适区调整节奏；任何不舒服都可以缩短停留。'
  }
] as const;

export default function GuideScreen() {
  const { width } = useWindowDimensions();
  const compact = width <= 380;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/practice');
    }
  }

  return (
    <PrototypeScreen
      backgroundVariant="guide"
      contentStyle={styles.content}
      scrollable
      testID="guide-screen"
    >
      <View style={styles.header} testID="guide-header">
        <PrototypeIconButton
          accessibilityLabel="返回呼吸训练首页"
          imageStyle={styles.backImage}
          onPress={goBack}
          source={referenceImages.back}
          style={styles.headerSide}
        />
        <AppText
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.headerTitle, compact ? styles.headerTitleCompact : null]}
          testID="guide-header-title"
          variant="displayTitle"
        >
          练习指南
        </AppText>
        <View style={styles.headerSide} />
      </View>

      <View
        style={[styles.copy, compact ? styles.copyCompact : null]}
        testID="guide-copy"
      >
        <AppText
          style={[styles.kicker, compact ? styles.kickerCompact : null]}
          testID="guide-kicker"
          variant="label"
        >
          开始前读一小段就好
        </AppText>
        <AppText
          style={[styles.heading, compact ? styles.headingCompact : null]}
          testID="guide-heading"
          variant="displayTitle"
        >
          呼吸训练让注意力有一个温柔的落点。
        </AppText>

        <View
          style={[styles.panel, compact ? styles.panelCompact : null]}
          testID="guide-panel"
        >
          <AppText
            style={[styles.itemTitle, compact ? styles.itemTitleCompact : null]}
            variant="cardTitle"
          >
            它为什么有用
          </AppText>
          <AppText
            style={[styles.body, compact ? styles.bodyCompact : null]}
            testID="guide-panel-body"
          >
            有节奏地吸气、停留和呼气，会让身体从紧绷里慢慢退出来。你不需要“清空大脑”，只要一次次回到下一次呼吸。
          </AppText>
        </View>

        <View style={styles.list} testID="guide-list">
          {GUIDE_ITEMS.map((item, index) => (
            <View
              key={item.title}
              style={[styles.listItem, compact ? styles.listItemCompact : null]}
              testID={`guide-list-item-${index}`}
            >
              <AppText
                style={[styles.itemTitle, compact ? styles.itemTitleCompact : null]}
                variant="cardTitle"
              >
                {item.title}
              </AppText>
              <AppText style={[styles.body, compact ? styles.bodyCompact : null]}>
                {item.description}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </PrototypeScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 18,
    paddingTop: 8
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 52
  },
  headerSide: {
    height: 52,
    width: 52
  },
  backImage: {
    height: 34,
    width: 34
  },
  headerTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 32,
    textAlign: 'center'
  },
  headerTitleCompact: {
    fontSize: 28,
    lineHeight: 28
  },
  copy: {
    flex: 1,
    gap: 16,
    paddingTop: 38
  },
  copyCompact: {
    gap: 12,
    paddingTop: 30
  },
  kicker: {
    color: '#6f7785',
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 21.6
  },
  kickerCompact: {
    fontSize: 16,
    lineHeight: 19.2
  },
  heading: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 33.48,
    marginBottom: 4
  },
  headingCompact: {
    fontSize: 23,
    lineHeight: 28.52
  },
  panel: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 28,
    paddingBottom: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
    ...shadows.guideCard
  },
  panelCompact: {
    borderRadius: 24,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 18
  },
  itemTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 25.3
  },
  itemTitleCompact: {
    fontSize: 19,
    lineHeight: 21.85
  },
  body: {
    color: '#69717f',
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 25.16,
    marginTop: 10
  },
  bodyCompact: {
    fontSize: 15,
    lineHeight: 21.3
  },
  list: {
    gap: 12,
    paddingBottom: 18
  },
  listItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 28,
    paddingBottom: 17,
    paddingHorizontal: 20,
    paddingTop: 18,
    ...shadows.guideCard
  },
  listItemCompact: {
    borderRadius: 22,
    paddingBottom: 14,
    paddingHorizontal: 17,
    paddingTop: 15
  }
});
