import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

interface SignatureActionButtonsProps {
  onDraw: () => void;
  onUpload: () => void;
  onUseSaved?: () => void;
  hasSavedSignature?: boolean;
  iconColor?: string;
  buttonStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  iconSize?: number;
}

export function SignatureActionButtons({
  onDraw,
  onUpload,
  onUseSaved,
  hasSavedSignature = false,
  iconColor = '#003366',
  buttonStyle,
  containerStyle,
  iconSize = 24,
}: SignatureActionButtonsProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Pressable style={[styles.button, buttonStyle]} onPress={onDraw}>
        <FontAwesome name="pencil" size={iconSize} color={iconColor} />
      </Pressable>
      <Pressable style={[styles.button, buttonStyle]} onPress={onUpload}>
        <FontAwesome name="upload" size={iconSize} color={iconColor} />
      </Pressable>
      {hasSavedSignature && onUseSaved ? (
        <Pressable style={[styles.button, buttonStyle]} onPress={onUseSaved} accessibilityLabel="Use saved signature">
          <FontAwesome name="bookmark" size={iconSize} color={iconColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    padding: 8,
  },
});
