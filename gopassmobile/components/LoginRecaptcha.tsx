import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../config/api';

const theme = {
  primary: '#011a6b',
  primaryDark: '#010d40',
  accent: '#fece00',
  white: '#ffffff',
  muted: 'rgba(255,255,255,0.78)',
};

type Props = {
  siteKey: string;
  onVerify: (token: string | null) => void;
};

/**
 * Opens reCAPTCHA in a large modal so image challenges (e.g. select cars) are fully visible.
 * WebView loads from API /recaptcha-embed — that hostname must be in Google reCAPTCHA domains.
 */
export default function LoginRecaptcha({ siteKey, onVerify }: Props) {
  const { height: winH, width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [verified, setVerified] = useState(false);

  const uri = useMemo(
    () =>
      `${API_BASE_URL}/recaptcha-embed?sitekey=${encodeURIComponent(siteKey)}`,
    [siteKey]
  );

  const webViewHeight = Math.min(Math.round(winH * 0.78), 720);
  const sheetMaxW = Math.min(winW - 24, 440);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'token' && data.token) {
          setVerified(true);
          setModalVisible(false);
          onVerify(data.token);
        } else if (data.type === 'expired') {
          setVerified(false);
          onVerify(null);
        }
      } catch {
        /* ignore */
      }
    },
    [onVerify]
  );

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    if (!verified) {
      onVerify(null);
    }
  }, [verified, onVerify]);

  const openModal = useCallback(() => {
    setModalVisible(true);
  }, []);

  return (
    <View style={styles.outer}>
      {verified ? (
        <View style={styles.verifiedRow}>
          <Text style={styles.verifiedIcon}>✓</Text>
          <Text style={styles.verifiedText}>Security check complete</Text>
        </View>
      ) : (
        <Pressable
          onPress={openModal}
          style={({ pressed }) => [styles.ctaOuter, pressed && styles.ctaOuterPressed]}
          accessibilityRole="button"
          accessibilityLabel="Required: open security verification before sign in"
        >
          <View style={styles.ctaInner}>
            <View style={styles.ctaRow}>
              <View style={styles.ctaIconWrap}>
                <Ionicons name="shield-checkmark" size={30} color={theme.primaryDark} />
              </View>
              <View style={styles.ctaBody}>
                <View style={styles.ctaPill}>
                  <Text style={styles.ctaPillText}>REQUIRED BEFORE SIGN IN</Text>
                </View>
                <Text style={styles.ctaTitle}>Tap here — security check</Text>
                <Text style={styles.ctaHint}>Complete CAPTCHA to continue (checkbox and photo puzzles)</Text>
              </View>
              <Text style={styles.ctaChevron} accessibilityElementsHidden>
                ›
              </Text>
            </View>
          </View>
        </Pressable>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={handleCloseModal}
      >
        <View style={[styles.modalBackdrop, { paddingTop: insets.top }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseModal} accessibilityLabel="Close" />
          <View
            style={[
              styles.sheet,
              {
                maxWidth: sheetMaxW,
                marginBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>Verify you&apos;re human</Text>
                <Text style={styles.sheetSubtitle}>
                  Use the full area below for checkbox and any picture puzzles (e.g. cars, traffic lights).
                </Text>
              </View>
              <Pressable
                onPress={handleCloseModal}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close verification"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <View style={[styles.webViewShell, { height: webViewHeight }]}>
              <WebView
                key={modalVisible ? 'open' : 'closed'}
                originWhitelist={['*']}
                source={{ uri }}
                onMessage={onMessage}
                style={styles.webview}
                javaScriptEnabled
                domStorageEnabled
                automaticallyAdjustContentInsets={false}
                scrollEnabled
                nestedScrollEnabled
                mixedContentMode="always"
                setSupportMultipleWindows={false}
                {...(Platform.OS === 'android' ? { overScrollMode: 'content' as const } : {})}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    marginBottom: 12,
  },
  ctaOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      android: { elevation: 8 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
    }),
  },
  ctaOuterPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  ctaInner: {
    backgroundColor: theme.white,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ctaIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(1, 13, 64, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(1, 13, 64, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBody: {
    flex: 1,
    minWidth: 0,
  },
  ctaPill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.primaryDark,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 6,
  },
  ctaPillText: {
    color: theme.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  ctaTitle: {
    color: theme.primaryDark,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  ctaHint: {
    marginTop: 4,
    color: 'rgba(1, 13, 64, 0.72)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  ctaChevron: {
    fontSize: 40,
    fontWeight: '200',
    color: theme.primaryDark,
    marginTop: -4,
    opacity: 0.85,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(40, 167, 69, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(40, 167, 69, 0.45)',
  },
  verifiedIcon: {
    color: '#7dffb3',
    fontSize: 18,
    fontWeight: '900',
  },
  verifiedText: {
    color: theme.white,
    fontSize: 14,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(1, 13, 64, 0.72)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    backgroundColor: '#f4f6fb',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(1, 26, 107, 0.12)',
    ...Platform.select({
      android: { elevation: 24 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
    }),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(1, 26, 107, 0.08)',
  },
  sheetHeaderText: {
    flex: 1,
  },
  sheetTitle: {
    color: theme.primary,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    marginTop: 6,
    color: 'rgba(1, 26, 107, 0.65)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(1, 26, 107, 0.08)',
  },
  closeBtnPressed: {
    opacity: 0.75,
  },
  closeBtnText: {
    color: theme.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  webViewShell: {
    width: '100%',
    backgroundColor: theme.white,
  },
  webview: {
    flex: 1,
    backgroundColor: theme.white,
  },
});
