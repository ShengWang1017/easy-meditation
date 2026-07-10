import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { StyleSheet, View } from 'react-native';
import { meSchema } from '@easy-meditation/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getMe } from '../api/auth';
import { InlineState } from '../components/InlineState';
import { activeUserScopeCoordinator } from '../query/client';
import { authQueryKeys } from '../query/keys';
import { createAuthenticatedSessionOutbox } from '../services/sessionOutbox';
import { PreferencesStoreProvider } from '../store/PreferencesStoreProvider';
import { useAuthStore } from '../store/authStore';
import {
  createUserPreferencesStore,
  hydrateUserPreferencesStore
} from '../store/preferencesStore';
import type { AuthSessionContextValue } from './sessionScope';

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

type AuthSessionBoundaryProps = {
  children: ReactNode;
};

export function AuthSessionProvider({
  children,
  value
}: {
  children: ReactNode;
  value: AuthSessionContextValue;
}) {
  return (
    <AuthSessionContext.Provider value={value}>
      <PreferencesStoreProvider store={value.preferencesStore}>
        {children}
      </PreferencesStoreProvider>
    </AuthSessionContext.Provider>
  );
}

type PreparedSession = AuthSessionContextValue & {
  revision: number;
};

export function AuthSessionBoundary({ children }: AuthSessionBoundaryProps) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isTerminating = useAuthStore((state) => state.isTerminating);
  const sessionRevision = useAuthStore((state) => state.sessionRevision);
  const [prepared, setPrepared] = useState<PreparedSession | null>(null);
  const [preparationError, setPreparationError] = useState<unknown>(null);
  const [preparationAttempt, setPreparationAttempt] = useState(0);
  const generationRef = useRef(0);
  const hasAccessToken = accessToken !== null;
  const meQuery = useQuery({
    queryKey: authQueryKeys.me(sessionRevision),
    queryFn: async () => meSchema.parse(await getMe()),
    enabled: hasAccessToken && !isTerminating
  });
  const user = meQuery.data;

  useEffect(() => {
    const generation = ++generationRef.current;
    setPrepared(null);
    setPreparationError(null);

    if (!user || isTerminating || !hasAccessToken) {
      return;
    }

    let superseded = false;
    void (async () => {
      try {
        await activeUserScopeCoordinator.activate(user.id);
        if (superseded || generationRef.current !== generation) {
          return;
        }

        const preferencesStore = createUserPreferencesStore(user.id);
        await hydrateUserPreferencesStore(preferencesStore);
        if (superseded || generationRef.current !== generation) {
          return;
        }

        const sessionOutbox = createAuthenticatedSessionOutbox({
          userId: user.id,
          preferencesStore,
          queryClient,
          onTerminalUnauthorized: async () => {
            const auth = useAuthStore.getState();
            if (auth.sessionRevision === sessionRevision) {
              auth.requestTerminalSessionClear();
            }
          }
        });
        setPrepared({
          revision: sessionRevision,
          user,
          userId: user.id,
          preferencesStore,
          sessionOutbox
        });
        void sessionOutbox
          .drainDue({ resumeAuthBlocked: true })
          .catch(() => undefined);
      } catch (error) {
        if (!superseded && generationRef.current === generation) {
          setPreparationError(error);
        }
      }
    })();

    return () => {
      superseded = true;
    };
  }, [
    hasAccessToken,
    isTerminating,
    preparationAttempt,
    queryClient,
    sessionRevision,
    user
  ]);

  const contextValue = useMemo<AuthSessionContextValue | null>(() => {
    if (
      isTerminating ||
      !user ||
      !prepared ||
      prepared.revision !== sessionRevision ||
      prepared.userId !== user.id
    ) {
      return null;
    }

    return prepared;
  }, [isTerminating, prepared, sessionRevision, user]);

  if (meQuery.isError) {
    return (
      <BoundaryState>
        <InlineState
          actionLabel="重新加载"
          kind="error"
          message="暂时无法确认登录信息，请检查网络后重试。"
          onAction={() => void meQuery.refetch()}
          title="登录信息加载失败"
        />
      </BoundaryState>
    );
  }

  if (preparationError) {
    return (
      <BoundaryState>
        <InlineState
          actionLabel="重新加载"
          kind="error"
          message="暂时无法加载此账户的本地偏好，请重试。"
          onAction={() => setPreparationAttempt((attempt) => attempt + 1)}
          title="账户准备失败"
        />
      </BoundaryState>
    );
  }

  if (!contextValue) {
    return (
      <BoundaryState>
        <InlineState kind="loading" message="正在准备你的冥想空间…" />
      </BoundaryState>
    );
  }

  return <AuthSessionProvider value={contextValue}>{children}</AuthSessionProvider>;
}

export function useAuthSession(): AuthSessionContextValue {
  const session = useContext(AuthSessionContext);
  if (!session) {
    throw new Error('useAuthSession must be used within AuthSessionBoundary');
  }
  return session;
}

function BoundaryState({ children }: { children: ReactNode }) {
  return <View style={styles.state}>{children}</View>;
}

const styles = StyleSheet.create({
  state: {
    flex: 1,
    justifyContent: 'center',
    padding: 24
  }
});
