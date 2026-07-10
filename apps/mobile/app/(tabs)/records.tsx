import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { secondsToTimerLabel } from '@easy-meditation/shared';
import { fetchStatsSummary } from '../../src/api/stats';
import { useAuthSession } from '../../src/auth/AuthSessionBoundary';
import { Heatmap } from '../../src/components/Heatmap';
import { Screen } from '../../src/components/Screen';
import { userQueryKeys } from '../../src/query/keys';
import { colors, radii, shadowSoft, spacing, type } from '../../src/theme/tokens';

function formatMinutes(seconds: number) {
  return Math.round(seconds / 60);
}

export default function RecordsScreen() {
  const { userId } = useAuthSession();
  const statsQuery = useQuery({
    queryKey: userQueryKeys.stats(userId),
    queryFn: fetchStatsSummary
  });
  const stats = statsQuery.data;

  if (statsQuery.isLoading && !stats) {
    return (
      <Screen>
        <View style={styles.state}>
          <ActivityIndicator color={colors.accentStrong} size="large" />
          <Text style={styles.stateText}>正在加载练习记录...</Text>
        </View>
      </Screen>
    );
  }

  if (statsQuery.isError && !stats) {
    return (
      <Screen>
        <View style={styles.state}>
          <Text style={styles.title}>暂时无法加载记录</Text>
          <Text style={styles.description}>请检查网络连接后，再试一次。</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void statsQuery.refetch()}
            style={({ pressed }) => [styles.retryButton, pressed ? styles.buttonPressed : null]}
          >
            <Text style={styles.retryButtonText}>重新加载</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const recentSessions = stats?.recentSessions ?? [];

  return (
    <Screen scrollable>
      <Text style={styles.kicker}>练习记录</Text>

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>轻轻记住坚持</Text>
          <Text style={styles.heroSubtitle}>每一次呼吸，都会留下痕迹。</Text>
        </View>
        <View style={styles.heroStat}>
          <Text style={styles.heroStatValue}>
            {secondsToTimerLabel(stats?.totalPracticeSeconds ?? 0)}
          </Text>
          <Text style={styles.heroStatLabel}>累计时长</Text>
        </View>
      </View>

      {statsQuery.isError ? (
        <View style={styles.warning}>
          <View style={styles.warningCopy}>
            <Text style={styles.warningTitle}>记录更新失败</Text>
            <Text style={styles.warningText}>当前显示的是上一次成功加载的数据。</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void statsQuery.refetch()}
            style={({ pressed }) => [styles.warningButton, pressed ? styles.buttonPressed : null]}
          >
            <Text style={styles.warningButtonText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.statRow}>
        <StatTile label="连续天数" value={`${stats?.currentStreak ?? 0}`} />
        <StatTile label="本周分钟" value={`${formatMinutes(stats?.weeklyPracticeSeconds ?? 0)}`} />
        <StatTile label="完成次数" value={`${stats?.totalSessions ?? 0}`} />
      </View>

      <View style={styles.block}>
        <Heatmap sessions={recentSessions} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>最近练习</Text>
        {recentSessions.length ? (
          <View style={styles.list}>
            {recentSessions.map((session) => (
              <View key={session.id} style={styles.row}>
                <View style={styles.recordMark} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{session.methodTitleSnapshot}</Text>
                  <Text style={styles.rowMeta}>
                    练习 {secondsToTimerLabel(session.actualDurationSeconds)}
                  </Text>
                </View>
                <View style={styles.minutePill}>
                  <Text style={styles.minutePillText}>
                    {formatMinutes(session.actualDurationSeconds)} 分钟
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>还没有练习记录</Text>
            <Text style={styles.emptyText}>完成一次练习后，这里会自动显示服务端保存的记录。</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

type StatTileProps = {
  label: string;
  value: string;
};

function StatTile({ label, value }: StatTileProps) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    ...type.label,
    color: colors.accentStrong,
    marginBottom: spacing.md
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...shadowSoft
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs
  },
  heroTitle: {
    ...type.title,
    color: colors.ink
  },
  heroSubtitle: {
    ...type.meta,
    color: colors.muted
  },
  heroStat: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.mint
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.accentStrong
  },
  heroStatLabel: {
    ...type.meta,
    color: colors.accent
  },
  statRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...shadowSoft
  },
  tileValue: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.accentStrong
  },
  tileLabel: {
    ...type.meta,
    color: colors.muted
  },
  block: {
    marginTop: spacing.md
  },
  section: {
    marginTop: spacing.xl,
    gap: spacing.md
  },
  sectionTitle: {
    ...type.section,
    color: colors.ink
  },
  list: {
    gap: spacing.sm
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...shadowSoft
  },
  recordMark: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.lilac,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.7)'
  },
  rowCopy: {
    flex: 1,
    gap: 2
  },
  rowTitle: {
    ...type.label,
    fontSize: 16,
    color: colors.ink
  },
  rowMeta: {
    ...type.meta,
    color: colors.muted
  },
  minutePill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.mint
  },
  minutePillText: {
    ...type.meta,
    fontWeight: '700',
    color: colors.accentStrong
  },
  emptyState: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...shadowSoft
  },
  emptyTitle: {
    ...type.label,
    fontSize: 16,
    color: colors.ink
  },
  emptyText: {
    ...type.meta,
    color: colors.muted,
    lineHeight: 20
  },
  title: {
    ...type.title,
    color: colors.ink,
    textAlign: 'center'
  },
  description: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center'
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md
  },
  stateText: {
    ...type.body,
    color: colors.muted
  },
  retryButton: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accentStrong
  },
  retryButtonText: {
    ...type.body,
    fontWeight: '700',
    color: colors.surfaceStrong
  },
  warning: {
    marginTop: spacing.md,
    gap: spacing.md,
    borderRadius: radii.md,
    padding: spacing.lg,
    backgroundColor: 'rgba(188, 126, 72, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(188, 126, 72, 0.24)'
  },
  warningCopy: {
    gap: spacing.xs
  },
  warningTitle: {
    ...type.label,
    color: colors.ink
  },
  warningText: {
    ...type.meta,
    color: colors.muted
  },
  warningButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceStrong
  },
  warningButtonText: {
    ...type.label,
    color: colors.accentStrong
  },
  buttonPressed: {
    opacity: 0.86
  }
});
