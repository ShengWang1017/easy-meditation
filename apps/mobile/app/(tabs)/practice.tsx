import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { colors, spacing } from '../../src/theme/tokens';

export default function PracticeScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.kicker}>今日练习</Text>
        <Text style={styles.title}>呼吸训练</Text>
        <Text style={styles.description}>
          这里先放一个临时入口。后续任务会把练习方法、计时和完成记录接进来。
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md
  },
  kicker: {
    color: colors.accentStrong,
    fontSize: 14,
    fontWeight: '600'
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: '700'
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24
  }
});
