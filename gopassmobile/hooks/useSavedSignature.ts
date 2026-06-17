import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  clearSavedSignature as clearStoredSignature,
  loadSavedSignature,
  saveSavedSignature,
} from '../utils/savedSignature';

export function useSavedSignature(userId: string | undefined) {
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  const refreshSavedSignature = useCallback(async () => {
    if (!userId) {
      setSavedSignature(null);
      return;
    }
    const signature = await loadSavedSignature(userId);
    setSavedSignature(signature);
  }, [userId]);

  useEffect(() => {
    refreshSavedSignature();
  }, [refreshSavedSignature]);

  const applySavedSignature = useCallback((): string | null => {
    return savedSignature;
  }, [savedSignature]);

  const clearSavedSignature = useCallback(async () => {
    if (!userId) return;
    await clearStoredSignature(userId);
    setSavedSignature(null);
  }, [userId]);

  const saveSignature = useCallback(
    async (dataUri: string) => {
      if (!userId) return;
      await saveSavedSignature(userId, dataUri);
      setSavedSignature(dataUri);
    },
    [userId],
  );

  const promptSaveSignature = useCallback(
    (dataUri: string) => {
      if (!userId) return;
      Alert.alert(
        'Save signature?',
        'Use this signature again later on this device.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Save',
            onPress: () => {
              saveSignature(dataUri).catch(() => {
                Alert.alert('Error', 'Could not save your signature.');
              });
            },
          },
        ],
      );
    },
    [userId, saveSignature],
  );

  return {
    hasSavedSignature: savedSignature !== null,
    savedSignature,
    applySavedSignature,
    promptSaveSignature,
    saveSignature,
    clearSavedSignature,
    refreshSavedSignature,
  };
}
