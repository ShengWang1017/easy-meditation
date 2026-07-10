import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type ImageStyle,
  type StyleProp
} from 'react-native';

import type { MethodPresentationSlot } from '../domain/methodPresentation';
import { referenceImages } from '../theme/assets';
import { colors, layout, shadows, typography } from '../theme/tokens';
import { AppText } from './AppText';
import { DurationPopover } from './DurationPopover';
import { PrototypeIconButton } from './PrototypeIconButton';

export type ModeCardViewModel = MethodPresentationSlot & {
  backgroundColor: string;
  durationMinutes: number;
  durationPopoverOpen: boolean;
};

export type ModeCardProps = {
  viewModel: ModeCardViewModel;
  onPress(): void;
  onOpenDuration(): void;
  onOpenCustomEditor(): void;
  onDurationChange(minutes: number): Promise<void>;
  onRequestCloseDuration(): void;
};

type ArtGeometry = {
  top: number;
  right: number;
  width: number;
  height: number;
  opacity: number;
  rotate: string;
};

const ART_GEOMETRY: Record<ModeCardViewModel['id'], ArtGeometry> = {
  box: {
    top: 48,
    right: -12,
    width: 98,
    height: 98,
    opacity: 0.42,
    rotate: '8deg'
  },
  'four-seven-eight': {
    top: 42,
    right: -22,
    width: 112,
    height: 112,
    opacity: 0.36,
    rotate: '-16deg'
  },
  coherent: {
    top: 58,
    right: -18,
    width: 116,
    height: 112,
    opacity: 0.34,
    rotate: '18deg'
  },
  custom: {
    top: 50,
    right: -12,
    width: 104,
    height: 104,
    opacity: 0.28,
    rotate: '-28deg'
  }
};

function artStyle(
  id: ModeCardViewModel['id'],
  compact: boolean
): StyleProp<ImageStyle> {
  const geometry = ART_GEOMETRY[id];
  const compactBox = compact && id === 'box';

  return {
    height: compactBox ? 86 : geometry.height,
    opacity: geometry.opacity,
    right: geometry.right,
    top: compactBox ? 44 : geometry.top,
    transform: [{ rotate: geometry.rotate }],
    width: compactBox ? 86 : geometry.width
  };
}

