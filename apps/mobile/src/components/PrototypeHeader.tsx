import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { referenceImages } from '../theme/assets';
import { layout } from '../theme/tokens';
import { AppText } from './AppText';
import { PrototypeIconButton } from './PrototypeIconButton';

export type PrototypeHeaderProps = {
  title: string;
  onBack: () => void;
  backLabel: string;
  right?: ReactNode;
};

export function PrototypeHeader({ title, onBack, backLabel, right }: PrototypeHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.sideSlot} testID="prototype-header-left-slot">
        <PrototypeIconButton
          accessibilityLabel={backLabel}
          imageStyle={styles.backImage}
          onPress={onBack}
          source={referenceImages.back}
        />
      </View>
      <AppText
        accessibilityRole="header"
        numberOfLines={1}
        style={styles.title}
        testID="prototype-header-title"
        variant="displaySection"
      >
        {title}
      </AppText>
      <View style={styles.sideSlot} testID="prototype-header-right-slot">
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: layout.headerIconTarget
  },
  sideSlot: {
    alignItems: 'center',
    height: layout.headerIconTarget,
    justifyContent: 'center',
    width: layout.headerIconTarget
  },
  backImage: {
    height: layout.touchTarget,
    width: layout.touchTarget
  },
  title: {
    flex: 1,
    textAlign: 'center'
  }
});
