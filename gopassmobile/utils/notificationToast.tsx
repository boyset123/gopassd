import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Toast, { BaseToastProps } from 'react-native-toast-message';

const MAX_MESSAGE_LENGTH = 120;
const TOAST_VISIBILITY_MS = 4500;

const colors = {
  primary: '#011a6b',
  accent: '#fece00',
};

function truncateMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= MAX_MESSAGE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}

function NotificationToast({ text1 }: BaseToastProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <FontAwesome name="bell" size={16} color={colors.primary} />
      </View>
      <Text style={styles.text}>{text1}</Text>
    </View>
  );
}

export const notificationToastConfig = {
  notification: (props: BaseToastProps) => <NotificationToast {...props} />,
};

export function showNotificationToast(message: string) {
  const text = truncateMessage(message);
  if (!text) return;

  Toast.show({
    type: 'notification',
    text1: text,
    position: 'top',
    visibilityTime: TOAST_VISIBILITY_MS,
    autoHide: true,
  });
}

const styles = StyleSheet.create({
  container: {
    width: '92%',
    maxWidth: 420,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(254, 206, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },
});
