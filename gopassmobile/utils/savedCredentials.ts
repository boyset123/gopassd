import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const REMEMBER_LOGIN_KEY = 'rememberLogin';
const SAVED_EMAIL_KEY = 'savedLoginEmail';
const SAVED_PASSWORD_KEY = 'savedLoginPassword';

export async function loadRememberLogin(): Promise<boolean> {
  const value = await AsyncStorage.getItem(REMEMBER_LOGIN_KEY);
  return value === 'true';
}

export async function loadSavedCredentials(): Promise<{ email: string; password: string } | null> {
  const remember = await loadRememberLogin();
  if (!remember) return null;

  const email = await SecureStore.getItemAsync(SAVED_EMAIL_KEY);
  const password = await SecureStore.getItemAsync(SAVED_PASSWORD_KEY);
  if (!email || !password) return null;

  return { email, password };
}

export async function saveCredentials(email: string, password: string): Promise<void> {
  await AsyncStorage.setItem(REMEMBER_LOGIN_KEY, 'true');
  await SecureStore.setItemAsync(SAVED_EMAIL_KEY, email);
  await SecureStore.setItemAsync(SAVED_PASSWORD_KEY, password);
}

export async function clearSavedCredentials(): Promise<void> {
  await AsyncStorage.removeItem(REMEMBER_LOGIN_KEY);
  await Promise.all([
    SecureStore.deleteItemAsync(SAVED_EMAIL_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(SAVED_PASSWORD_KEY).catch(() => undefined),
  ]);
}
