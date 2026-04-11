import { Stack, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { FontAwesome } from '@expo/vector-icons';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { SocketProvider } from '../config/SocketContext';
import { NotificationsProvider } from '../contexts/NotificationsContext';

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
    <SocketProvider>
      <NotificationsProvider>
      <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false, animation: 'none' }} />
      </Stack>
      </NotificationsProvider>
    </SocketProvider>
  );
}
