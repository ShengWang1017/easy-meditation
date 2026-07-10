import { useEffect, useRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native';

import { AppText } from './AppText';
import { colors, layout } from '../theme/tokens';

export type ScrollWheelPickerProps = {
  values: readonly number[];
  value: number;
  onValueChange(value: number): Promise<void>;
  accessibilityLabel: string;
  unit?: string;
  variant: 'phase' | 'inline';
  testID?: string;
};

const PHASE_ITEM_HEIGHT = 56;
const INLINE_ITEM_HEIGHT = 34;
const INLINE_HIT_SLOP = { top: 5, right: 0, bottom: 5, left: 0 } as const;

export function ScrollWheelPicker({
  values,
  value,
  onValueChange,
  accessibilityLabel,
  unit = '',
  variant,
  testID
}: ScrollWheelPickerProps) {
  const { width } = useWindowDimensions();
  const compact = width <= 380;
  const listRef = useRef<FlatList<number>>(null);
  const dragCommitIndexRef = useRef<number | null>(null);
  const itemHeight = variant === 'phase' ? PHASE_ITEM_HEIGHT : INLINE_ITEM_HEIGHT;
  const selectedIndex = findSelectedIndex(values, value);
  const selectedValue = values[selectedIndex];

  useEffect(() => {
    if (selectedIndex < 0) return;
    listRef.current?.scrollToIndex({
      animated: false,
      index: selectedIndex
    });
  }, [selectedIndex]);

  async function commitIndex(index: number) {
    const boundedIndex = Math.max(0, Math.min(values.length - 1, index));
    const nextValue = values[boundedIndex];
    if (nextValue === undefined || nextValue === value) return;
    await onValueChange(nextValue);
  }

  function scheduleCommit(index: number) {
    void commitIndex(index).catch(() => undefined);
  }

  function indexFromOffset(offset: number) {
    return Math.max(
      0,
      Math.min(values.length - 1, Math.round(offset / itemHeight))
    );
  }

  function handleScrollBeginDrag() {
    dragCommitIndexRef.current = null;
  }

  function handleScrollEndDrag(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const velocity = event.nativeEvent.velocity?.y;
    if (typeof velocity === 'number' && Math.abs(velocity) > 0.05) return;

    const index = indexFromOffset(event.nativeEvent.contentOffset.y);
    dragCommitIndexRef.current = index;
    scheduleCommit(index);
  }

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = indexFromOffset(event.nativeEvent.contentOffset.y);
    if (dragCommitIndexRef.current === index) {
      dragCommitIndexRef.current = null;
      return;
    }
    dragCommitIndexRef.current = null;
    scheduleCommit(index);
  }

  function handleAccessibilityAction(actionName: string) {
    if (actionName === 'increment') {
      scheduleCommit(selectedIndex + 1);
    } else if (actionName === 'decrement') {
      scheduleCommit(selectedIndex - 1);
    }
  }

  return (
    <View
      accessibilityActions={[
        { name: 'increment', label: '增加' },
        { name: 'decrement', label: '减少' }
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{
        min: values[0],
        max: values[values.length - 1],
        now: selectedValue,
        text: selectedValue === undefined ? undefined : `${selectedValue}${unit}`
      }}
      accessible
      onAccessibilityAction={(event) =>
        handleAccessibilityAction(event.nativeEvent.actionName)
      }
      style={variant === 'phase' ? styles.phaseRoot : styles.inlineRoot}
      testID={testID}
    >
      <FlatList
        contentContainerStyle={
          variant === 'phase' ? styles.phaseContent : styles.inlineContent
        }
        data={values}
        decelerationRate="fast"
        getItemLayout={(_data, index) => ({
          index,
          length: itemHeight,
          offset: itemHeight * index
        })}
        hitSlop={variant === 'inline' ? INLINE_HIT_SLOP : undefined}
        initialNumToRender={values.length}
        initialScrollIndex={Math.max(0, selectedIndex)}
        keyExtractor={(item) => String(item)}
        nestedScrollEnabled
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        ref={listRef}
        renderItem={({ item, index }) => {
          const selected = index === selectedIndex;
          return (
            <Pressable
              accessible={false}
              onPress={() => scheduleCommit(index)}
              style={[styles.optionTarget, { height: itemHeight }]}
            >
              <AppText
                accessible={false}
                style={[
                  styles.optionText,
                  variant === 'phase'
                    ? compact
                      ? styles.phaseOptionCompact
                      : styles.phaseOption
                    : styles.inlineOption,
                  selected
                    ? variant === 'phase'
                      ? compact
                        ? styles.phaseSelectedCompact
                        : styles.phaseSelected
                      : styles.inlineSelected
                    : null
                ]}
                testID={testID ? `${testID}-option-${item}` : undefined}
              >
                {`${item}${unit}`}
              </AppText>
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={itemHeight}
        style={[
          variant === 'phase'
            ? compact
              ? styles.phaseListCompact
              : styles.phaseList
            : styles.inlineList
        ]}
        testID={testID ? `${testID}-list` : undefined}
      />
    </View>
  );
}

function findSelectedIndex(values: readonly number[], value: number): number {
  const exactIndex = values.indexOf(value);
  if (exactIndex >= 0 || values.length === 0) return exactIndex;

  return values.reduce(
    (bestIndex, candidate, index) =>
      Math.abs(candidate - value) < Math.abs(values[bestIndex]! - value)
        ? index
        : bestIndex,
    0
  );
}

const styles = StyleSheet.create({
  phaseRoot: {
    alignItems: 'center',
    height: 168,
    justifyContent: 'center'
  },
  inlineRoot: {
    alignItems: 'center',
    height: layout.touchTarget,
    justifyContent: 'center'
  },
  phaseContent: {
    paddingVertical: PHASE_ITEM_HEIGHT
  },
  inlineContent: {
    paddingVertical: 0
  },
  phaseList: {
    height: 168,
    width: 78
  },
  phaseListCompact: {
    height: 168,
    width: 68
  },
  inlineList: {
    height: INLINE_ITEM_HEIGHT,
    width: '100%'
  },
  optionTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  optionText: {
    color: 'rgba(17, 22, 34, 0.13)',
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 56,
    textAlign: 'center'
  },
  phaseOption: {
    fontSize: 36
  },
  phaseOptionCompact: {
    fontSize: 32
  },
  phaseSelected: {
    color: colors.ink,
    fontSize: 43,
    fontWeight: '800'
  },
  phaseSelectedCompact: {
    color: colors.ink,
    fontSize: 39,
    fontWeight: '800'
  },
  inlineOption: {
    color: 'rgba(17, 22, 34, 0.28)',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: INLINE_ITEM_HEIGHT,
    textAlign: 'right'
  },
  inlineSelected: {
    color: colors.ink,
    fontWeight: '700'
  }
});
