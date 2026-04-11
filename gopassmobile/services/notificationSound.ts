import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { Sound } from 'expo-av/build/Audio/Sound';

const NOTIFICATION_SOUND = require('../assets/sound/notification-sound.mp3');

/** expo-av max in-app gain (0–1). System/media volume still applies (Android uses the media stream). */
const NOTIFICATION_VOLUME = 1.0;

let cachedSound: Sound | null = null;
let loadPromise: Promise<Sound | null> | null = null;

/**
 * Re-apply session before load/play. Fixes silent playback when the session was never activated
 * or was taken over by another mode (e.g. after DuckOthers / recording).
 */
async function preparePlaybackSession(): Promise<void> {
  try {
    await Audio.setIsEnabledAsync(true);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      // MixWithOthers: reliable in-app playback. DuckOthers can fail to emit sound in some iOS states.
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (e) {
    if (__DEV__) console.warn('Notification sound: preparePlaybackSession failed', e);
  }
}

function loadSound(): Promise<Sound | null> {
  if (cachedSound) return Promise.resolve(cachedSound);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      await preparePlaybackSession();
      const { sound } = await Audio.Sound.createAsync(NOTIFICATION_SOUND, {
        shouldPlay: false,
        volume: NOTIFICATION_VOLUME,
        isMuted: false,
      });
      cachedSound = sound;
      if (__DEV__) console.log('Notification sound: loaded');
      return sound;
    } catch (e) {
      if (__DEV__) console.warn('Notification sound: load failed', e);
      loadPromise = null;
      return null;
    }
  })();
  return loadPromise;
}

/**
 * Call when the user enters the app (e.g. tabs mount) so the sound is ready
 * before the first notification. Safe to call multiple times.
 */
export async function initializeNotificationSound(): Promise<void> {
  await loadSound();
}

/**
 * Plays the notification sound. Uses a single preloaded instance so playback
 * is reliable. Call whenever a new notification arrives.
 */
export function playNotificationSound(): void {
  void (async () => {
    try {
      await preparePlaybackSession();
      const sound = await loadSound();
      if (!sound) {
        if (__DEV__) console.warn('Notification sound: no cached sound');
        return;
      }
      await sound.setIsMutedAsync(false);
      await sound.setVolumeAsync(NOTIFICATION_VOLUME);
      try {
        await sound.stopAsync();
      } catch {
        // not playing
      }
      await sound.setPositionAsync(0);
      await sound.playAsync();
      if (__DEV__) console.log('Notification sound: played');
    } catch (e) {
      if (__DEV__) console.warn('Notification sound: play failed', e);
    }
  })();
}
