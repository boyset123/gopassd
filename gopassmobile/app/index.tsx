import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, Platform, ImageBackground, ActivityIndicator, Image, KeyboardAvoidingView, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
const image = require('../assets/images/dorsu_bg.jpg');
import { API_URL } from '../config/api';

// Theme aligned with `gopassweb/src/screens/LoginScreen.tsx`
const theme = {
  primary: '#011a6b',
  primaryDark: '#010d40',
  accent: '#fece00',
  white: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
};

// Highest-priority dashboard the caller is entitled to, considering both their
// own role and any roles they currently cover as an active Officer-In-Charge.
// Vice President shares the President dashboard (default OIC for the President).
const DASHBOARD_PRIORITY: Array<{ role: string; route: string }> = [
  { role: 'President',          route: '/(tabs)/presidentDashboard' },
  { role: 'Vice President',     route: '/(tabs)/presidentDashboard' },
  { role: 'Faculty Dean',       route: '/(tabs)/facultyDeanDashboard' },
  { role: 'Program Head',       route: '/(tabs)/programHeadDashboard' },
  { role: 'Security Personnel', route: '/(tabs)/securityDashboard' },
];

function pickDashboardRoute(role: string | undefined | null, activeOicForRoles: string[] = []): string {
  const all = new Set<string>([role || '', ...activeOicForRoles].filter(Boolean) as string[]);
  for (const entry of DASHBOARD_PRIORITY) {
    if (all.has(entry.role)) return entry.route;
  }
  return '/(tabs)/slips';
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/users/login`, {
        email,
        password,
      });
      const { token, user } = response.data;
      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(user)); // Store user data (includes activeOicForRoles)

      const activeOicForRoles: string[] = Array.isArray(user?.activeOicForRoles) ? user.activeOicForRoles : [];
      router.replace(pickDashboardRoute(user?.role, activeOicForRoles) as any);
    } catch (error: any) {
      let errorMessage = 'Login failed. Please try again.';
      if (axios.isAxiosError(error)) {
        const serverError = error as AxiosError<{ message: string }>;
        if (serverError.response) {
          errorMessage = serverError.response.data.message;
        } else if (error.request) {
          errorMessage = 'Could not connect to the server. Please check your network and the API URL.';
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ImageBackground source={image} resizeMode="cover" style={styles.backgroundImage}>
      <StatusBar style="light" backgroundColor={theme.primaryDark} />

      <LinearGradient
        colors={['rgba(1, 13, 64, 0.92)', 'rgba(1, 26, 107, 0.68)', 'rgba(1, 26, 107, 0.50)', 'rgba(1, 13, 64, 0.92)']}
        locations={[0, 0.28, 0.72, 1]}
        style={styles.gradientOverlay}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View pointerEvents="none" style={styles.decorations}>
        <View style={[styles.orb, styles.orbTop]} />
        <View style={[styles.orb, styles.orbBottom]} />
        <View style={styles.gridSheen} />
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingPill}>
            <ActivityIndicator size="small" color={theme.white} />
            <Text style={styles.loadingText}>Signing in…</Text>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoidingWrapper}>
          <View style={styles.pageWrapper}>
            <View style={styles.hero}>
              <View style={styles.heroBrand}>
                <View style={styles.heroLogoRing}>
                  <Image source={require('../assets/images/dorsulogo-removebg-preview (1).png')} style={styles.logoImage} />
                </View>
                <View style={styles.heroText}>
                  <Text style={styles.brandTitle}>GoPass DOrSU</Text>
                  <Text style={styles.brandTagline}>Secure campus pass management</Text>
                </View>
              </View>
            </View>

            <View style={styles.card} renderToHardwareTextureAndroid needsOffscreenAlphaCompositing>
              <LinearGradient
                pointerEvents="none"
                colors={[
                  'rgba(255,255,255,0.22)',
                  'rgba(255,255,255,0.10)',
                  'rgba(1, 13, 64, 0.12)',
                ]}
                locations={[0, 0.45, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardSheen}
              />
              <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Sign in</Text>
              <Text style={styles.cardSubtitle}>Use your account to continue</Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>Unable to sign in</Text>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={styles.inputShell}>
                  <Text style={styles.inputIcon}>@</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="name@domain.com"
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!isLoading}
                    selectionColor={theme.accent}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Password</Text>
                <View style={styles.inputShell}>
                  <Text style={styles.inputIcon}>•</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Your password"
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    editable={!isLoading}
                    selectionColor={theme.accent}
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={({ pressed }) => [styles.eyeButton, pressed && styles.eyeButtonPressed]}
                    disabled={isLoading}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Text style={styles.eyeIconText}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.primaryButton, (pressed || isLoading) && styles.primaryButtonPressed]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={[theme.accent, '#ffd94a']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryButtonBg}
                >
                  <Text style={styles.primaryButtonText}>{isLoading ? 'Signing in…' : 'Continue'}</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryLink, pressed && styles.secondaryLinkPressed]}
                onPress={() => router.push('/auth/forgot-password')}
                disabled={isLoading}
              >
                <Text style={styles.secondaryLinkText}>Forgot Password?</Text>
              </Pressable>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Powered by DOrSU</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(1, 13, 64, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
      },
    }),
  },
  loadingText: {
    color: theme.white,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  decorations: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(254, 206, 0, 0.18)',
  },
  orbTop: {
    top: -160,
    right: -130,
    backgroundColor: 'rgba(254, 206, 0, 0.16)',
  },
  orbBottom: {
    bottom: -170,
    left: -160,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  gridSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.12,
    transform: [{ rotate: '12deg' }, { scale: 1.2 }],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  keyboardAvoidingWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 34,
    paddingHorizontal: 18,
  },
  pageWrapper: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
  },
  hero: {
    width: '100%',
    paddingHorizontal: 2,
    marginBottom: 18,
  },
  heroBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroLogoRing: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  logoImage: {
    width: 36,
    height: 36,
    alignSelf: 'center',
  },
  heroText: {
    flex: 1,
  },
  brandTitle: {
    color: theme.white,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  brandTagline: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Platform.select({
      ios: 'rgba(255,255,255,0.12)',
      android: 'rgba(255,255,255,0.16)',
      default: 'rgba(255,255,255,0.12)',
    }),
    borderWidth: Platform.select({ android: 1.2 as any, default: 1 }),
    borderColor: Platform.select({
      ios: 'rgba(255,255,255,0.18)',
      android: 'rgba(255,255,255,0.26)',
      default: 'rgba(255,255,255,0.18)',
    }),
    ...Platform.select({
      android: { elevation: 10 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.22,
        shadowRadius: 22,
      },
    }),
  },
  cardSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  cardContent: {
    padding: 18,
  },
  cardTitle: {
    color: theme.white,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    backgroundColor: 'rgba(220, 53, 69, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.35)',
  },
  errorBannerTitle: {
    color: theme.white,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  errorBannerText: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.86)',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 16,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputShell: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: 'rgba(1, 13, 64, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  inputIcon: {
    width: 18,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.62)',
    fontWeight: '900',
    fontSize: 14,
  },
  textInput: {
    flex: 1,
    color: theme.white,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 10,
  },
  eyeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  eyeButtonPressed: {
    opacity: 0.78,
  },
  eyeIconText: {
    fontSize: 11,
    fontWeight: '900',
    color: theme.white,
    letterSpacing: 0.6,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  primaryButtonBg: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.primaryDark,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  secondaryLink: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 8,
  },
  secondaryLinkPressed: {
    opacity: 0.75,
  },
  secondaryLinkText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '800',
    letterSpacing: 0.2,
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,255,255,0.50)',
  },
  footer: {
    marginTop: 14,
    paddingVertical: 6,
  },
  footerText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
