import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import axios, { isAxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

// Theme: match AdminScreen / HrpDashboardScreen (#fece00, darker blue, #ffffff)
const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
  success: '#22c55e',
  danger: '#dc3545',
};

interface ApiResponse {
  message: string;
}

const roles = [
  'Office Staff',
  'Faculty Staff',
  'Program Head',
  'Human Resource Personnel',
  'Office Records',
  'Faculty Dean',
  'Security Personnel',
  'President',
  'Vice President'
];

const faculties = [
  'Faculty of Agriculture and Life Sciences',
  'Faculty of Computing, Engineering, and Technology',
  'Faculty of Criminal Justice Education',
  'Faculty of Nursing and Allied Health Sciences',
  'Faculty of Humanities, Social Science, and Communication',
  'Faculty of Teacher Education',
  'Faculty of Business Management',
];

const campuses = [
  'Main Campus',
  'Baganga Campus',
  'Banaybanay Campus',
  'Cateel Campus',
  'San Isidro Campus',
  'Tarragona Campus',
];

const RegistrationForm = () => {
  const { isCompact } = useResponsiveLayout();
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [surname, setSurname] = useState('');
  const [suffix, setSuffix] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState(roles[0]);
  const [faculty, setFaculty] = useState(faculties[0]);
  const [selectedCampus, setSelectedCampus] = useState(campuses[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (modalVisible && modalType === 'success') {
      const timer = setTimeout(() => {
        setModalVisible(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [modalVisible, modalType]);

  const facultyRoles = ['Faculty Staff', 'Program Head', 'Faculty Dean'];
  const showFacultyInput = facultyRoles.includes(selectedRole);

  const handleRegister = async () => {
    if (!firstName || !surname || !email || !selectedCampus || !selectedRole || (showFacultyInput && !faculty)) {
      setModalMessage('Please fill in all required fields.');
      setModalType('error');
      setModalVisible(true);
      return;
    }

    setIsLoading(true);

    // Construct full name
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
        email, 
        campus: selectedCampus, 
        role: selectedRole, 
        faculty: showFacultyInput ? faculty : undefined 
      };

      const response = await axios.post<ApiResponse>(`${API_URL}/admin/register`, 
        payload,
        { headers: { 'x-auth-token': token } }
      );

      setModalMessage(response.data.message);
      setModalType('success');
      setModalVisible(true);
      // Clear form
      setFirstName('');
      setMiddleName('');
      setSurname('');
      setSuffix('');
      setEmail('');
      setSelectedRole(roles[0]);
      setFaculty(faculties[0]);
      setSelectedCampus(campuses[0]);

    } catch (error: any) {
      console.error('Registration error:', error);
      let errorMessage = 'An unexpected error occurred. Please try again.';
            if (isAxiosError(error) && error.response) {
        // Use the specific error message from the backend if available
        errorMessage = error.response.data.message || 'Registration failed. Please check the console for more details.';
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

  return (
    <View style={styles.container}>
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(!modalVisible);
        }}
      >
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
              <Pressable
                style={[styles.button, styles.buttonClose]}
                onPress={() => setModalVisible(!modalVisible)}
              >
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

      <Text style={styles.label}>Select Campus:</Text>
      <View style={[styles.pickerContainer, { width: '50%' }]}>
        <Picker
          selectedValue={selectedCampus}
          onValueChange={(itemValue) => setSelectedCampus(itemValue)}
          style={styles.picker}
        >
          {campuses.map(campus => (
            <Picker.Item key={campus} label={campus} value={campus} />
          ))}
        </Picker>
      </View>

      <View style={styles.roleRow}>
        <View style={styles.roleContainer}>
          <Text style={styles.label}>Select Role:</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedRole}
              onValueChange={(itemValue) => setSelectedRole(itemValue)}
              style={styles.picker}
            >
              {roles.map(role => (
                <Picker.Item key={role} label={role} value={role} />
              ))}
            </Picker>
          </View>
        </View>

        {showFacultyInput && (
          <View style={styles.facultyContainer}>
            <Text style={styles.label}>Faculty / Department:</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={faculty}
                onValueChange={(itemValue) => setFaculty(itemValue)}
                style={styles.picker}
              >
                {faculties.map(fac => (
                  <Picker.Item key={fac} label={fac} value={fac} />
                ))}
              </Picker>
            </View>
          </View>
        )}
      </View>

      <Pressable 
        style={[styles.registerButton, isLoading && styles.disabledButton]}
        onPress={handleRegister}
        disabled={isLoading}
      >
        {isLoading ? <ActivityIndicator color={theme.surface} /> : <Text style={styles.buttonText}>Register User</Text>}
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
  modalViewCompact: {
    margin: 12,
    padding: 24,
    borderRadius: 12,
  },
  successModal: {
    borderColor: theme.success,
  },
  errorModal: {
    borderColor: theme.danger,
  },
  button: {
    borderRadius: 12,
    padding: 12,
    paddingHorizontal: 20,
    elevation: 2,
  },
  buttonClose: {
    backgroundColor: theme.primary,
  },
  textStyle: {
    color: theme.surface,
    fontWeight: '600',
    textAlign: 'center',
  },
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
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.primary,
    marginBottom: 10,
  },
  nameContainer: {
    marginBottom: 18,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  nameInput: {
    flex: 1,
    marginBottom: 0,
  },
  suffixInput: {
    width: 80,
    marginBottom: 0,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  roleContainer: {
    flex: 1,
    marginRight: 10,
  },
  facultyContainer: {
    flex: 1,
    marginLeft: 10,
  },
  pickerContainer: {
    height: 50,
    borderColor: theme.border,
    borderWidth: 2,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  picker: {
    height: '100%',
    width: '100%',
  },
  registerButton: {
    height: 52,
    backgroundColor: theme.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.65,
  },
  buttonText: {
    color: theme.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default RegistrationForm;
