import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import axios, { isAxiosError } from 'axios';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../config/api';
import { formatRoleLabel } from '../../utils/roleLabels';

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];
const EMAIL_HINT = 'Use an email address you can access for account notifications.';
/** Android release builds use the system hint color; without this, placeholders can be invisible on white inputs. */
const PLACEHOLDER_COLOR = 'rgba(1,26,107,0.45)';
/** Picker selected value + dropdown items need an explicit color on Android release APKs. */
const PICKER_TEXT_COLOR = '#011a6b';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(email.trim().toLowerCase());
}

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMetaLoading, setIsMetaLoading] = useState(true);

  const loadMetadata = useCallback(async () => {
    setIsMetaLoading(true);
    try {
      const { data } = await axios.get<{ roles: string[]; faculties: string[]; extensions: string[] }>(
        `${API_URL}/metadata/registration-options`
      );
      setRoles(data.roles);
      setFaculties(data.faculties);
      setExtensions(data.extensions);
      if (data.roles.length) setSelectedRole(data.roles[0]);
      if (data.faculties.length) setFaculty(data.faculties[0]);
      if (data.extensions.length) setSelectedCampus(data.extensions[0]);
    } catch (error) {
      console.error('Failed to load metadata:', error);
      Alert.alert('Error', 'Could not load registration options.');
    } finally {
      setIsMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  const showFacultyInput = FACULTY_ROLES.includes(selectedRole);

  const handleRegister = async () => {
    if (!firstName || !surname || !email || !password || !employeeId || !phone || !selectedCampus || !selectedRole) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }
    if (showFacultyInput && !faculty) {
      Alert.alert('Error', 'Please select a faculty / department.');
      return;
    }

    setIsSubmitting(true);
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
      Alert.alert(
        'Registration Submitted',
        'HR will review your account. You will receive an email when your registration is approved or rejected.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: unknown) {
      const message = isAxiosError(error)
        ? error.response?.data?.message || 'Registration failed.'
        : 'Registration failed.';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ImageBackground source={require('../../assets/images/dorsubg3.jpg')} resizeMode="cover" style={styles.backgroundImage}>
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top + 16 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.formContainer}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>HR will review your registration. You will be emailed when it is approved or rejected.</Text>

            {isMetaLoading ? (
              <ActivityIndicator size="large" color="#011a6b" style={{ marginVertical: 32 }} />
            ) : (
              <>
                <Text style={styles.label}>First Name</Text>
                <TextInput style={styles.input} placeholder="First Name" placeholderTextColor={PLACEHOLDER_COLOR} value={firstName} onChangeText={setFirstName} />
                <Text style={styles.label}>Middle Name</Text>
                <TextInput style={styles.input} placeholder="Middle Name (optional)" placeholderTextColor={PLACEHOLDER_COLOR} value={middleName} onChangeText={setMiddleName} />
                <Text style={styles.label}>Surname</Text>
                <TextInput style={styles.input} placeholder="Surname" placeholderTextColor={PLACEHOLDER_COLOR} value={surname} onChangeText={setSurname} />
                <Text style={styles.label}>Suffix</Text>
                <TextInput style={styles.input} placeholder="Suffix (optional)" placeholderTextColor={PLACEHOLDER_COLOR} value={suffix} onChangeText={setSuffix} />
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.hint}>{EMAIL_HINT}</Text>
                <Text style={styles.label}>Employee ID Number</Text>
                <TextInput style={styles.input} placeholder="Employee ID Number" placeholderTextColor={PLACEHOLDER_COLOR} value={employeeId} onChangeText={setEmployeeId} autoCapitalize="characters" />
                <Text style={styles.label}>Phone Number</Text>
                <TextInput style={styles.input} placeholder="Phone Number" placeholderTextColor={PLACEHOLDER_COLOR} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <Text style={styles.label}>Password</Text>
                <TextInput style={styles.input} placeholder="Password" placeholderTextColor={PLACEHOLDER_COLOR} value={password} onChangeText={setPassword} secureTextEntry />
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput style={styles.input} placeholder="Confirm Password" placeholderTextColor={PLACEHOLDER_COLOR} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

                <Text style={styles.label}>Campus / Extension</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={selectedCampus}
                    onValueChange={setSelectedCampus}
                    style={styles.picker}
                    dropdownIconColor={PICKER_TEXT_COLOR}
                  >
                    {extensions.map((c) => (
                      <Picker.Item key={c} label={c} value={c} color={PICKER_TEXT_COLOR} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>Role</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={selectedRole}
                    onValueChange={setSelectedRole}
                    style={styles.picker}
                    dropdownIconColor={PICKER_TEXT_COLOR}
                  >
                    {roles.map((r) => (
                      <Picker.Item key={r} label={formatRoleLabel(r)} value={r} color={PICKER_TEXT_COLOR} />
                    ))}
                  </Picker>
                </View>

                {showFacultyInput && (
                  <>
                    <Text style={styles.label}>Faculty / Department</Text>
                    <View style={styles.pickerWrap}>
                      <Picker
                        selectedValue={faculty}
                        onValueChange={setFaculty}
                        style={styles.picker}
                        dropdownIconColor={PICKER_TEXT_COLOR}
                      >
                        {faculties.map((f) => (
                          <Picker.Item key={f} label={f} value={f} color={PICKER_TEXT_COLOR} />
                        ))}
                      </Picker>
                    </View>
                  </>
                )}

                <Pressable style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={handleRegister} disabled={isSubmitting}>
                  <Text style={styles.buttonText}>{isSubmitting ? 'Submitting…' : 'Submit Registration'}</Text>
                </Pressable>
              </>
            )}

            <Pressable onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Back to Login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(1,26,107,0.75)' },
  flex: { flex: 1 },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderTopWidth: 4,
    borderTopColor: '#fece00',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#011a6b', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: 'rgba(1,26,107,0.65)', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.22)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
    color: '#011a6b',
  },
  hint: { fontSize: 12, color: 'rgba(1,26,107,0.65)', marginTop: -6, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#011a6b', marginBottom: 6, marginTop: 2 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.22)',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  picker: {
    color: PICKER_TEXT_COLOR,
  },
  button: {
    backgroundColor: '#011a6b',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backButtonText: { color: '#011a6b', textAlign: 'center', marginTop: 20, fontWeight: '600' },
});
