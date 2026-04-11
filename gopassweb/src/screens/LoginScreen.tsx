import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, Platform, ImageBackground, Alert, ActivityIndicator, Image, ScrollView } from 'react-native';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { LinearGradient } from 'expo-linear-gradient';
import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackNavigationProp } from '@react-navigation/stack';

const image = require('../../assets/dorsubg3.jpg');
import { API_URL } from '../config/api';
import { RECAPTCHA_SITE_KEY } from '../config/recaptcha';
import LoginRecaptcha from '../components/LoginRecaptcha';

// Theme: #fece00 (yellow), darker blue, #ffffff (white) - match HrpDashboardScreen
const theme = {
  primary: '#011a6b',
  primaryDark: '#010d40',
  accent: '#fece00',
  white: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
};

type RootStackParamList = {
  Login: undefined;
  Admin: undefined;
  HrpDashboard: undefined;
  SecurityDashboard: undefined;
};

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { isNarrow, isCompact } = useResponsiveLayout();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }
    if (RECAPTCHA_SITE_KEY && !recaptchaToken) {
      setError('Please complete the CAPTCHA verification.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/users/login`, {
        email: username,
        password: password,
        ...(recaptchaToken ? { recaptchaToken } : {}),
      });

      await AsyncStorage.setItem('userToken', response.data.token);
      await AsyncStorage.setItem('userRole', response.data.user.role);

      const userRole = response.data.user.role;

      if (userRole === 'Human Resource Personnel') {
        navigation.replace('HrpDashboard');
      } else if (userRole === 'Security Personnel') {
        navigation.replace('SecurityDashboard');
      } else if (userRole === 'admin' || userRole.includes('Staff') || userRole.includes('Head') || userRole.includes('Dean')) {
        navigation.replace('Admin');
      } else {
        Alert.alert('Login Failed', 'You do not have permission to access this application.');
      }
      
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'Login failed. Please try again.';
      if (axios.isAxiosError(error)) {
        const serverError = error as AxiosError<{ message: string }>;
        if (serverError.response) {
          errorMessage = serverError.response.data.message;
        }
      }
      setError(errorMessage);
      setRecaptchaToken(null);
      setCaptchaResetKey((k) => k + 1);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ImageBackground
      source={image}
      resizeMode="cover"
      style={styles.backgroundImage}
    >
      <LinearGradient
        colors={['rgba(1, 26, 107, 0.8)', 'rgba(1, 26, 107, 0.45)', 'rgba(1, 26, 107, 0.8)']}
        locations={[0, 0.5, 1]}
        style={styles.gradientOverlay}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.white} />
          <Text style={styles.loadingText}>Signing in...</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={[styles.pageWrapper, isNarrow && styles.pageWrapperNarrow]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.textContainer, isNarrow && styles.textContainerNarrow]}>
          <Text style={[styles.mainTitle, isCompact && styles.mainTitleCompact, isNarrow && !isCompact && styles.mainTitleNarrow]}>
            Davao Oriental
          </Text>
          <Text style={[styles.mainTitle, isCompact && styles.mainTitleCompact, isNarrow && !isCompact && styles.mainTitleNarrow]}>
            State University
          </Text>
          <View style={styles.separator} />
          <Text style={[styles.systemDescription, isCompact && styles.systemDescriptionCompact]}>Pass Slip & Travel Order System</Text>
        </View>

        <View style={[styles.loginContainer, isCompact && styles.loginContainerCompact]}>
          <View style={styles.logoWrap}>
            <Image source={require('../../assets/dorsulogo.png')} style={styles.logoImage} />
          </View>
          <Text style={styles.title}>GoPass DOrSU</Text>
          <Text style={styles.subtitle}>Welcome back</Text>

          <View style={styles.inputView}>
            <TextInput
              style={styles.textInput}
              placeholder="Email"
              placeholderTextColor={theme.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputView}>
            <TextInput
              style={styles.textInput}
              placeholder="Password"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Text style={styles.eyeIconText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {RECAPTCHA_SITE_KEY ? (
            <LoginRecaptcha
              key={captchaResetKey}
              siteKey={RECAPTCHA_SITE_KEY}
              onVerify={setRecaptchaToken}
            />
          ) : null}

          <Pressable
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.loginButtonText}>Login</Text>
          </Pressable>

          <Pressable style={styles.forgotPasswordWrap}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(1, 26, 107, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  loadingText: {
    color: theme.white,
    fontSize: 15,
    marginTop: 12,
    fontWeight: '500',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  pageWrapper: {
    flexGrow: 1,
    minHeight: '100%' as any,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: '8%',
    paddingVertical: 24,
    ...Platform.select({
      web: {
        minHeight: '100vh' as any,
      },
    }),
  },
  pageWrapperNarrow: {
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: '5%',
    paddingVertical: 32,
  },
  textContainer: {
    flex: 1,
    maxWidth: 520,
    paddingRight: '6%',
  },
  textContainerNarrow: {
    paddingRight: 0,
    maxWidth: '100%' as any,
    alignItems: 'center',
    marginBottom: 28,
    flex: 0,
  },
  mainTitle: {
    color: theme.white,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  mainTitleNarrow: {
    fontSize: 36,
    textAlign: 'center' as const,
  },
  mainTitleCompact: {
    fontSize: 28,
    textAlign: 'center' as const,
  },
  separator: {
    height: 5,
    width: 120,
    backgroundColor: theme.accent,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 3,
  },
  systemDescription: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  systemDescriptionCompact: {
    fontSize: 16,
    textAlign: 'center' as const,
  },
  loginContainer: {
    width: '100%',
    maxWidth: 420,
    padding: 44,
    paddingTop: 40,
    backgroundColor: theme.white,
    borderRadius: 20,
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 50px rgba(1, 26, 107, 0.2), 0 0 0 1px rgba(1, 26, 107, 0.08)',
      },
    }),
  },
  loginContainerCompact: {
    padding: 24,
    paddingTop: 22,
    maxWidth: '100%' as any,
  },
  logoWrap: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  logoImage: {
    width: 80,
    height: 80,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.primary,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: 28,
    fontWeight: '500',
  },
  inputView: {
    width: '100%',
    backgroundColor: theme.white,
    borderRadius: 12,
    height: 52,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    ...Platform.select({
      web: {
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      },
    }),
  },
  textInput: {
    height: 48,
    flex: 1,
    paddingHorizontal: 16,
    color: theme.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  eyeIcon: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  eyeIconText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  errorText: {
    color: '#dc3545',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
    fontWeight: '500',
  },
  loginButton: {
    width: '100%',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    backgroundColor: theme.primary,
    elevation: 3,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    ...Platform.select({
      web: {
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: 'pointer',
      },
    }),
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    color: theme.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  forgotPasswordWrap: {
    alignItems: 'center',
    marginTop: 20,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: theme.primary,
    fontWeight: '600',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
});

export default LoginScreen;
