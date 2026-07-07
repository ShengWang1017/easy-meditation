import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { secondsToTimerLabel } from '@easy-meditation/shared';
import { fetchStatsSummary } from '../../src/api/stats';
import { Screen } from '../../src/components/Screen';
import { colors, spacing } from '../../src/theme/tokens';

function formatMinutes(seconds: number) {
  return Math.round(seconds / 60);
}

export default function RecordsScreen() {
  const statsQuery = useQuery({
    queryKey: ['stats-summary'],
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

  return (
    <Screen scrollable>
      <View style={styles.header}>
        <Text style={styles.kicker}>服务端统计</Text>
        <Text style={styles.title}>练习记录</Text>
        <Text style={styles.description}>这里展示后端汇总的连续天数、时长和最近完成的练习。</Text>
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

      <View style={styles.grid}>
        <StatCard label="连续天数" value={`${stats?.currentStreak ?? 0}`} />
        <StatCard label="本周分钟" value={`${formatMinutes(stats?.weeklyPracticeSeconds ?? 0)}`} />
        <StatCard label="完成次数" value={`${stats?.totalSessions ?? 0}`} />
        <StatCard label="累计时长" value={secondsToTimerLabel(stats?.totalPracticeSeconds ?? 0)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>最近练习</Text>
        {stats?.recentSessions.length ? (
          <View style={styles.list}>
            {stats.recentSessions.map((session) => (
              <View key={session.id} style={styles.row}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{session.methodTitleSnapshot}</Text>
                  <Text style={styles.rowMeta}>
                    练习 {secondsToTimerLabel(session.actualDurationSeconds)}
                  </Text>
                </View>
                <Text style={styles.rowBadge}>
                  {formatMinutes(session.actualDurationSeconds)} 分钟
                </Text>
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

type StatCardProps = {
  label: string;
  value: string;
};

function StatCard({ label, value }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md
  },
  kicker: {
    color: colors.accentStrong,
    fontSize: 14,
    fontWeight: '600'
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '700'
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24
  },
  grid: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  card: {
    width: '47%',
    minHeight: 112,
    justifyContent: 'space-between',
    borderRadius: 24,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)'
  },
  cardValue: {
    color: colors.accentStrong,
    fontSize: 28,
    fontWeight: '800'
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 14
  },
  section: {
    marginTop: spacing.xl,
    gap: spacing.md
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700'
  },
  list: {
    gap: spacing.md
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: 24,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)'
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xs
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700'
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 14
  },
  rowBadge: {
    color: colors.accentStrong,
    fontSize: 14,
    fontWeight: '700'
  },
  emptyState: {
    gap: spacing.sm,
    borderRadius: 24,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)'
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700'
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md
  },
  stateText: {
    color: colors.muted,
    fontSize: 15
  },
  retryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accentStrong
  },
  retryButtonText: {
    color: colors.surfaceStrong,
    fontSize: 16,
    fontWeight: '700'
  },
  warning: {
    marginTop: spacing.xl,
    gap: spacing.md,
    borderRadius: 20,
    padding: spacing.lg,
    backgroundColor: 'rgba(188, 126, 72, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(188, 126, 72, 0.24)'
  },
  warningCopy: {
    gap: spacing.xs
  },
  warningTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700'
  },
  warningText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  warningButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceStrong
  },
  warningButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700'
  },
  buttonPressed: {
    opacity: 0.86
  }
});
