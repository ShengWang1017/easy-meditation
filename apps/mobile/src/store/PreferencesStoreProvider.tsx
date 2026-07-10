import React, { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';

import type {
  UserPreferencesState,
  UserPreferencesStore
} from './preferencesStore';

const PreferencesStoreContext = createContext<UserPreferencesStore | null>(null);

type PreferencesStoreProviderProps = {
  store: UserPreferencesStore;
  children: ReactNode;
};

export function PreferencesStoreProvider({
  store,
  children
}: PreferencesStoreProviderProps) {
  return (
    <PreferencesStoreContext.Provider value={store}>
      {children}
    </PreferencesStoreContext.Provider>
  );
}

export function usePreferencesStore<T>(
  selector: (state: UserPreferencesState) => T
): T {
  const store = useContext(PreferencesStoreContext);
  if (!store) {
    throw new Error(
      'usePreferencesStore must be used within PreferencesStoreProvider'
    );
  }

  return useStore(store, selector);
}
