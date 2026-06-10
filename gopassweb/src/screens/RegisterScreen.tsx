import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Platform,
  ImageBackground,
  ActivityIndicator,
  Image,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import axios, { isAxiosError } from 'axios';
import { StackNavigationProp } from '@react-navigation/stack';
import { FontAwesome } from '@expo/vector-icons';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { API_URL } from '../config/api';
import FormSelect from '../components/FormSelect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const image = require('../../assets/dorsubg3.jpg');

const theme = {
  primary: '#011a6b',
  primaryDark: '#010d40',
  accent: '#fece00',
  white: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
  success: '#22c55e',
  danger: '#dc3545',
  sectionBg: 'rgba(1,26,107,0.04)',
};

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];
const DORSU_EMAIL_HINT = 'Official @dorsu.edu.ph email required.';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
};

type RegisterScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Register'>;

interface Props {
  navigation: RegisterScreenNavigationProp;
}

function isValidDorsuEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@dorsu.edu.ph');
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { isNarrow, isCompact } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const useWideLayout = !isNarrow;
  const scrollTopPadding = Platform.OS === 'web' && !isCompact ? 32 : insets.top + 16;

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [surname, setSurname] = useState('');
  const [suffix, setSuffix] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [faculties, setFaculties] = useState<string[]>([]);
  const [extensions, setExtensions] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [faculty, setFaculty] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMetaLoading, setIsMetaLoading] = useState(true);
  const [error, setError] = useState('');
  const [successVisible, setSuccessVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loadMetadata = useCallback(async () => {
    setIsMetaLoading(true);
    try {
      const [rolesRes, facultiesRes, extensionsRes] = await Promise.all([
        axios.get<string[]>(`${API_URL}/metadata/roles`),
        axios.get<string[]>(`${API_URL}/metadata/faculties`),
        axios.get<string[]>(`${API_URL}/metadata/extensions`),
      ]);
      setRoles(rolesRes.data);
      setFaculties(facultiesRes.data);
      setExtensions(extensionsRes.data);
      if (rolesRes.data.length) setSelectedRole(rolesRes.data[0]);
      if (facultiesRes.data.length) setFaculty(facultiesRes.data[0]);
      if (extensionsRes.data.length) setSelectedCampus(extensionsRes.data[0]);
    } catch (err) {
      console.error('Failed to load metadata:', err);
      setError('Could not load registration options. Please try again later.');
    } finally {
      setIsMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  const showFacultyInput = FACULTY_ROLES.includes(selectedRole);

  const handleRegister = async () => {
    setError('');
    if (!firstName || !surname || !email || !password || !employeeId || !phone || !selectedCampus || !selectedRole) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!isValidDorsuEmail(email)) {
      setError(DORSU_EMAIL_HINT);
      return;
    }
    if (showFacultyInput && !faculty) {
      setError('Please select a faculty / department.');
      return;
    }

    setIsLoading(true);
    const name = [firstName, middleName, surname, suffix].filter(Boolean).join(' ');

    try {
      await axios.post(`${API_URL}/users/register`, {
        name,
        email: email.trim().toLowerCase(),
        password,
        employeeId: employeeId.trim(),
        phone: phone.trim(),
        campus: selectedCampus,
        role: selectedRole,
        faculty: showFacultyInput ? faculty : undefined,
      });
      setSuccessVisible(true);
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formContent = (
    <View style={[styles.card, useWideLayout && styles.cardWide, isCompact && styles.cardCompact]}>
      <View style={[styles.header, useWideLayout && styles.headerWide]}>
        <Image
          source={require('../../assets/dorsulogo.png')}
          style={[styles.logoImage, useWideLayout && styles.logoImageWide]}
        />
        <View style={[styles.headerText, useWideLayout && styles.headerTextWide]}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={[styles.subtitle, useWideLayout && styles.subtitleWide]}>
            Register for GoPass DOrSU. HR will review your account before you can sign in.
          </Text>
        </View>
      </View>

      {isMetaLoading ? (
        <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
      ) : (
        <>
          {error ? (
            <View style={styles.errorBanner}>
              <FontAwesome name="exclamation-circle" size={16} color={theme.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <View style={[styles.row, useWideLayout && styles.rowWide]}>
              <View style={[styles.field, styles.fieldQuarter]}>
                <FieldLabel>First Name *</FieldLabel>
                <TextInput style={styles.input} placeholder="First" value={firstName} onChangeText={setFirstName} placeholderTextColor={theme.textMuted} />
              </View>
              <View style={[styles.field, styles.fieldQuarter]}>
                <FieldLabel>Middle Name</FieldLabel>
                <TextInput style={styles.input} placeholder="Middle" value={middleName} onChangeText={setMiddleName} placeholderTextColor={theme.textMuted} />
              </View>
              <View style={[styles.field, styles.fieldQuarter]}>
                <FieldLabel>Surname *</FieldLabel>
                <TextInput style={styles.input} placeholder="Surname" value={surname} onChangeText={setSurname} placeholderTextColor={theme.textMuted} />
              </View>
              <View style={[styles.field, styles.fieldSuffix]}>
                <FieldLabel>Suffix</FieldLabel>
                <TextInput style={styles.input} placeholder="Jr." value={suffix} onChangeText={setSuffix} placeholderTextColor={theme.textMuted} />
              </View>
            </View>

            <View style={[styles.row, useWideLayout && styles.rowWide]}>
              <View style={[styles.field, useWideLayout && styles.fieldHalf]}>
                <FieldLabel>Email Address *</FieldLabel>
                <TextInput
                  style={styles.input}
                  placeholder="name@dorsu.edu.ph"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={theme.textMuted}
                />
                <Text style={styles.hint}>{DORSU_EMAIL_HINT}</Text>
              </View>
              <View style={[styles.field, useWideLayout && styles.fieldHalf]}>
                <FieldLabel>Phone Number *</FieldLabel>
                <TextInput style={styles.input} placeholder="09XX XXX XXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={theme.textMuted} />
              </View>
            </View>

            <View style={[styles.row, useWideLayout && styles.rowWide]}>
              <View style={[styles.field, useWideLayout ? styles.fieldHalf : styles.fieldFull]}>
                <FieldLabel>Employee ID Number *</FieldLabel>
                <TextInput style={styles.input} placeholder="Employee ID" value={employeeId} onChangeText={setEmployeeId} autoCapitalize="characters" placeholderTextColor={theme.textMuted} />
              </View>
            </View>
          </View>

          <View style={[styles.columnsWrap, useWideLayout && styles.columnsWrapWide]}>
            <View style={[styles.section, styles.sectionColumn]}>
              <Text style={styles.sectionTitle}>Account Security</Text>
              <View style={styles.field}>
                <FieldLabel>Password *</FieldLabel>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput, styles.inputNoMargin]}
                    placeholder="At least 6 characters"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholderTextColor={theme.textMuted}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                    <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.field}>
                <FieldLabel>Confirm Password *</FieldLabel>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  placeholderTextColor={theme.textMuted}
                />
              </View>
            </View>

            <View style={[styles.section, styles.sectionColumn]}>
              <Text style={styles.sectionTitle}>Work Assignment</Text>
              <FormSelect
                label="Campus / Extension *"
                value={selectedCampus}
                options={extensions}
                onChange={setSelectedCampus}
                style={styles.selectField}
              />
              <FormSelect label="Role *" value={selectedRole} options={roles} onChange={setSelectedRole} style={styles.selectField} />
              {showFacultyInput && (
                <FormSelect label="Faculty / Department *" value={faculty} options={faculties} onChange={setFaculty} style={styles.selectField} />
              )}
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable style={[styles.registerButton, isLoading && styles.buttonDisabled]} onPress={handleRegister} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color={theme.white} /> : <Text style={styles.registerButtonText}>Submit Registration</Text>}
            </Pressable>
            <View style={styles.signInRow}>
              <Text style={styles.signInPrompt}>Already have an account?</Text>
              <Pressable onPress={() => navigation.navigate('Login')} style={styles.signInLinkButton} disabled={isLoading}>
                <Text style={styles.signInLink}>Sign in</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );

  const useWebOverflowScroll = Platform.OS === 'web' && !isCompact;

  return (
    <ImageBackground source={image} style={styles.backgroundImage} resizeMode="cover">
      <LinearGradient
        colors={['rgba(1,26,107,0.90)', 'rgba(1,26,107,0.78)']}
        style={styles.gradientOverlay}
        pointerEvents="none"
      />
      {useWebOverflowScroll ? (
        <View style={styles.webScroll}>
          <View style={[styles.scrollContent, isCompact && styles.scrollContentCompact, { paddingTop: scrollTopPadding }]}>
            {formContent}
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoiding}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact, { paddingTop: scrollTopPadding }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator
            nestedScrollEnabled
            automaticallyAdjustKeyboardInsets
          >
            {formContent}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={successVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <FontAwesome name="check-circle" size={48} color={theme.success} />
            <Text style={styles.modalTitle}>Registration Submitted</Text>
            <Text style={styles.modalMessage}>
              HR will review your account. You will be able to sign in once your registration is approved.
            </Text>
            <Pressable style={styles.modalButton} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.modalButtonText}>Back to Sign In</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  webScroll: {
    flex: 1,
    width: '100%',
    height: '100%' as any,
    position: 'relative',
    zIndex: 1,
    overflowY: 'auto' as any,
    overflowX: 'hidden' as any,
    ...Platform.select({
      web: {
        maxHeight: '100vh' as any,
      },
    }),
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  keyboardAvoiding: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 56,
    alignItems: 'center',
  },
  scrollContentCompact: { padding: 16, paddingBottom: 48 },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: theme.white,
    borderRadius: 16,
    padding: 28,
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    ...Platform.select({ web: { boxShadow: '0 20px 50px rgba(0,0,0,0.22)' } }),
  },
  cardWide: {
    maxWidth: 960,
    padding: 36,
    borderRadius: 18,
  },
  cardCompact: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 24 },
  headerWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  logoImage: { width: 64, height: 64, marginBottom: 12 },
  logoImageWide: { marginBottom: 0 },
  headerText: { alignItems: 'center' },
  headerTextWide: { flex: 1, alignItems: 'flex-start', marginBottom: 0 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.primary,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 420,
  },
  subtitleWide: { textAlign: 'left', maxWidth: undefined },
  loader: { marginVertical: 40 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(220,53,69,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220,53,69,0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  errorText: { flex: 1, color: theme.danger, fontSize: 14, lineHeight: 20 },
  section: {
    backgroundColor: theme.sectionBg,
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sectionColumn: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 14,
  },
  columnsWrap: {},
  columnsWrapWide: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  row: { marginBottom: 0 },
  rowWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  field: { marginBottom: 12, minWidth: 0 },
  fieldFull: { width: '100%' },
  fieldHalf: { flex: 1, minWidth: 200 },
  fieldQuarter: { flex: 1, minWidth: 120 },
  fieldSuffix: { width: 88, flexGrow: 0, flexShrink: 0 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
    marginBottom: 6,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: theme.primary,
    backgroundColor: theme.white,
    marginBottom: 4,
  },
  inputNoMargin: { marginBottom: 0 },
  hint: { fontSize: 11, color: theme.textMuted, marginTop: 4, marginBottom: 0 },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: 'absolute', right: 12, top: 13 },
  selectField: { marginBottom: 8 },
  footer: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    alignItems: 'stretch',
    gap: 14,
  },
  registerButton: {
    width: '100%',
    height: 50,
    backgroundColor: theme.primary,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  buttonDisabled: { opacity: 0.65 },
  registerButtonText: { color: theme.white, fontWeight: '700', fontSize: 16 },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 4,
  },
  signInPrompt: {
    fontSize: 14,
    color: theme.textMuted,
  },
  signInLinkButton: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  signInLink: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
    ...Platform.select({ web: { textDecorationLine: 'underline' as const } }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.white,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: theme.primary, marginTop: 16, marginBottom: 8 },
  modalMessage: { fontSize: 14, color: theme.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  modalButton: { backgroundColor: theme.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  modalButtonText: { color: theme.white, fontWeight: '600' },
});

export default RegisterScreen;
