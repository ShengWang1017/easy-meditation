import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { colors, spacing } from '../../src/theme/tokens';

export default function RecordsScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>记录</Text>
        <Text style={styles.description}>练习统计和历史记录会在后续任务里接进这个标签页。</Text>
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
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '700'
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24
  }
});
