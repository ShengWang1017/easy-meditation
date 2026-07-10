import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { layout, radii, shadowSoft, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { PrototypeButton } from './PrototypeButton';

export type SessionExitDialogProps = {
  visible: boolean;
  isPersisting: boolean;
  error: string | null;
  onContinue(): void;
  onEnd(): void;
  onRetry(): void;
};

export function SessionExitDialog({
  visible,
  isPersisting,
  error,
  onContinue,
  onEnd,
  onRetry
}: SessionExitDialogProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={isPersisting ? undefined : onContinue}
      transparent
      visible={visible}
    >
      <View accessibilityViewIsModal style={styles.overlay}>
        <Pressable
          accessibilityElementsHidden
          disabled={isPersisting}
          onPress={onContinue}
          style={StyleSheet.absoluteFill}
          testID="session-exit-backdrop"
        />
        <View style={styles.card}>
          <View accessibilityRole="alert" accessible style={styles.copy}>
            <AppText variant="displaySection">要结束这次练习吗？</AppText>
            <AppText tone="muted">
              结束后会先把这次练习安全保存在本机，再带你离开。
            </AppText>
            {error ? (
              <AppText accessibilityLiveRegion="assertive" tone="danger">
                {error}
              </AppText>
            ) : null}
          </View>
          <View style={styles.actions}>
            <PrototypeButton
              disabled={isPersisting}
              label="继续练习"
              onPress={onContinue}
              style={styles.action}
              variant="quiet"
            />
            <PrototypeButton
              label="结束并离开"
              loading={isPersisting}
              onPress={onEnd}
              style={styles.action}
            />
            {error && !isPersisting ? (
              <PrototypeButton
                label="重试保存并离开"
                onPress={onRetry}
                style={styles.action}
                variant="quiet"
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 22, 34, 0.28)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    maxWidth: 360,
    padding: spacing.lg,
    width: '100%',
    ...shadowSoft
  },
  copy: {
    gap: spacing.sm
  },
  actions: {
    gap: spacing.sm
  },
  action: {
    minHeight: layout.touchTarget
  }
});
