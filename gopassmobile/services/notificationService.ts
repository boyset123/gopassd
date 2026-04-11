import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import { playNotificationSound } from './notificationSound';

export async function registerForPushNotificationsAsync() {
  let token;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    alert('Failed to get push token for push notification!');
    return;
  }
  token = (await Notifications.getExpoPushTokenAsync({ projectId: 'gopassdorsu1' })).data;

  // Save the token to the backend
  try {
    const userToken = await AsyncStorage.getItem('userToken');
    if (userToken) {
      await axios.put(`${API_URL}/users/me/fcm-token`, { fcmToken: token }, { headers: { 'x-auth-token': userToken } });
    }
  } catch (error) {
    console.error('Failed to save FCM token:', error);
  }

  return token;
}


export function setupNotificationListeners() {
  Notifications.addNotificationReceivedListener(notification => {
    console.log('Notification received:', notification);
    playNotificationSound();
  });

  Notifications.addNotificationResponseReceivedListener(response => {
    console.log('Notification response received:', response);
    // Here you can add logic to navigate to a specific screen
    // For example, navigate to the program head dashboard
    router.push('/(tabs)/programHeadDashboard');
  });
}
