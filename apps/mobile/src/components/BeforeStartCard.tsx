import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent
} from 'react-native';

import { referenceImages } from '../theme/assets';
import { colors, layout, shadows, typography } from '../theme/tokens';
import { AppText } from './AppText';

export type BeforeStartCardProps = {
  onOpenGuide(): void;
  onDismiss(): Promise<void>;
};

export function BeforeStartCard({
  onOpenGuide,
  onDismiss
}: BeforeStartCardProps) {
  const { width } = useWindowDimensions();
  const compact = width <= 380;
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissFailed, setDismissFailed] = useState(false);

  async function dismiss(event?: GestureResponderEvent) {
    event?.stopPropagation();
    if (isDismissing) {
      return;
    }

    setDismissFailed(false);
    setIsDismissing(true);
    try {
      await onDismiss();
    } catch {
      setDismissFailed(true);
    } finally {
      setIsDismissing(false);
    }
  }

  return (
    <View
      style={[styles.card, compact ? styles.cardCompact : null]}
      testID="before-start-card-shell"
    >
      <Pressable
        accessibilityLabel="了解呼吸训练和冥想"
        accessibilityRole="button"
        onPress={onOpenGuide}
        style={({ pressed }) => [
          StyleSheet.absoluteFill,
          styles.guideAction,
          pressed ? styles.cardPressed : null
        ]}
        testID="before-start-card"
      />
      <Pressable
        accessibilityLabel={
          dismissFailed ? '重试关闭开始前提示' : '关闭开始前提示'
        }
        accessibilityRole="button"
        accessibilityState={{ busy: isDismissing, disabled: isDismissing }}
        disabled={isDismissing}
        hitSlop={3}
        onPress={(event) => void dismiss(event)}
        style={styles.dismissTarget}
      >
        <View
          style={[
            styles.dismissCircle,
            compact ? styles.dismissCircleCompact : null
          ]}
        >
          <Ionicons color="#6f7785" name="close" size={16} />
        </View>
      </Pressable>

      <View
        pointerEvents="none"
        style={[styles.copy, compact ? styles.copyCompact : null]}
      >
        <AppText style={styles.title} variant="cardTitle">
          在您开始前
        </AppText>
        <AppText
          style={[styles.body, compact ? styles.bodyCompact : null]}
          variant="meta"
        >
          了解每项呼吸训练的工作原理并获取帮助您练习的提示。
        </AppText>
        {dismissFailed ? (
          <AppText
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={styles.errorText}
            variant="meta"
          >
            关闭失败，请重试。
          </AppText>
        ) : null}
      </View>
      <Image
        accessible={false}
        resizeMode="cover"
        source={referenceImages.dandelion}
        style={[styles.image, compact ? styles.imageCompact : null]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: layout.beforeCardRadius,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 10,
    minHeight: layout.beforeCardHeight,
    paddingBottom: 15,
    paddingLeft: 20,
    paddingRight: 13,
    paddingTop: 16,
    position: 'relative',
    ...shadows.beforeCard
  },
  cardCompact: {
    gap: 8,
    minHeight: 104,
    paddingBottom: 14,
    paddingLeft: 17,
    paddingRight: 12,
    paddingTop: 15
  },
  cardPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)'
  },
  guideAction: {
    borderRadius: layout.beforeCardRadius,
    zIndex: 1
  },
  dismissTarget: {
    alignItems: 'center',
    height: layout.touchTarget,
    justifyContent: 'center',
    left: -17,
    position: 'absolute',
    top: -17,
    width: layout.touchTarget,
    zIndex: 2
  },
  dismissCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
    ...shadows.beforeCardClose
  },
  dismissCircleCompact: {
    borderRadius: 11,
    height: 22,
    width: 22
  },
  copy: {
    flex: 1,
    gap: 9,
    minWidth: 0
  },
  copyCompact: {
    gap: 8
  },
  title: {
    ...typography.beforeCardTitle,
    color: colors.ink
  },
  body: {
    ...typography.beforeCardBody,
    color: '#6e7380'
  },
  bodyCompact: {
    fontSize: 14,
    lineHeight: 19.88
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16
  },
  image: {
    borderRadius: 18,
    height: 82,
    width: 82
  },
  imageCompact: {
    borderRadius: 16,
    height: 76,
    width: 76
  }
});
