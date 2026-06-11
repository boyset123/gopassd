import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { isAxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiClient, getNetworkErrorMessage } from '../config/api';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import FormSelect from '../components/FormSelect';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
  success: '#22c55e',
  warning: '#b45309',
  danger: '#dc3545',
};

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];
const EMAIL_HINT = 'Use an email address the user can access for account notifications.';

interface RegistrationOptions {
  roles: string[];
  faculties: string[];
  extensions: string[];
}

interface RegisterApiResponse {
  message: string;
  emailSent?: boolean;
  temporaryPassword?: string;
  userEmail?: string;
  emailError?: string | null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(email.trim().toLowerCase());
}

const RegistrationForm = () => {
  const { isCompact } = useResponsiveLayout();
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [surname, setSurname] = useState('');
  const [suffix, setSuffix] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [faculties, setFaculties] = useState<string[]>([]);
  const [extensions, setExtensions] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [faculty, setFaculty] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isMetaLoading, setIsMetaLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'warning' | 'error'>('success');
  const [manualCredentials, setManualCredentials] = useState<{ email: string; password: string } | null>(null);
  const [emailFailureReason, setEmailFailureReason] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    setIsMetaLoading(true);
    try {
      const { data } = await apiClient.get<RegistrationOptions>(`${API_URL}/metadata/registration-options`);
      setRoles(data.roles);
      setFaculties(data.faculties);
      setExtensions(data.extensions);
      if (data.roles.length) setSelectedRole(data.roles[0]);
      if (data.faculties.length) setFaculty(data.faculties[0]);
      if (data.extensions.length) setSelectedCampus(data.extensions[0]);
    } catch (error) {
      console.error('Failed to load metadata:', error);
      setModalMessage(
        getNetworkErrorMessage(error, 'loading registration options') ||
          'Could not load registration options. Please refresh the page.'
      );
      setModalType('error');
      setModalVisible(true);
    } finally {
      setIsMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    if (modalVisible && modalType === 'success') {
      const timer = setTimeout(() => {
        setModalVisible(false);
        setManualCredentials(null);
        setEmailFailureReason(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [modalVisible, modalType]);

  const showFacultyInput = FACULTY_ROLES.includes(selectedRole);

  const resetForm = () => {
    setFirstName('');
    setMiddleName('');
    setSurname('');
    setSuffix('');
    setEmail('');
    setEmployeeId('');
    setPhone('');
    if (roles.length) setSelectedRole(roles[0]);
    if (faculties.length) setFaculty(faculties[0]);
    if (extensions.length) setSelectedCampus(extensions[0]);
  };

  const handleRegister = async () => {
    if (
      !firstName ||
      !surname ||
      !email ||
      !employeeId ||
      !phone ||
      !selectedCampus ||
      !selectedRole ||
      (showFacultyInput && !faculty)
    ) {
      setModalMessage('Please fill in all required fields.');
      setModalType('error');
      setModalVisible(true);
      return;
    }

    if (!isValidEmail(email)) {
      setModalMessage('Please enter a valid email address.');
      setModalType('error');
      setModalVisible(true);
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Creating account and sending credentials email…');
    setManualCredentials(null);
    setEmailFailureReason(null);
    const name = [firstName, middleName, surname, suffix].filter(Boolean).join(' ');

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setModalMessage('Authentication token not found.');
        setModalType('error');
        setModalVisible(true);
        return;
      }

      const payload = {
        name,
        email: email.trim().toLowerCase(),
        employeeId: employeeId.trim(),
        phone: phone.trim(),
        campus: selectedCampus,
        role: selectedRole,
        faculty: showFacultyInput ? faculty : undefined,
      };

      const response = await apiClient.post<RegisterApiResponse>(`${API_URL}/admin/register`, payload, {
        headers: { 'x-auth-token': token },
      });

      resetForm();

      if (response.data.emailSent === false && response.data.temporaryPassword) {
        setModalMessage(response.data.message);
        setEmailFailureReason(response.data.emailError || null);
        setManualCredentials({
          email: response.data.userEmail || payload.email,
          password: response.data.temporaryPassword,
        });
        setModalType('warning');
      } else {
        setModalMessage(response.data.message);
        setModalType('success');
      }
      setModalVisible(true);
    } catch (error: unknown) {
      console.error('Registration error:', error);
      let errorMessage =
        getNetworkErrorMessage(error, 'registering the user') ||
        'An unexpected error occurred. Please try again.';
      if (isAxiosError(error) && error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error instanceof Error && !isAxiosError(error)) {
        errorMessage = error.message;
      }
      setModalMessage(errorMessage);
      setModalType('error');
      setModalVisible(true);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  if (isMetaLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingHint}>Loading registration options…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.centeredView}>
          <View
            style={[
              styles.modalView,
              modalType === 'success' && styles.successModal,
              modalType === 'warning' && styles.warningModal,
              modalType === 'error' && styles.errorModal,
              isCompact && styles.modalViewCompact,
            ]}
          >
            {modalType === 'success' && (
              <FontAwesome name="check-circle" size={48} color={theme.success} style={{ marginBottom: 15 }} />
            )}
            {modalType === 'warning' && (
              <FontAwesome name="exclamation-triangle" size={48} color={theme.warning} style={{ marginBottom: 15 }} />
            )}
            <Text style={styles.modalText}>{modalMessage}</Text>
            {emailFailureReason ? (
              <Text style={styles.emailErrorDetail}>Reason: {emailFailureReason}</Text>
            ) : null}
            {manualCredentials && (
              <View style={styles.credentialsBox}>
                <Text style={styles.credentialsLabel}>Share these credentials manually:</Text>
                <Text style={styles.credentialsRow}>
                  <Text style={styles.credentialsKey}>Email: </Text>
                  {manualCredentials.email}
                </Text>
                <Text style={styles.credentialsRow}>
                  <Text style={styles.credentialsKey}>Temporary password: </Text>
                  {manualCredentials.password}
                </Text>
              </View>
            )}
            {(modalType === 'error' || modalType === 'warning') && (
              <Pressable style={[styles.button, styles.buttonClose]} onPress={() => setModalVisible(false)}>
                <Text style={styles.textStyle}>Close</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      <Text style={styles.title}>Register</Text>

      <View style={styles.nameContainer}>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, styles.nameInput, { marginRight: 10 }]}
            placeholder="First Name"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            style={[styles.input, styles.nameInput]}
            placeholder="Middle Name"
            value={middleName}
            onChangeText={setMiddleName}
          />
        </View>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, styles.nameInput, { marginRight: 10 }]}
            placeholder="Surname"
            value={surname}
            onChangeText={setSurname}
          />
          <TextInput
            style={[styles.input, styles.suffixInput]}
            placeholder="Suffix"
            value={suffix}
            onChangeText={setSuffix}
          />
        </View>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Text style={styles.hint}>{EMAIL_HINT}</Text>

      <TextInput
        style={styles.input}
        placeholder="Employee ID Number"
        value={employeeId}
        onChangeText={setEmployeeId}
        autoCapitalize="characters"
      />

      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <FormSelect
        label="Campus / Extension"
        value={selectedCampus}
        options={extensions}
        onChange={setSelectedCampus}
      />

      <View style={[styles.roleRow, isCompact && styles.roleRowCompact]}>
        <View style={styles.roleContainer}>
          <FormSelect label="Role" value={selectedRole} options={roles} onChange={setSelectedRole} />
        </View>
        {showFacultyInput && (
          <View style={styles.facultyContainer}>
            <FormSelect label="Faculty / Department" value={faculty} options={faculties} onChange={setFaculty} />
          </View>
        )}
      </View>

      <Pressable
        style={[styles.registerButton, isLoading && styles.disabledButton]}
        onPress={handleRegister}
        disabled={isLoading}
      >
        {isLoading ? (
          <View style={styles.submitLoading}>
            <ActivityIndicator color={theme.surface} />
            {loadingMessage ? <Text style={styles.submitLoadingText}>{loadingMessage}</Text> : null}
          </View>
        ) : (
          <Text style={styles.buttonText}>Register User</Text>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 26, 107, 0.2)',
  },
  modalView: {
    margin: 20,
    width: '92%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 35,
    alignItems: 'center',
    borderWidth: 2,
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  modalViewCompact: { margin: 12, padding: 24, borderRadius: 12 },
  successModal: { borderColor: theme.success },
  warningModal: { borderColor: theme.warning },
  errorModal: { borderColor: theme.danger },
  button: { borderRadius: 12, padding: 12, paddingHorizontal: 20, elevation: 2 },
  buttonClose: { backgroundColor: theme.primary },
  textStyle: { color: theme.surface, fontWeight: '600', textAlign: 'center' },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 15,
    color: theme.primary,
    fontWeight: '500',
    lineHeight: 22,
  },
  emailErrorDetail: {
    width: '100%',
    fontSize: 13,
    color: theme.warning,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 19,
  },
  credentialsBox: {
    width: '100%',
    backgroundColor: 'rgba(180,83,9,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.25)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  credentialsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.warning,
    marginBottom: 8,
  },
  credentialsRow: {
    fontSize: 14,
    color: theme.primary,
    marginBottom: 4,
    lineHeight: 20,
  },
  credentialsKey: {
    fontWeight: '700',
  },
  container: {
    width: '100%',
    maxWidth: 700,
    padding: 32,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 20,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 },
  loadingHint: { fontSize: 14, color: theme.textMuted },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  input: {
    height: 50,
    borderColor: theme.border,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 18,
    fontSize: 16,
    backgroundColor: theme.surface,
    color: theme.primary,
  },
  hint: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: -12,
    marginBottom: 16,
  },
  nameContainer: { marginBottom: 18 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  nameInput: { flex: 1, marginBottom: 0 },
  suffixInput: { width: 80, marginBottom: 0 },
  roleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  roleRowCompact: { flexDirection: 'column' },
  roleContainer: { flex: 1, marginRight: 10 },
  facultyContainer: { flex: 1, marginLeft: 10 },
  registerButton: {
    minHeight: 52,
    backgroundColor: theme.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  submitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  submitLoadingText: {
    color: theme.surface,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  disabledButton: { opacity: 0.65 },
  buttonText: { color: theme.surface, fontSize: 16, fontWeight: '700' },
});

export default RegistrationForm;
