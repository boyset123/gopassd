import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import axios, { isAxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import FormSelect from '../components/FormSelect';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
  success: '#22c55e',
  danger: '#dc3545',
};

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];
const DORSU_EMAIL_HINT = 'Use your official @dorsu.edu.ph email address.';

interface ApiResponse {
  message: string;
}

function isValidDorsuEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith('@dorsu.edu.ph') || normalized.endsWith('@dorsu');
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
  const [isMetaLoading, setIsMetaLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'error'>('success');

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
    } catch (error) {
      console.error('Failed to load metadata:', error);
    } finally {
      setIsMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    if (modalVisible && modalType === 'success') {
      const timer = setTimeout(() => setModalVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [modalVisible, modalType]);

  const showFacultyInput = FACULTY_ROLES.includes(selectedRole);

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

    if (!isValidDorsuEmail(email)) {
      setModalMessage(DORSU_EMAIL_HINT);
      setModalType('error');
      setModalVisible(true);
      return;
    }

    setIsLoading(true);
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

      const response = await axios.post<ApiResponse>(`${API_URL}/admin/register`, payload, {
        headers: { 'x-auth-token': token },
      });

      setModalMessage(response.data.message);
      setModalType('success');
      setModalVisible(true);
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
    } catch (error: unknown) {
      console.error('Registration error:', error);
      let errorMessage = 'An unexpected error occurred. Please try again.';
      if (isAxiosError(error) && error.response) {
        errorMessage = error.response.data.message || errorMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      setModalMessage(errorMessage);
      setModalType('error');
      setModalVisible(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (isMetaLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.primary} />
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
              modalType === 'success' ? styles.successModal : styles.errorModal,
              isCompact && styles.modalViewCompact,
            ]}
          >
            {modalType === 'success' && (
              <FontAwesome name="check-circle" size={48} color={theme.success} style={{ marginBottom: 15 }} />
            )}
            <Text style={styles.modalText}>{modalMessage}</Text>
            {modalType === 'error' && (
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
        placeholder="Email Address (@dorsu.edu.ph)"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Text style={styles.hint}>{DORSU_EMAIL_HINT}</Text>

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
          <ActivityIndicator color={theme.surface} />
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
  loadingContainer: { alignItems: 'center', justifyContent: 'center', minHeight: 200 },
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
    height: 52,
    backgroundColor: theme.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.65 },
  buttonText: { color: theme.surface, fontSize: 16, fontWeight: '700' },
});

export default RegistrationForm;
