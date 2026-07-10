import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { HeatmapDay } from '../domain/records';
import { Heatmap } from './Heatmap';

function makeDays(): HeatmapDay[] {
  return Array.from({ length: 28 }, (_, index) => ({
    key: `2026-07-${String(index + 1).padStart(2, '0')}`,
    day: index + 1,
    label: `7月${index + 1}日`,
    durationSeconds: 0,
    durationLabel: '0 秒',
    minutes: 0,
    sessions: 0,
    level: 0
  }));
}

function withDay(
  days: HeatmapDay[],
  index: number,
  patch: Partial<HeatmapDay>
): HeatmapDay[] {
  return days.map((day, candidate) =>
    candidate === index ? { ...day, ...patch } : day
  );
}

describe('Heatmap', () => {
  it('renders exactly 28 today-inclusive cells with complete accessible labels', () => {
    let days = makeDays();
    days = withDay(days, 1, {
      durationSeconds: 1,
      durationLabel: '1 秒',
      minutes: 1 / 60,
      sessions: 1,
      level: 1
    });
    const view = render(<Heatmap days={days} serverListTruncated={false} />);

    expect(view.getAllByTestId(/^heatmap-day-2026/)).toHaveLength(28);
    expect(view.getByTestId('heatmap-day-2026-07-01').props.accessibilityLabel).toBe(
      '7月1日，未练习，0 次'
    );
    expect(view.getByTestId('heatmap-day-2026-07-02').props).toMatchObject({
      accessibilityLabel: '7月2日，1 秒，1 次',
      accessibilityRole: 'text',
      accessible: true
    });
    expect(
      view.getAllByText(/^(一|二|三|四|五|六|日)$/, {
        includeHiddenElements: true
      })
    ).toHaveLength(7);
  });

  it('uses the exact Web level fills and day geometry', () => {
    const levels: Array<{
      durationSeconds: number;
      durationLabel: string;
      minutes: number;
      level: HeatmapDay['level'];
    }> = [
      { durationSeconds: 0, durationLabel: '0 秒', minutes: 0, level: 0 },
      { durationSeconds: 1, durationLabel: '1 秒', minutes: 1 / 60, level: 1 },
      { durationSeconds: 180, durationLabel: '3 分钟', minutes: 3, level: 2 },
      { durationSeconds: 360, durationLabel: '6 分钟', minutes: 6, level: 3 },
      { durationSeconds: 600, durationLabel: '10 分钟', minutes: 10, level: 4 }
    ];
    let days = makeDays();
    levels.forEach((level, index) => {
      days = withDay(days, index, { ...level, sessions: level.level ? 1 : 0 });
    });
    const view = render(<Heatmap days={days} serverListTruncated={false} />);

    const expectedColors = [
      'rgba(229, 239, 242, 0.76)',
      'rgba(190, 233, 223, 0.72)',
      'rgba(132, 218, 204, 0.76)',
      'rgba(91, 191, 189, 0.82)'
    ];
    expectedColors.forEach((backgroundColor, index) => {
      expect(
        StyleSheet.flatten(
          view.getByTestId(`heatmap-day-fill-2026-07-0${index + 1}`).props.style
        )
      ).toMatchObject({ backgroundColor, borderRadius: 9, aspectRatio: 1 });
    });
    expect(view.UNSAFE_getByType(LinearGradient).props).toMatchObject({
      colors: ['rgba(42, 143, 153, 0.88)', 'rgba(133, 112, 207, 0.78)']
    });
  });

  it('matches the header, practiced-day summary, best-day footer, and qualifier copy', () => {
    let days = makeDays();
    days = withDay(days, 3, {
      durationSeconds: 180,
      durationLabel: '3 分钟',
      minutes: 3,
      sessions: 1,
      level: 2
    });
    days = withDay(days, 4, {
      durationSeconds: 600,
      durationLabel: '10 分钟',
      minutes: 10,
      sessions: 2,
      level: 4
    });
    const view = render(<Heatmap days={days} serverListTruncated />);

    expect(view.getByText('热力日历')).toBeTruthy();
    expect(view.getByText('近 28 天')).toBeTruthy();
    expect(view.getByText('2 天练习')).toBeTruthy();
    expect(view.getByText('最长一格')).toBeTruthy();
    expect(view.getByText('7月5日 · 10 分钟')).toBeTruthy();
    expect(view.getByText('基于最近 50 条记录')).toBeTruthy();
  });

  it('renders the empty footer and hides decorative weekday layers from accessibility', () => {
    const view = render(<Heatmap days={makeDays()} serverListTruncated={false} />);
    const cardStyle = StyleSheet.flatten(view.getByTestId('records-heatmap').props.style);

    expect(view.getByText('从今天开始')).toBeTruthy();
    expect(view.queryByText('基于最近 50 条记录')).toBeNull();
    expect(
      view.getByTestId('heatmap-weekdays', { includeHiddenElements: true }).props
    ).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants'
    });
    expect(cardStyle).toMatchObject({
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingTop: 13,
      paddingBottom: 12
    });
  });
});
