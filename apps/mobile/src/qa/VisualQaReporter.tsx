import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren
} from 'react';
import {
  PixelRatio,
  StyleSheet,
  type StyleProp,
  type TextProps,
  type TextStyle
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  VISUAL_QA_STATE_DEFINITIONS,
  type VisualQaState
} from './visualQaContract';

export type VisualQaMeasurableNode = {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void
  ): void;
};

type VisualQaRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type VisualQaTextMetadata = {
  fontFamily: string;
  fontWeight: string | number;
  fontSize: number;
  lineHeight: number;
  lines: number;
};

type RegisteredElement = {
  node?: VisualQaMeasurableNode;
  text?: VisualQaTextMetadata;
};

type RegistryValue = {
  elements: Map<string, RegisteredElement>;
  registerNode(id: string, node: VisualQaMeasurableNode | null): void;
  registerText(id: string, metadata: VisualQaTextMetadata): void;
};

const VisualQaRegistryContext = createContext<RegistryValue | null>(null);

type VisualQaRegistrationOptions = {
  textStyle: StyleProp<TextStyle>;
};

export type VisualQaRegistration = {
  ref(node: VisualQaMeasurableNode | null): void;
  onTextLayout?: NonNullable<TextProps['onTextLayout']>;
};

export function useVisualQaRegistration(
  id: string | undefined,
  options?: VisualQaRegistrationOptions
): VisualQaRegistration {
  const registry = useContext(VisualQaRegistryContext);
  const flattenedStyle = StyleSheet.flatten(options?.textStyle);
  const fontFamily = flattenedStyle?.fontFamily ?? 'System';
  const fontWeight = flattenedStyle?.fontWeight ?? '400';
  const fontSize = flattenedStyle?.fontSize;
  const lineHeight = flattenedStyle?.lineHeight;

  const ref = useCallback(
    (node: VisualQaMeasurableNode | null) => {
      if (id) registry?.registerNode(id, node);
    },
    [id, registry]
  );
  const onTextLayout = useMemo<
    NonNullable<TextProps['onTextLayout']> | undefined
  >(() => {
    if (!id || !options) return undefined;
    return (event) => {
      registry?.registerText(id, {
        fontFamily,
        fontWeight,
        fontSize: fontSize ?? Number.NaN,
        lineHeight: lineHeight ?? Number.NaN,
        lines: event.nativeEvent.lines.length
      });
    };
  }, [fontFamily, fontSize, fontWeight, id, lineHeight, options, registry]);

  return useMemo(
    () => ({ ref, onTextLayout }),
    [onTextLayout, ref]
  );
}

export function VisualQaReporter({
  children,
  enabled,
  state
}: PropsWithChildren<{ enabled: boolean; state: VisualQaState }>) {
  const insets = useSafeAreaInsets();
  const elementsRef = useRef(new Map<string, RegisteredElement>());
  const generationRef = useRef(0);
  const reportedStateRef = useRef<VisualQaState | null>(null);

  const registry = useMemo<RegistryValue>(
    () => ({
      elements: elementsRef.current,
      registerNode(id, node) {
        if (node === null) {
          elementsRef.current.delete(id);
          return;
        }
        const current = elementsRef.current.get(id) ?? {};
        elementsRef.current.set(id, { ...current, node });
      },
      registerText(id, text) {
        const current = elementsRef.current.get(id) ?? {};
        elementsRef.current.set(id, { ...current, text });
      }
    }),
    []
  );

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!enabled || reportedStateRef.current === state) return;

    let cancelled = false;
    let firstFrame: number | undefined;
    let secondFrame: number | undefined;

    firstFrame = requestAnimationFrame(() => {
      if (cancelled || generationRef.current !== generation) return;
      secondFrame = requestAnimationFrame(() => {
        if (cancelled || generationRef.current !== generation) return;
        void emitReadyPayload({
          state,
          registry,
          safeArea: {
            top: insets.top,
            right: insets.right,
            bottom: insets.bottom,
            left: insets.left
          },
          isCurrent: () =>
            !cancelled && generationRef.current === generation
        }).then((emitted) => {
          if (emitted && !cancelled && generationRef.current === generation) {
            reportedStateRef.current = state;
          }
        }).catch((error: unknown) => {
          if (!cancelled && generationRef.current === generation) {
            const message =
              error instanceof Error ? error.message : 'unknown measurement error';
            console.error(
              `VISUAL_QA_REPORTER_ERROR ${state} measurement failed: ${message}`
            );
          }
        });
      });
    });

    return () => {
      cancelled = true;
      if (firstFrame !== undefined) cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [
    enabled,
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    registry,
    state
  ]);

  return (
    <VisualQaRegistryContext.Provider value={registry}>
      {children}
    </VisualQaRegistryContext.Provider>
  );
}

async function emitReadyPayload({
  state,
  registry,
  safeArea,
  isCurrent
}: {
  state: VisualQaState;
  registry: RegistryValue;
  safeArea: { top: number; right: number; bottom: number; left: number };
  isCurrent(): boolean;
}): Promise<boolean> {
  const manifest = VISUAL_QA_STATE_DEFINITIONS[state];
  const textIds = new Set<string>(manifest.textElementIds);
  const requiredIds = [
    ...manifest.primaryElementIds,
    ...manifest.textElementIds
  ].filter((id, index, values) => values.indexOf(id) === index);

  for (const id of requiredIds) {
    const registration = registry.elements.get(id);
    if (!registration?.node) {
      if (isCurrent()) {
        console.error(
          `VISUAL_QA_REPORTER_ERROR ${state} missing required element: ${id}`
        );
      }
      return false;
    }
    if (textIds.has(id) && !isValidTextMetadata(registration.text)) {
      if (isCurrent()) {
        console.error(
          `VISUAL_QA_REPORTER_ERROR ${state} missing text metadata: ${id}`
        );
      }
      return false;
    }
  }

  const measured = await Promise.all(
    requiredIds.map(async (id) => {
      const registration = registry.elements.get(id)!;
      const rect = await measure(registration.node!);
      return [
        id,
        textIds.has(id)
          ? { ...rect, ...registration.text! }
          : rect
      ] as const;
    })
  );
  if (!isCurrent()) return false;

  console.log(
    JSON.stringify({
      marker: 'VISUAL_QA_READY',
      state,
      pixelRatio: PixelRatio.get(),
      safeArea,
      elements: Object.fromEntries(measured)
    })
  );
  return true;
}

function measure(node: VisualQaMeasurableNode): Promise<VisualQaRect> {
  return new Promise((resolve, reject) => {
    node.measureInWindow((x, y, width, height) => {
      const rect = { x, y, width, height };
      if (
        Object.values(rect).every(
          (value) => Number.isFinite(value) && value >= 0
        )
      ) {
        resolve(rect);
      } else {
        reject(new Error('Visual QA measurement must be finite and non-negative'));
      }
    });
  });
}

function isValidTextMetadata(
  metadata: VisualQaTextMetadata | undefined
): metadata is VisualQaTextMetadata {
  return Boolean(
    metadata &&
      metadata.fontFamily.length > 0 &&
      ((typeof metadata.fontWeight === 'string' &&
        metadata.fontWeight.length > 0) ||
        Number.isFinite(metadata.fontWeight)) &&
      Number.isFinite(metadata.fontSize) &&
      metadata.fontSize > 0 &&
      Number.isFinite(metadata.lineHeight) &&
      metadata.lineHeight > 0 &&
      Number.isInteger(metadata.lines) &&
      metadata.lines > 0
  );
}
