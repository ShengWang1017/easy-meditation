import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadowSoft, spacing, type } from '../theme/tokens';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

// Intensity ramp: empty grey → teal → violet (level 4), mirroring the prototype.
const LEVELS = ['#e7ebea', '#cfe9e1', '#a4d9ca', '#83c4d3', '#b3a4e6'];

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

type HeatmapProps = {
  sessions: { startedAt: string }[];
};

export function Heatmap({ sessions }: HeatmapProps) {
  const { cells } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of sessions) {
      const key = dayKey(new Date(session.startedAt));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const today = new Date();
    const days: ({ level: number } | null)[] = [];

    const first = new Date(today);
    first.setDate(today.getDate() - 27);
    const leadingPad = (first.getDay() + 6) % 7; // align columns to Monday-first
    for (let i = 0; i < leadingPad; i += 1) {
      days.push(null);
    }

    for (let offset = 27; offset >= 0; offset -= 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - offset);
      const count = counts.get(dayKey(day)) ?? 0;
      days.push({ level: Math.min(4, count) });
    }

    return { cells: days };
  }, [sessions]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>热力日历</Text>
        <Text style={styles.caption}>近 28 天</Text>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((label) => (
          <Text key={label} style={styles.weekLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, index) => (
          <View key={index} style={styles.cellWrap}>
            <View
              style={[
                styles.cell,
                { backgroundColor: cell ? LEVELS[cell.level] : 'transparent' }
              ]}
            />
          </View>
        ))}
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.caption}>少</Text>
        {LEVELS.map((color, index) => (
          <View key={index} style={[styles.legendCell, { backgroundColor: color }]} />
        ))}
        <Text style={styles.caption}>多</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...shadowSoft
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md
  },
  title: {
    ...type.section,
    color: colors.ink
  },
  caption: {
    ...type.meta,
    color: colors.muted
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs
  },
  weekLabel: {
    ...type.meta,
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: colors.muted
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  cellWrap: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3
  },
  cell: {
    flex: 1,
    borderRadius: 7
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: spacing.md
  },
  legendCell: {
    width: 14,
    height: 14,
    borderRadius: 4
  }
});
