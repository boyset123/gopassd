import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'savedSignature:';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function isValidSignatureDataUri(dataUri: string): boolean {
  return typeof dataUri === 'string' && dataUri.startsWith('data:image/') && dataUri.length > 20;
}

export async function loadSavedSignature(userId: string): Promise<string | null> {
  if (!userId) return null;
  const value = await AsyncStorage.getItem(storageKey(userId));
  if (!value || !isValidSignatureDataUri(value)) return null;
  return value;
}

export async function saveSavedSignature(userId: string, dataUri: string): Promise<void> {
  if (!userId) return;
  if (!isValidSignatureDataUri(dataUri)) {
    throw new Error('Invalid signature image');
  }
  await AsyncStorage.setItem(storageKey(userId), dataUri);
}

export async function clearSavedSignature(userId: string): Promise<void> {
  if (!userId) return;
  await AsyncStorage.removeItem(storageKey(userId));
}

export async function hasSavedSignature(userId: string): Promise<boolean> {
  const signature = await loadSavedSignature(userId);
  return signature !== null;
}
