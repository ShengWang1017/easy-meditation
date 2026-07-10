import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { HeatmapDay } from '../domain/records';
import { AppText } from './AppText';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const;
const LEVEL_COLORS = [
  'rgba(229, 239, 242, 0.76)',
  'rgba(190, 233, 223, 0.72)',
  'rgba(132, 218, 204, 0.76)',
  'rgba(91, 191, 189, 0.82)'
] as const;
const MAX_LEVEL_COLORS = [
  'rgba(42, 143, 153, 0.88)',
  'rgba(133, 112, 207, 0.78)'
] as const;

export type HeatmapProps = {
  days: HeatmapDay[];
  serverListTruncated: boolean;
};

export function Heatmap({ days, serverListTruncated }: HeatmapProps) {
  const practicedDays = days.filter((day) => day.durationSeconds > 0).length;
  const bestDay = days.reduce<HeatmapDay | null>(
    (best, day) =>
      best === null || day.durationSeconds > best.durationSeconds ? day : best,
    null
  );
  const hasBestDay = Boolean(bestDay && bestDay.durationSeconds > 0);

  return (
    <View style={styles.card} testID="records-heatmap">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText accessibilityRole="header" style={styles.title} variant="cardTitle">
            热力日历
          </AppText>
          <AppText style={styles.supporting} tone="muted" variant="meta">
            近 28 天
          </AppText>
        </View>
        <View style={styles.practicedBadge}>
          <AppText style={styles.practicedLabel}>{practicedDays} 天练习</AppText>
        </View>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.weekdays}
        testID="heatmap-weekdays"
      >
        {WEEKDAYS.map((weekday) => (
          <AppText key={weekday} style={styles.weekday} tone="muted" variant="meta">
            {weekday}
          </AppText>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => (
          <View
            accessibilityLabel={`${day.label}，${
              day.durationSeconds > 0 ? day.durationLabel : '未练习'
            }，${day.sessions} 次`}
            accessibilityRole="text"
            accessible
            key={day.key}
            style={styles.cellSlot}
            testID={`heatmap-day-${day.key}`}
          >
            {day.level === 4 ? (
              <LinearGradient
                colors={[...MAX_LEVEL_COLORS]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.dayCell}
                testID={`heatmap-day-fill-${day.key}`}
              >
                <AppText style={[styles.dayNumber, styles.dayNumberMaximum]}>
                  {day.day}
                </AppText>
              </LinearGradient>
            ) : (
              <View
                style={[
                  styles.dayCell,
                  { backgroundColor: LEVEL_COLORS[day.level] }
                ]}
                testID={`heatmap-day-fill-${day.key}`}
              >
                <AppText
                  style={[
                    styles.dayNumber,
                    day.level === 0
                      ? styles.dayNumberEmpty
                      : styles.dayNumberPracticed
                  ]}
                >
                  {day.day}
                </AppText>
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <AppText style={styles.supporting} tone="muted" variant="meta">
          最长一格
        </AppText>
        <AppText numberOfLines={1} style={styles.bestDay}>
          {hasBestDay && bestDay
            ? `${bestDay.label} · ${bestDay.durationLabel}`
            : '从今天开始'}
        </AppText>
      </View>

      {serverListTruncated ? (
        <AppText style={styles.qualifier} tone="muted" variant="meta">
          基于最近 50 条记录
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 9,
    paddingTop: 13,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.68)',
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    boxShadow: '0 16px 34px rgba(86, 121, 148, 0.08)'
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  headerCopy: {
    gap: 3
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 17
  },
  supporting: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12
  },
  practicedBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(162, 139, 221, 0.14)',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: 10
  },
  practicedLabel: {
    color: '#6c5ca6',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14
  },
  weekdays: {
    flexDirection: 'row'
  },
  weekday: {
    color: '#7c8794',
    fontSize: 10,
    lineHeight: 10,
    textAlign: 'center',
    width: `${100 / 7}%`
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  cellSlot: {
    padding: 3,
    width: `${100 / 7}%`
  },
  dayCell: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 9,
    justifyContent: 'center'
  },
  dayNumber: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12
  },
  dayNumberEmpty: {
    color: 'rgba(82, 96, 108, 0.46)'
  },
  dayNumberPracticed: {
    color: '#176b70'
  },
  dayNumberMaximum: {
    color: '#f7ffff'
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 2
  },
  bestDay: {
    color: '#376a73',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14
  },
  qualifier: {
    color: '#7a8490',
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'right'
  }
});
