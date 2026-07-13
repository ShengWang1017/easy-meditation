import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function IndexRoute() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return (
    <Redirect
      href={accessToken ? '/(tabs)/practice' : '/(auth)/login'}
    />
  );
}
