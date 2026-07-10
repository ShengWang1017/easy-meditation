import {
  createContext,
  useContext,
  type PropsWithChildren
} from 'react';

import type { VisualQaState } from './visualQaContract';

export type VisualQaFixtureRuntimeValue = {
  state: VisualQaState;
  now: string;
  authScope: 'authenticated' | 'unauthenticated';
};

const VisualQaFixtureRuntimeContext =
  createContext<VisualQaFixtureRuntimeValue | null>(null);

export function VisualQaFixtureRuntimeProvider({
  children,
  value
}: PropsWithChildren<{ value: VisualQaFixtureRuntimeValue }>) {
  return (
    <VisualQaFixtureRuntimeContext.Provider value={value}>
      {children}
    </VisualQaFixtureRuntimeContext.Provider>
  );
}

export function useVisualQaFixtureRuntime(): VisualQaFixtureRuntimeValue {
  const value = useOptionalVisualQaFixtureRuntime();
  if (!value) {
    throw new Error(
      'useVisualQaFixtureRuntime must be used inside an active visual QA fixture'
    );
  }
  return value;
}

export function useOptionalVisualQaFixtureRuntime(): VisualQaFixtureRuntimeValue | null {
  return useContext(VisualQaFixtureRuntimeContext);
}
