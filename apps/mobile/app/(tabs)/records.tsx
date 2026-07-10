import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

import { fetchPracticeSessions } from '../../src/api/sessions';
import { fetchStatsSummary } from '../../src/api/stats';
import { useAuthSession } from '../../src/auth/AuthSessionBoundary';
import { AppText } from '../../src/components/AppText';
import { Heatmap } from '../../src/components/Heatmap';
import { InlineState } from '../../src/components/InlineState';
import { PrototypeButton } from '../../src/components/PrototypeButton';
import { PrototypeScreen } from '../../src/components/PrototypeScreen';
import {
  deriveMergedRecords,
  formatRecordDate,
  formatRecordDuration,
  type MergedRecordSession
} from '../../src/domain/records';
import { userQueryKeys } from '../../src/query/keys';
import { usePreferencesStore } from '../../src/store/PreferencesStoreProvider';
import { colors } from '../../src/theme/tokens';

export default function RecordsScreen() {
  const { userId, sessionOutbox } = useAuthSession();
  const localSessionLedger = usePreferencesStore(
    (state) => state.localSessionLedger
  );
  const statsQuery = useQuery({
    queryKey: userQueryKeys.stats(userId),
    queryFn: fetchStatsSummary
  });
  const sessionsQuery = useQuery({
    queryKey: userQueryKeys.sessions(userId),
    queryFn: fetchPracticeSessions
  });
  const [refreshing, setRefreshing] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    void sessionOutbox.drainDue().catch(() => undefined);
  }, [sessionOutbox]);

  const hasLocalData = localSessionLedger.length > 0;
  const hasServerData =
    statsQuery.data !== undefined || sessionsQuery.data !== undefined;
  const isInitiallyLoading =
    !hasLocalData &&
    !hasServerData &&
    (statsQuery.isPending || sessionsQuery.isPending);
  const isFullError =
    !hasLocalData &&
    !hasServerData &&
    statsQuery.isError &&
    sessionsQuery.isError;
  const hasServerWarning =
    statsQuery.isError ||
    statsQuery.isRefetchError ||
    sessionsQuery.isError ||
    sessionsQuery.isRefetchError;
  const records = deriveMergedRecords({
    summary: statsQuery.data ?? null,
    serverSessions: sessionsQuery.data ?? null,
    ledger: localSessionLedger,
    now: new Date()
  });

  async function retryServerData() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.allSettled([
        sessionOutbox.drainDue(),
        statsQuery.refetch(),
        sessionsQuery.refetch()
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  async function retryLedgerSession(clientSessionId: string) {
    if (retryingIds.has(clientSessionId)) return;
    setRetryingIds((current) => new Set(current).add(clientSessionId));
    try {
      await sessionOutbox.retryNow(clientSessionId);
    } catch {
      // The outbox leaves a failed persistence transition retry-paused.
    } finally {
      setRetryingIds((current) => {
        const next = new Set(current);
        next.delete(clientSessionId);
        return next;
      });
    }
  }

  if (isInitiallyLoading) {
    return (
      <RecordsStateScreen>
        <InlineState kind="loading" message="正在加载练习记录…" />
      </RecordsStateScreen>
    );
  }

  if (isFullError) {
    return (
      <RecordsStateScreen>
        <InlineState
          actionLabel="重新加载"
          kind="error"
          message="请检查网络连接后，再试一次。"
          onAction={() => void retryServerData()}
          title="暂时无法加载记录"
        />
      </RecordsStateScreen>
    );
  }

  return (
    <PrototypeScreen
      backgroundVariant="records"
      contentStyle={styles.content}
      scrollable
      testID="records-screen"
    >
      <View style={styles.hero} testID="records-hero">
        <LinearGradient
          accessible={false}
          colors={[
            'rgba(255, 255, 255, 0.76)',
            'rgba(219, 243, 244, 0.54)'
          ]}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={[StyleSheet.absoluteFill, styles.heroGradient]}
        />
        <View style={styles.headline}>
          <AppText style={styles.kicker} tone="muted" variant="label">
            练习记录
          </AppText>
          <AppText accessibilityRole="header" style={styles.heroTitle} variant="displayTitle">
            轻轻记住坚持
          </AppText>
        </View>
        <View
          accessibilityLabel={`${formatRecordDuration(
            records.totalPracticeSeconds
          )}，累计时长`}
          accessible
          style={styles.total}
        >
          <AppText
            style={styles.totalValue}
            testID="records-total"
          >
            {formatRecordDuration(records.totalPracticeSeconds)}
          </AppText>
          <AppText style={styles.totalLabel}>累计时长</AppText>
        </View>
      </View>

      {hasServerWarning ? (
        <View style={styles.warning} testID="records-warning">
          <InlineState
            kind="warning"
            message="当前显示缓存或本机记录，可重试服务器数据。"
            title="记录更新失败"
          />
          <PrototypeButton
            label="重试服务器记录"
            loading={refreshing}
            onPress={() => void retryServerData()}
            style={styles.warningButton}
            variant="quiet"
          />
        </View>
      ) : null}

      <View style={styles.stats} testID="records-stats">
        <StatCard label="连续天数" value={records.streak.label} />
        <StatCard
          label="本周时长"
          value={formatRecordDuration(records.weeklyPracticeSeconds)}
        />
        <StatCard label="完成次数" value={`${records.totalSessions}`} />
      </View>

      <Heatmap
        days={records.calendarDays}
        serverListTruncated={records.serverListTruncated}
      />

      <View style={styles.list} testID="records-list">
        {records.recentSessions.length > 0 ? (
          records.recentSessions.map((session) => (
            <RecordRow
              key={session.id}
              onRetry={() => void retryLedgerSession(session.clientSessionId)}
              retrying={retryingIds.has(session.clientSessionId)}
              session={session}
            />
          ))
        ) : (
          <AppText style={styles.empty} tone="muted" variant="meta">
            完成一次练习后会出现在这里
          </AppText>
        )}
      </View>
    </PrototypeScreen>
  );
}

function RecordsStateScreen({ children }: { children: React.ReactNode }) {
  return (
    <PrototypeScreen
      backgroundVariant="records"
      contentStyle={styles.stateContent}
      testID="records-state-screen"
    >
      {children}
    </PrototypeScreen>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View accessibilityLabel={`${value}，${label}`} accessible style={styles.statCard}>
      <AppText style={styles.statValue}>
        {value}
      </AppText>
      <AppText style={styles.statLabel} tone="muted" variant="meta">
        {label}
      </AppText>
    </View>
  );
}

function RecordRow({
  onRetry,
  retrying,
  session
}: {
  onRetry(): void;
  retrying: boolean;
  session: MergedRecordSession;
}) {
  return (
    <View style={styles.recordRow} testID={`record-row-${session.id}`}>
      <LinearGradient
        accessibilityElementsHidden
        colors={['rgb(147, 220, 211)', 'rgb(172, 151, 229)']}
        end={{ x: 1, y: 1 }}
        importantForAccessibility="no-hide-descendants"
        start={{ x: 0, y: 0 }}
        style={styles.recordMark}
      >
        <View style={styles.recordMarkHighlight} />
      </LinearGradient>
      <View style={styles.recordCopy}>
        <AppText numberOfLines={1} style={styles.recordTitle} variant="label">
          {session.methodTitleSnapshot}
        </AppText>
        <AppText style={styles.recordDate} tone="muted" variant="meta">
          {formatRecordDate(session.endedAt)}
        </AppText>
        <LedgerStatus
          onRetry={onRetry}
          retrying={retrying}
          session={session}
        />
      </View>
      <View style={styles.durationPill}>
        <AppText style={styles.durationText}>
          {formatRecordDuration(session.actualDurationSeconds)}
        </AppText>
      </View>
    </View>
  );
}

function LedgerStatus({
  onRetry,
  retrying,
  session
}: {
  onRetry(): void;
  retrying: boolean;
  session: MergedRecordSession;
}) {
  switch (session.ledgerState) {
    case 'local-only':
      return <AppText style={styles.localStatus}>本机记录</AppText>;
    case 'pending':
      return <AppText style={styles.syncStatus}>正在同步</AppText>;
    case 'retry-paused':
      return (
        <PrototypeButton
          label="可重试"
          loading={retrying}
          onPress={onRetry}
          style={styles.recordRetry}
          variant="quiet"
        />
      );
    case 'failed-terminal':
      return (
        <AppText style={styles.terminalStatus}>记录仅保存在本机</AppText>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  content: {
    gap: 11,
    paddingBottom: 88,
    paddingTop: 4
  },
  stateContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 88
  },
  hero: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.62)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    minHeight: 82,
    paddingBottom: 13,
    paddingHorizontal: 16,
    paddingTop: 14,
    boxShadow: '0 16px 34px rgba(86, 121, 148, 0.10)',
    overflow: 'hidden'
  },
  heroGradient: {
    borderRadius: 24
  },
  headline: {
    flex: 1,
    minWidth: 0
  },
  kicker: {
    color: '#687480',
    fontSize: 13,
    lineHeight: 16
  },
  heroTitle: {
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 28,
    marginTop: 6
  },
  total: {
    alignItems: 'center',
    backgroundColor: 'rgba(139, 220, 211, 0.30)',
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 58,
    minWidth: 76,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  totalValue: {
    color: '#0a6b72',
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 23
  },
  totalLabel: {
    color: 'rgba(10, 80, 84, 0.68)',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    marginTop: 5
  },
  warning: {
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: 18,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  warningButton: {
    alignSelf: 'flex-start'
  },
  stats: {
    flexDirection: 'row',
    gap: 8
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderColor: 'rgba(255, 255, 255, 0.56)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 68,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 9,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.70)'
  },
  statValue: {
    color: '#0b7278',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 24
  },
  statLabel: {
    color: '#657482',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
    marginTop: 6,
    textAlign: 'center'
  },
  list: {
    gap: 8
  },
  recordRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    borderColor: 'rgba(255, 255, 255, 0.56)',
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 9,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.58)'
  },
  recordMark: {
    borderRadius: 15,
    height: 30,
    width: 30,
    boxShadow: '0 8px 16px rgba(103, 140, 158, 0.14)',
    overflow: 'hidden'
  },
  recordMarkHighlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderRadius: 3,
    height: 6,
    left: 9,
    position: 'absolute',
    top: 8,
    width: 6
  },
  recordCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  recordTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16
  },
  recordDate: {
    color: '#73808c',
    fontSize: 11,
    lineHeight: 13
  },
  durationPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(155, 221, 212, 0.22)',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: 9
  },
  durationText: {
    color: '#0b7077',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14
  },
  localStatus: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 12
  },
  syncStatus: {
    color: colors.teal,
    fontSize: 10,
    lineHeight: 12
  },
  terminalStatus: {
    color: colors.danger,
    fontSize: 10,
    lineHeight: 12
  },
  recordRetry: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 8
  },
  empty: {
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: 16,
    color: '#73808c',
    fontSize: 11,
    lineHeight: 15,
    padding: 12
  }
});
