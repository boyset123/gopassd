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

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];
const EMAIL_HINT = 'Use an email address you can access for account notifications.';

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
        'HR will review your account. You will be able to sign in once approved.',
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
            <Text style={styles.subtitle}>HR will review your registration before you can sign in.</Text>

            {isMetaLoading ? (
              <ActivityIndicator size="large" color="#011a6b" style={{ marginVertical: 32 }} />
            ) : (
              <>
                <TextInput style={styles.input} placeholder="First Name" value={firstName} onChangeText={setFirstName} />
                <TextInput style={styles.input} placeholder="Middle Name" value={middleName} onChangeText={setMiddleName} />
                <TextInput style={styles.input} placeholder="Surname" value={surname} onChangeText={setSurname} />
                <TextInput style={styles.input} placeholder="Suffix" value={suffix} onChangeText={setSuffix} />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.hint}>{EMAIL_HINT}</Text>
                <TextInput style={styles.input} placeholder="Employee ID Number" value={employeeId} onChangeText={setEmployeeId} autoCapitalize="characters" />
                <TextInput style={styles.input} placeholder="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
                <TextInput style={styles.input} placeholder="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

                <Text style={styles.label}>Campus / Extension</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={selectedCampus} onValueChange={setSelectedCampus}>
                    {extensions.map((c) => (
                      <Picker.Item key={c} label={c} value={c} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>Role</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={selectedRole} onValueChange={setSelectedRole}>
                    {roles.map((r) => (
                      <Picker.Item key={r} label={r} value={r} />
                    ))}
                  </Picker>
                </View>

                {showFacultyInput && (
                  <>
                    <Text style={styles.label}>Faculty / Department</Text>
                    <View style={styles.pickerWrap}>
                      <Picker selectedValue={faculty} onValueChange={setFaculty}>
                        {faculties.map((f) => (
                          <Picker.Item key={f} label={f} value={f} />
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
  label: { fontSize: 14, fontWeight: '600', color: '#011a6b', marginBottom: 6, marginTop: 4 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.22)',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
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
