import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData
} from 'react-native';

import { colors, layout, shadows } from '../theme/tokens';
import { AppText } from './AppText';

export type DurationPopoverProps = {
  methodTitle: string;
  value: number;
  onChange(minutes: number): Promise<void>;
  onRequestClose(): void;
};

export function normalizeDurationMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.min(60, Math.round(value)));
}

export function DurationPopover({
  methodTitle,
  value,
  onChange,
  onRequestClose
}: DurationPopoverProps) {
  const { width } = useWindowDimensions();
  const compact = width <= 380;
  const [draft, setDraft] = useState(String(normalizeDurationMinutes(value)));
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setDraft(String(normalizeDurationMinutes(value)));
  }, [value]);

  async function confirm() {
    if (isSaving) {
      return;
    }

    const parsed = Number(draft);
    const minutes = normalizeDurationMinutes(
      Number.isFinite(parsed) ? parsed : value
    );
    setDraft(String(minutes));
    setSaveFailed(false);
    setIsSaving(true);
    try {
      await onChange(minutes);
      onRequestClose();
    } catch {
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  }

  function changeDraft(nextDraft: string) {
    setDraft(nextDraft);
    setSaveFailed(false);
  }

  function stopAndClose(event?: GestureResponderEvent) {
    event?.stopPropagation();
    onRequestClose();
  }

  function stopAndConfirm(event?: GestureResponderEvent) {
    event?.stopPropagation();
    void confirm();
  }

  function submit(
    event: NativeSyntheticEvent<TextInputSubmitEditingEventData>
  ) {
    event.stopPropagation();
    void confirm();
  }

  return (
    <View
      accessibilityViewIsModal
      pointerEvents="box-none"
      style={styles.overlay}
      testID="duration-popover"
    >
      <Pressable
        accessibilityLabel={`关闭${methodTitle}时长设置`}
        accessibilityRole="button"
        onPress={stopAndClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityLabel={`${methodTitle}训练时长`}
        accessibilityRole="summary"
        style={[
          styles.panel,
          compact ? styles.panelCompact : null
        ]}
      >
        <View style={styles.inputWrap}>
          <TextInput
            accessibilityLabel={`输入${methodTitle}训练分钟数`}
            editable={!isSaving}
            inputMode="decimal"
            keyboardType="decimal-pad"
            maxLength={5}
            onChangeText={changeDraft}
            onPressIn={(event) => event.stopPropagation()}
            onSubmitEditing={submit}
            returnKeyType="done"
            selectTextOnFocus
            style={styles.input}
            value={draft}
          />
          <AppText style={styles.unit} variant="meta">
            分钟
          </AppText>
        </View>
        {saveFailed ? (
          <AppText
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={styles.errorText}
            variant="meta"
          >
            保存失败，请重试。
          </AppText>
        ) : null}
        <Pressable
          accessibilityLabel={
            saveFailed
              ? `重试保存${methodTitle}训练时长`
              : `确认${methodTitle}训练时长`
          }
          accessibilityRole="button"
          accessibilityState={{ busy: isSaving, disabled: isSaving }}
          disabled={isSaving}
          onPress={stopAndConfirm}
          style={({ pressed }) => [
            styles.confirm,
            pressed && !isSaving ? styles.confirmPressed : null
          ]}
        >
          <AppText style={styles.confirmText} variant="meta">
            {saveFailed ? '重试' : '确认'}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 5
  },
  panel: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: 20,
    borderWidth: 1,
    bottom: 50,
    gap: 5,
    left: 16,
    padding: 7,
    position: 'absolute',
    width: 108,
    ...shadows.durationPopover
  },
  panelCompact: {
    bottom: 46,
    left: 14,
    width: 102
  },
  inputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderColor: 'rgba(142, 191, 205, 0.28)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    paddingHorizontal: 9
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    lineHeight: 20,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: 'center'
  },
  unit: {
    color: '#596170',
    fontSize: 13,
    lineHeight: 16
  },
  confirm: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 44
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center'
  },
  confirmPressed: {
    backgroundColor: 'rgba(168, 232, 224, 0.48)'
  },
  confirmText: {
    color: colors.teal,
    fontSize: 13,
    lineHeight: 16
  }
});
