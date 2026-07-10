import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { jest } from '@jest/globals';
import 'react-native-gesture-handler/jestSetup';
import { useMemo } from 'react';
import {
  setUpTests,
  useDerivedValue,
  useSharedValue
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { SkPath } from '@shopify/react-native-skia';

setUpTests();

type SkiaJestModule = typeof import('@shopify/react-native-skia') & {
  usePathValue?: (
    callback: (path: SkPath) => void,
    initialPath?: SkPath
  ) => SharedValue<SkPath>;
};

const skiaJestModule = jest.requireMock<SkiaJestModule>(
  '@shopify/react-native-skia'
);

// The installed Skia package exports usePathValue in production but omits it
// from v2.0.0-next.4's package-provided Jest mock. Mirror the production hook's
// stable-path reset behavior so renderer tests exercise the supported API.
function usePathValueCompat(
  callback: (path: SkPath) => void,
  initialPath?: SkPath
): SharedValue<SkPath> {
  const path = useMemo(() => skiaJestModule.Skia.Path.Make(), []);
  const sharedPath = useSharedValue(path);
  useDerivedValue(() => {
    sharedPath.value.reset();
    if (initialPath !== undefined) {
      sharedPath.value.addPath(initialPath);
    }
    callback(sharedPath.value);
  });
  return sharedPath;
}

skiaJestModule.usePathValue ??= usePathValueCompat;

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