export function ModeCard({
  viewModel,
  onPress,
  onOpenDuration,
  onOpenCustomEditor,
  onDurationChange,
  onRequestCloseDuration
}: ModeCardProps) {
  const { width } = useWindowDimensions();
  const compact = width <= 380;
  const unavailable = viewModel.availability === 'unavailable';
  const custom = viewModel.kind === 'custom';
  const padding = compact
    ? layout.compactMethodCardPadding
    : layout.methodCardPadding;
  const cardLabel = unavailable
    ? `${viewModel.title}暂不可用`
    : custom
      ? '编辑自定义呼吸方式'
      : `开始${viewModel.title}`;

  function pressCard() {
    if (unavailable) {
      return;
    }

    if (custom) {
      onOpenCustomEditor();
      return;
    }

    onPress();
  }

  function pressDuration(event?: GestureResponderEvent) {
    event?.stopPropagation();
    if (unavailable) {
      return;
    }

    if (custom) {
      onOpenCustomEditor();
      return;
    }

    onOpenDuration();
  }

  function pressGear(event?: GestureResponderEvent) {
    event?.stopPropagation();
    onOpenCustomEditor();
  }

  const durationLabel = unavailable
    ? `${viewModel.title}训练时长暂不可用`
    : custom
      ? '编辑自定义训练时长'
      : `更改${viewModel.title}训练时长`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: viewModel.backgroundColor,
          borderRadius: compact
            ? layout.compactMethodCardRadius
            : layout.methodCardRadius,
          minHeight: compact
            ? layout.compactMethodCardHeight
            : layout.methodCardHeight,
          overflow: viewModel.durationPopoverOpen ? 'visible' : 'hidden',
          paddingBottom: padding.bottom,
          paddingLeft: padding.left,
          paddingRight: padding.right,
          paddingTop: padding.top,
          zIndex: viewModel.durationPopoverOpen ? 4 : 0
        },
        unavailable ? styles.unavailable : null
      ]}
      testID={`mode-card-shell-${viewModel.id}`}
    >
      <Pressable
        accessibilityLabel={cardLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: unavailable }}
        disabled={unavailable}
        onPress={pressCard}
        style={({ pressed }) => [
          StyleSheet.absoluteFill,
          styles.cardAction,
          {
            borderRadius: compact
              ? layout.compactMethodCardRadius
              : layout.methodCardRadius
          },
          pressed && !unavailable ? styles.pressed : null
        ]}
        testID={`mode-card-${viewModel.id}`}
      />
      <Image
        accessible={false}
        resizeMode="contain"
        source={referenceImages[viewModel.artKey]}
        style={[styles.art, artStyle(viewModel.id, compact)]}
        testID={`mode-card-art-${viewModel.id}`}
      />

      <View pointerEvents="none" style={styles.copy}>
        <AppText numberOfLines={2} style={styles.title} variant="cardTitle">
          {viewModel.title}
        </AppText>
        <AppText style={styles.meta} variant="meta">
          {viewModel.rhythmLabel}
        </AppText>
        {viewModel.purpose ? (
          <AppText style={styles.purpose} variant="meta">
            {viewModel.purpose}
          </AppText>
        ) : null}
        {unavailable ? (
          <AppText style={styles.unavailableText} variant="meta">
            暂不可用
          </AppText>
        ) : null}
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.footer, compact ? styles.footerCompact : null]}
      >
        <Pressable
          accessibilityLabel={durationLabel}
          accessibilityRole="button"
          accessibilityState={{
            disabled: unavailable,
            expanded: viewModel.durationPopoverOpen
          }}
          disabled={unavailable}
          hitSlop={4}
          onPress={pressDuration}
          style={({ pressed }) => [
            styles.duration,
            (pressed || viewModel.durationPopoverOpen) && !unavailable
              ? styles.durationPressed
              : null
          ]}
        >
          <AppText style={styles.durationText} variant="meta">
            {viewModel.durationMinutes} 分钟
          </AppText>
        </Pressable>

        {custom ? (
          <PrototypeIconButton
            accessibilityLabel="设置自定义呼吸方式"
            imageStyle={styles.gearImage}
            onPress={pressGear}
            source={referenceImages.gear}
            style={styles.gearButton}
          />
        ) : (
          <View style={styles.gearSpacer} />
        )}
      </View>

      {viewModel.durationPopoverOpen && !custom && !unavailable ? (
        <DurationPopover
          methodTitle={viewModel.title}
          onChange={onDurationChange}
          onRequestClose={onRequestCloseDuration}
          value={viewModel.durationMinutes}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    ...shadows.methodCard
  },
  cardAction: {
    zIndex: 1
  },
  pressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  unavailable: {
    opacity: 0.5
  },
  art: {
    position: 'absolute'
  },
  copy: {
    gap: 8,
    position: 'relative',
    width: '100%',
    zIndex: 1
  },
  title: {
    ...typography.cardTitle,
    color: colors.ink
  },
  meta: {
    ...typography.cardMeta,
    color: colors.ink
  },
  purpose: {
    ...typography.cardMeta,
    color: colors.muted
  },
  unavailableText: {
    ...typography.cardMeta,
    color: colors.muted
  },
  footer: {
    alignItems: 'center',
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 22,
    position: 'absolute',
    right: 22,
    zIndex: 2
  },
  footerCompact: {
    bottom: 19,
    left: 17,
    right: 17
  },
  duration: {
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    minWidth: 66,
    paddingHorizontal: 8
  },
  durationPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.42)'
  },
  durationText: {
    ...typography.cardMeta,
    color: '#596170'
  },
  gearButton: {
    backgroundColor: 'transparent',
    borderRadius: 22,
    height: layout.touchTarget,
    marginBottom: -2,
    marginRight: -2,
    width: layout.touchTarget
  },
  gearImage: {
    height: 34,
    opacity: 0.72,
    width: 34
  },
  gearSpacer: {
    height: layout.touchTarget,
    width: layout.touchTarget
  }
});
