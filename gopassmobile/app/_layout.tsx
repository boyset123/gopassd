import { Stack, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { FontAwesome } from '@expo/vector-icons';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SocketProvider } from '../config/SocketContext';
import { NotificationsProvider } from '../contexts/NotificationsContext';
import { ServerTimeProvider } from '../hooks/useServerTime';
import Toast from 'react-native-toast-message';
import { notificationToastConfig } from '../utils/notificationToast';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null; // Render nothing while fonts are loading
  }

  return (
    <SafeAreaProvider>
      <ServerTimeProvider>
      <SocketProvider>
        <NotificationsProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false, animation: 'none' }} />
          </Stack>
          <Toast config={notificationToastConfig} />
        </NotificationsProvider>
      </SocketProvider>
      </ServerTimeProvider>
    </SafeAreaProvider>
  );
}
