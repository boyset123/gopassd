import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Image, TouchableOpacity, Alert, Modal, TextInput, ImageBackground, Platform, Switch, FlatList, KeyboardAvoidingView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { API_URL } from '../../config/api';
import { useSocket } from '../../config/SocketContext';
import { ModalActionFooter } from '../../components/ModalActionFooter';
import { formatPassSlipBalance, getPassSlipBalanceSeconds } from '../../utils/formatPassSlipBalance';

function resolveProfilePictureUri(pathOrUrl: string, apiUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = apiUrl.replace(/\/api\/?$/, '');
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin}${path}`;
}

const headerBgImage = require('../../assets/images/dorsubg3.jpg');
const headerLogo = require('../../assets/images/dorsulogo-removebg-preview (1).png');

const theme = {
  primary: '#011a6b',
  primaryDark: '#010d40',
  accent: '#fece00',
  surface: '#ffffff',
  background: '#f4f6fb',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
  danger: '#dc3545',
};

const WEEKLY_BALANCE_CAP_SECONDS = 7200;

interface PassSlip {
  _id: string;
  date: string;
  timeOut: string;
  estimatedTimeBack: string;
  status: string;
}

interface OicUserSummary {
  _id: string;
  name: string;
  role: string;
  faculty?: string;
}

interface User {
  _id?: string;
  name: string;
  email: string;
  role: string;
  campus: string;
  faculty?: string; // Faculty is optional
  profilePicture?: string;
  passSlipMinutes?: number;
  oicPrimary?: OicUserSummary | null;
  onTravelManual?: boolean;
  onTravel?: boolean;
  onTravelReason?: 'manual' | 'travel-order' | null;
  canAssignOic?: boolean;
}

interface OicCandidate {
  _id: string;
  name: string;
  role: string;
  faculty?: string;
  campus?: string;
  profilePicture?: string;
}

interface ActivityItem {
  id: string;
  category: 'notification' | 'role-change' | 'submission';
  title: string;
  detail: string;
  createdAt: string;
  relatedId?: string;
}

import { Picker } from '@react-native-picker/picker';

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];
const OIC_CAPABLE_ROLES: ReadonlyArray<string> = ['President', 'Faculty Dean', 'Program Head'];

export default function ProfileScreen() {
  const router = useRouter();
  const socket = useSocket();
  const [user, setUser] = useState<User | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditNameModalVisible, setEditNameModalVisible] = useState(false);
  const [isChangePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [surname, setSurname] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLogoutConfirmModalVisible, setLogoutConfirmModalVisible] = useState(false);

  // --- OIC Delegation state ---
  const [isUpdatingOnTravel, setIsUpdatingOnTravel] = useState(false);
  const [oicPickerSlot, setOicPickerSlot] = useState<'primary' | null>(null);
  const [oicCandidates, setOicCandidates] = useState<OicCandidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [oicSearch, setOicSearch] = useState('');
  const [isSavingOic, setIsSavingOic] = useState(false);

  const [isRoleChangeModalVisible, setRoleChangeModalVisible] = useState(false);
  const [roleChangeRoles, setRoleChangeRoles] = useState<string[]>([]);
  const [roleChangeFaculties, setRoleChangeFaculties] = useState<string[]>([]);
  const [roleChangeExtensions, setRoleChangeExtensions] = useState<string[]>([]);
  const [requestedRole, setRequestedRole] = useState('');
  const [requestedFaculty, setRequestedFaculty] = useState('');
  const [requestedExtension, setRequestedExtension] = useState('');
  const [pendingRoleRequest, setPendingRoleRequest] = useState<{
    status: string;
    requestedRole: string;
    requestedFaculty?: string;
    requestedExtension?: string;
  } | null>(null);
  const [isSubmittingRoleChange, setIsSubmittingRoleChange] = useState(false);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);

  const fetchActivity = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      setIsLoadingActivity(true);
      const response = await axios.get<ActivityItem[]>(`${API_URL}/users/me/activity`, {
        headers: { 'x-auth-token': token },
        params: { limit: 20 },
      });
      setActivityItems(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to fetch activity:', error);
      setActivityItems([]);
    } finally {
      setIsLoadingActivity(false);
    }
  }, []);

  const formatActivityDate = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activityIcon = (category: ActivityItem['category']) => {
    if (category === 'role-change') return 'exchange';
    if (category === 'submission') return 'file-text-o';
    return 'bell-o';
  };

  const fetchUserData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/');
        return;
      }
      const response = await axios.get(`${API_URL}/users/me`, {
        headers: { 'x-auth-token': token },
      });
      setUser(response.data);
      try {
        const reqRes = await axios.get(`${API_URL}/users/me/role-change-request`, {
          headers: { 'x-auth-token': token },
        });
        setPendingRoleRequest(reqRes.data);
      } catch {
        setPendingRoleRequest(null);
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      router.replace('/');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      fetchUserData();
      fetchActivity();
    }, [fetchUserData, fetchActivity])
  );

  useEffect(() => {
    if (!socket) return;
    const handler = async (payload: {
      userId?: string;
      passSlipSeconds?: number;
      passSlipMinutes?: number;
      reset?: boolean;
    }) => {
      if (payload.reset) {
        void fetchUserData();
        return;
      }
      const stored = await AsyncStorage.getItem('userData');
      const storedUser = stored ? JSON.parse(stored) : null;
      const myId = user?._id ? String(user._id) : storedUser?._id ? String(storedUser._id) : null;
      if (!myId || !payload.userId || String(payload.userId) !== myId) return;
      const balanceSeconds =
        typeof payload.passSlipSeconds === 'number'
          ? payload.passSlipSeconds
          : typeof payload.passSlipMinutes === 'number'
            ? payload.passSlipMinutes * 60
            : null;
      if (balanceSeconds == null) return;
      const balancePatch = {
        passSlipSeconds: balanceSeconds,
        passSlipMinutes: Math.floor(balanceSeconds / 60),
      };
      setUser((prev) => (prev ? { ...prev, ...balancePatch } : prev));
      if (storedUser) {
        await AsyncStorage.setItem(
          'userData',
          JSON.stringify({ ...storedUser, ...balancePatch }),
        );
      }
    };
    socket.on('passSlipBalanceUpdated', handler);
    return () => {
      socket.off('passSlipBalanceUpdated', handler);
    };
  }, [socket, user?._id, fetchUserData]);

  const handleUpdateName = async () => {
    if (!firstName.trim() || !surname.trim()) {
      Alert.alert('Validation Error', 'First name and surname are required.');
      return;
    }
    const fullName = [firstName.trim(), middleName.trim(), surname.trim()].filter(Boolean).join(' ');
    setIsUpdating(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.put(`${API_URL}/users/me/name`, { newName: fullName }, { headers: { 'x-auth-token': token } });
      setUser(response.data.user);
      setEditNameModalVisible(false);
      Alert.alert('Success', 'Your name has been updated.');
    } catch (error) {
      console.error('Failed to update name:', error);
      Alert.alert('Update Failed', 'Could not update your name. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      Alert.alert('Validation Error', 'Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Validation Error', 'New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Validation Error', 'New passwords do not match.');
      return;
    }
    setIsUpdating(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_URL}/users/me/password`, { currentPassword, newPassword }, { headers: { 'x-auth-token': token } });
      setChangePasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert('Success', 'Your password has been changed.');
    } catch (error) {
      console.error('Failed to change password:', error);
      Alert.alert('Update Failed', 'Could not change your password. Please check your current password and try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const performLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    router.replace('/');
  };

  // --- OIC Delegation handlers ---
  const canAssignOic = !!user?.canAssignOic || OIC_CAPABLE_ROLES.includes(user?.role || '');

  const handleToggleOnTravel = async (next: boolean) => {
    if (!user) return;
    setIsUpdatingOnTravel(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.put(
        `${API_URL}/users/me/on-travel`,
        { onTravelManual: next },
        { headers: { 'x-auth-token': token } }
      );
      setUser((prev) => (prev ? {
        ...prev,
        onTravelManual: !!response.data.onTravelManual,
        onTravel: !!response.data.onTravel,
        onTravelReason: response.data.onTravelReason || null,
      } : prev));
    } catch (error) {
      console.error('Failed to update on-travel status:', error);
      Alert.alert('Update Failed', 'Could not update your on-travel status.');
    } finally {
      setIsUpdatingOnTravel(false);
    }
  };

  const openOicPicker = async () => {
    setOicPickerSlot('primary');
    setOicSearch('');
    setOicCandidates([]);
    setIsLoadingCandidates(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(`${API_URL}/users/me/oic-candidates`, {
        headers: { 'x-auth-token': token },
      });
      setOicCandidates(response.data?.candidates || []);
    } catch (error: any) {
      console.error('Failed to fetch OIC candidates:', error);
      Alert.alert('Could not load candidates', error?.response?.data?.message || 'Please try again.');
      setOicPickerSlot(null);
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const closeOicPicker = () => {
    setOicPickerSlot(null);
    setOicCandidates([]);
    setOicSearch('');
  };

  const handleSelectOic = async (candidate: OicCandidate | null) => {
    if (!oicPickerSlot) return;
    setIsSavingOic(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const body: { oicPrimary?: string | null } = {};
      body.oicPrimary = candidate ? candidate._id : null;
      const response = await axios.put(`${API_URL}/users/me/oic`, body, {
        headers: { 'x-auth-token': token },
      });
      setUser((prev) => (prev ? {
        ...prev,
        oicPrimary: response.data.oicPrimary || null,
      } : prev));
      closeOicPicker();
      Alert.alert('Saved', candidate ? 'OIC assignment updated.' : 'OIC cleared.');
    } catch (error: any) {
      console.error('Failed to update OIC:', error);
      Alert.alert('Update Failed', error?.response?.data?.message || 'Could not update OIC.');
    } finally {
      setIsSavingOic(false);
    }
  };

  const filteredCandidates = oicCandidates.filter((c) => {
    if (!oicSearch.trim()) return true;
    const q = oicSearch.trim().toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.role || '').toLowerCase().includes(q);
  });

  const handleLogout = () => {
    setLogoutConfirmModalVisible(true);
  };

  const cancelLogout = () => {
    setLogoutConfirmModalVisible(false);
  };

  const confirmLogout = () => {
    setLogoutConfirmModalVisible(false);
    void performLogout();
  };

  const handleChoosePhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission Denied", "You've refused to allow this app to access your photos!");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!pickerResult.canceled) {
      uploadProfilePicture(pickerResult.assets[0].uri);
    }
  };

  const uploadProfilePicture = async (uri: string) => {
    setIsUploading(true);
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      router.replace('/');
      return;
    }

    const formData = new FormData();
    const uriParts = uri.split('.');
    const fileType = uriParts[uriParts.length - 1];

    formData.append('profilePicture', {
      uri,
      name: `photo.${fileType}`,
      type: `image/${fileType}`,
    } as any);

    try {
      const response = await axios.post(`${API_URL}/users/me/profile-picture`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-auth-token': token,
        },
      });
      setUser(response.data.user);
      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error) {
      console.error('Failed to upload profile picture:', error);
      Alert.alert('Upload Failed', 'Could not upload your profile picture. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const openRoleChangeModal = async () => {
    try {
      const [rolesRes, facultiesRes, extensionsRes] = await Promise.all([
        axios.get<string[]>(`${API_URL}/metadata/roles`),
        axios.get<string[]>(`${API_URL}/metadata/faculties`),
        axios.get<string[]>(`${API_URL}/metadata/extensions`),
      ]);
      setRoleChangeRoles(rolesRes.data);
      setRoleChangeFaculties(facultiesRes.data);
      setRoleChangeExtensions(extensionsRes.data);
      if (!pendingRoleRequest) {
        setRequestedRole(user?.role || rolesRes.data[0] || '');
        setRequestedFaculty(user?.faculty || facultiesRes.data[0] || '');
        setRequestedExtension(user?.campus || extensionsRes.data[0] || '');
      }
      setRoleChangeModalVisible(true);
    } catch (error) {
      Alert.alert('Error', 'Could not load role options.');
    }
  };

  const handleSubmitRoleChange = async () => {
    setIsSubmittingRoleChange(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.post(
        `${API_URL}/users/me/role-change-request`,
        {
          requestedRole,
          requestedFaculty: FACULTY_ROLES.includes(requestedRole) ? requestedFaculty : undefined,
          requestedExtension,
        },
        { headers: { 'x-auth-token': token } }
      );
      setRoleChangeModalVisible(false);
      setPendingRoleRequest({
        status: 'pending',
        requestedRole,
        requestedExtension,
        requestedFaculty: FACULTY_ROLES.includes(requestedRole) ? requestedFaculty : undefined,
      });
      Alert.alert('Submitted', 'Your role change request was sent to HR for review.');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not submit request.');
    } finally {
      setIsSubmittingRoleChange(false);
    }
  };

  const insets = useSafeAreaInsets();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="light" backgroundColor={theme.primary} />
      <ImageBackground source={headerBgImage} style={styles.screenHeaderBg} imageStyle={styles.screenHeaderImageStyle}>
        <View style={[styles.screenHeaderOverlay, { paddingTop: insets.top + 12 }]}>
          <Image source={headerLogo} style={styles.screenHeaderLogo} />
          <View style={styles.screenHeaderInner}>
            <Text style={styles.screenHeaderTitle}>My Profile</Text>
            <View style={styles.welcomeRow}>
              <Text style={styles.welcomeLabel}>Welcome, </Text>
              <Text style={styles.userNameHeader}>{user?.name?.split(' ')[0] || 'User'}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
      {/* Edit Name Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isEditNameModalVisible}
        onRequestClose={() => setEditNameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholderTextColor={theme.textMuted}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First Name"
              />
              <TextInput
                style={styles.modalInput}
                placeholderTextColor={theme.textMuted}
                value={middleName}
                onChangeText={setMiddleName}
                placeholder="Middle Name (Optional)"
              />
              <TextInput
                style={styles.modalInput}
                placeholderTextColor={theme.textMuted}
                value={surname}
                onChangeText={setSurname}
                placeholder="Surname"
              />
              <ModalActionFooter style={styles.modalButtonContainer}>
                <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setEditNameModalVisible(false)} disabled={isUpdating}>
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalButton, styles.saveButton]} onPress={handleUpdateName} disabled={isUpdating}>
                  {isUpdating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Save</Text>}
                </Pressable>
              </ModalActionFooter>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Role Change Request Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={isRoleChangeModalVisible}
        onRequestClose={() => setRoleChangeModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView
            style={styles.roleChangeModalScroll}
            contentContainerStyle={styles.roleChangeModalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.roleChangeModalCard}>
              <View style={styles.roleChangeModalAccent} />
              <View style={styles.roleChangeModalHeader}>
                <View style={styles.roleChangeModalIconWrap}>
                  <FontAwesome name="exchange" size={22} color={theme.primary} />
                </View>
                <Text style={styles.roleChangeModalTitle}>Request Role Change</Text>
                <Text style={styles.roleChangeModalSubtitle}>
                  {pendingRoleRequest
                    ? 'Your request is being reviewed by HR.'
                    : 'Choose the role and assignment you would like HR to approve.'}
                </Text>
              </View>

              <View style={styles.roleChangeSection}>
                <Text style={styles.roleChangeSectionLabel}>Current assignment</Text>
                <View style={styles.roleChangeChipRow}>
                  <View style={styles.roleChangeChip}>
                    <Text style={styles.roleChangeChipKey}>Role</Text>
                    <Text style={styles.roleChangeChipValue}>{user?.role || '—'}</Text>
                  </View>
                  <View style={styles.roleChangeChip}>
                    <Text style={styles.roleChangeChipKey}>Campus</Text>
                    <Text style={styles.roleChangeChipValue}>{user?.campus || '—'}</Text>
                  </View>
                  {user?.faculty ? (
                    <View style={[styles.roleChangeChip, styles.roleChangeChipWide]}>
                      <Text style={styles.roleChangeChipKey}>Faculty</Text>
                      <Text style={styles.roleChangeChipValue}>{user.faculty}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {pendingRoleRequest ? (
                <>
                  <View style={styles.roleChangePendingBanner}>
                    <FontAwesome name="clock-o" size={18} color="#7c5e00" />
                    <View style={styles.roleChangePendingText}>
                      <Text style={styles.roleChangePendingTitle}>Awaiting HR review</Text>
                      <Text style={styles.roleChangePendingBody}>
                        Requested: {pendingRoleRequest.requestedRole}
                        {pendingRoleRequest.requestedExtension ? ` @ ${pendingRoleRequest.requestedExtension}` : ''}
                        {pendingRoleRequest.requestedFaculty ? ` (${pendingRoleRequest.requestedFaculty})` : ''}
                      </Text>
                    </View>
                  </View>
                  <Pressable style={[styles.modalButton, styles.saveButton, styles.roleChangeCloseButton]} onPress={() => setRoleChangeModalVisible(false)}>
                    <Text style={styles.modalButtonText}>Close</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.roleChangeSection}>
                    <Text style={styles.roleChangeSectionLabel}>Requested assignment</Text>
                    <Text style={styles.fieldLabel}>Role</Text>
                    <View style={styles.pickerWrap}>
                      <Picker
                        selectedValue={requestedRole}
                        onValueChange={setRequestedRole}
                        style={styles.picker}
                        dropdownIconColor={theme.text}
                      >
                        {roleChangeRoles.map((r) => (
                          <Picker.Item key={r} label={r} value={r} color={theme.text} />
                        ))}
                      </Picker>
                    </View>
                    <Text style={styles.fieldLabel}>Campus / Extension</Text>
                    <View style={styles.pickerWrap}>
                      <Picker
                        selectedValue={requestedExtension}
                        onValueChange={setRequestedExtension}
                        style={styles.picker}
                        dropdownIconColor={theme.text}
                      >
                        {roleChangeExtensions.map((e) => (
                          <Picker.Item key={e} label={e} value={e} color={theme.text} />
                        ))}
                      </Picker>
                    </View>
                    {FACULTY_ROLES.includes(requestedRole) && (
                      <>
                        <Text style={styles.fieldLabel}>Faculty / Department</Text>
                        <View style={styles.pickerWrap}>
                          <Picker
                            selectedValue={requestedFaculty}
                            onValueChange={setRequestedFaculty}
                            style={styles.picker}
                            dropdownIconColor={theme.text}
                          >
                            {roleChangeFaculties.map((f) => (
                              <Picker.Item key={f} label={f} value={f} color={theme.text} />
                            ))}
                          </Picker>
                        </View>
                      </>
                    )}
                  </View>
                  <View style={styles.roleChangeHrNote}>
                    <FontAwesome name="info-circle" size={14} color={theme.textMuted} />
                    <Text style={styles.roleChangeHrNoteText}>HR will review your request before any changes take effect.</Text>
                  </View>
                  <ModalActionFooter style={[styles.modalButtonContainer, styles.roleChangeModalFooter]}>
                    <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setRoleChangeModalVisible(false)}>
                      <Text style={styles.modalButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.modalButton, styles.saveButton]} onPress={handleSubmitRoleChange} disabled={isSubmittingRoleChange}>
                      {isSubmittingRoleChange ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Submit to HR</Text>}
                    </Pressable>
                  </ModalActionFooter>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isChangePasswordModalVisible}
        onRequestClose={() => setChangePasswordModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TextInput
                style={styles.modalInput}
                placeholderTextColor={theme.textMuted}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Current Password"
                secureTextEntry
              />
              <TextInput
                style={styles.modalInput}
                placeholderTextColor={theme.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New Password"
                secureTextEntry
              />
              <TextInput
                style={styles.modalInput}
                placeholderTextColor={theme.textMuted}
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                placeholder="Confirm New Password"
                secureTextEntry
              />
              <ModalActionFooter style={styles.modalButtonContainer}>
                <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setChangePasswordModalVisible(false)} disabled={isUpdating}>
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalButton, styles.saveButton]} onPress={handleChangePassword} disabled={isUpdating}>
                  {isUpdating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Save</Text>}
                </Pressable>
              </ModalActionFooter>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isLogoutConfirmModalVisible}
        onRequestClose={cancelLogout}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Logout</Text>
            <Text style={styles.logoutConfirmText}>
              Are you sure you want to log out? You will need to sign in again to continue.
            </Text>
            <ModalActionFooter style={styles.modalButtonContainer}>
              <Pressable style={[styles.modalButton, styles.logoutStayButton]} onPress={cancelLogout}>
                <Text style={styles.modalButtonText}>Stay Logged In</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.logoutConfirmButton]} onPress={confirmLogout}>
                <Text style={styles.modalButtonText}>Logout</Text>
              </Pressable>
            </ModalActionFooter>
          </View>
        </View>
      </Modal>

      {/* OIC Picker Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={oicPickerSlot !== null}
        onRequestClose={closeOicPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Choose Primary OIC</Text>
            <TextInput
              style={styles.modalInput}
              placeholderTextColor={theme.textMuted}
              value={oicSearch}
              onChangeText={setOicSearch}
              placeholder="Search by name or role"
            />
            {isLoadingCandidates ? (
              <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
            ) : (
              <FlatList
                data={filteredCandidates}
                keyExtractor={(item) => item._id}
                style={{ maxHeight: 320 }}
                ListEmptyComponent={
                  <Text style={styles.oicEmptyText}>
                    {oicSearch ? 'No matches found.' : 'No eligible candidates available.'}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.oicCandidateRow}
                    onPress={() => handleSelectOic(item)}
                    disabled={isSavingOic}
                  >
                    <View style={styles.infoIconWrap}>
                      <FontAwesome name="user" size={16} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.oicCandidateName}>{item.name}</Text>
                      <Text style={styles.oicCandidateRole}>
                        {item.role}
                        {item.faculty ? ` — ${item.faculty}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
            <ModalActionFooter style={styles.modalButtonContainer}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeOicPicker}
                disabled={isSavingOic}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.logoutConfirmButton]}
                onPress={() => handleSelectOic(null)}
                disabled={isSavingOic}
              >
                {isSavingOic ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Clear</Text>}
              </Pressable>
            </ModalActionFooter>
          </View>
        </View>
      </Modal>

      <View style={styles.contentContainer}>
        <ScrollView contentContainerStyle={[styles.scrollContainer, { paddingBottom: (insets.bottom || 20) + 88 }]}>
          <View style={styles.card}>
            <View style={styles.cardTopBar} />
            <View style={styles.profileHeaderBand}>
              <TouchableOpacity onPress={handleChoosePhoto} disabled={isUploading} activeOpacity={0.85}>
                <View style={styles.profilePictureContainer}>
                  {user?.profilePicture ? (
                    <Image
                      source={{ uri: resolveProfilePictureUri(user.profilePicture, API_URL) }}
                      style={styles.profilePicture}
                    />
                  ) : (
                    <FontAwesome name="user-circle-o" size={80} color={theme.primary} />
                  )}
                  <View style={styles.cameraIconContainer}>
                    <FontAwesome name="camera" size={14} color="#fff" />
                  </View>
                  {isUploading && (
                    <View style={styles.uploadingOverlay}>
                      <ActivityIndicator size="large" color="#fff" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <Text style={styles.userName} numberOfLines={2}>
                {user?.name}
              </Text>
              {user?.role ? (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{user.role}</Text>
                </View>
              ) : null}
              <Text style={styles.profileMetaHint}>Tap photo to update</Text>
            </View>

            <View style={styles.profileDetailsSection}>
              <Text style={styles.profileDetailsTitle}>Contact & Assignment</Text>
              <View style={styles.profileDetailsPanel}>
                <View style={styles.profileDetailRow}>
                  <View style={styles.profileDetailIconWrap}>
                    <FontAwesome name="envelope-o" size={15} color={theme.primary} />
                  </View>
                  <View style={styles.profileDetailText}>
                    <Text style={styles.profileDetailLabel}>Email</Text>
                    <Text style={styles.profileDetailValue}>{user?.email}</Text>
                  </View>
                </View>
                <View style={[styles.profileDetailRow, !user?.faculty && styles.profileDetailRowLast]}>
                  <View style={styles.profileDetailIconWrap}>
                    <FontAwesome name="map-marker" size={15} color={theme.primary} />
                  </View>
                  <View style={styles.profileDetailText}>
                    <Text style={styles.profileDetailLabel}>Campus / Extension</Text>
                    <Text style={styles.profileDetailValue}>{user?.campus || '—'}</Text>
                  </View>
                </View>
                {user?.faculty ? (
                  <View style={[styles.profileDetailRow, styles.profileDetailRowLast]}>
                    <View style={styles.profileDetailIconWrap}>
                      <FontAwesome name="university" size={15} color={theme.primary} />
                    </View>
                    <View style={styles.profileDetailText}>
                      <Text style={styles.profileDetailLabel}>Faculty / Department</Text>
                      <Text style={styles.profileDetailValue}>{user.faculty}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {(user?.passSlipSeconds !== undefined || user?.passSlipMinutes !== undefined) &&
            user?.role !== 'President' && (
            <View style={styles.card}>
              <View style={[styles.cardTopBar, styles.cardTopBarAccent]} />
              <View style={styles.cardBody}>
                <View style={styles.sectionTitleRow}>
                  <FontAwesome name="clock-o" size={16} color={theme.primary} />
                  <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>Weekly Pass Slip Balance</Text>
                </View>
                <View style={styles.balanceStatRow}>
                  <Text style={styles.balanceStatValue}>
                    {formatPassSlipBalance(getPassSlipBalanceSeconds(user))}
                  </Text>
                  <Text style={styles.balanceStatLabel}>
                    remaining of {formatPassSlipBalance(WEEKLY_BALANCE_CAP_SECONDS)}
                  </Text>
                </View>
                <View style={styles.balanceBarTrack}>
                  <View
                    style={[
                      styles.balanceBarFill,
                      {
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            (getPassSlipBalanceSeconds(user) / WEEKLY_BALANCE_CAP_SECONDS) * 100,
                          ),
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          )}

          {canAssignOic && (
            <View style={styles.card}>
              <View style={[styles.cardTopBar, styles.cardTopBarAccent]} />
              <View style={styles.cardBody}>
                <Text style={styles.sectionTitle}>Officer-In-Charge (OIC) Delegation</Text>
                <Text style={styles.oicHelperText}>
                  When you are on travel, your assigned OIC can sign documents on your behalf. The OIC&apos;s name will appear with a note that they signed in your place.
                </Text>

                <View style={styles.onTravelRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.onTravelLabel}>I am on travel</Text>
                    <Text style={styles.onTravelSubLabel}>
                      {user?.onTravel
                        ? user?.onTravelReason === 'travel-order'
                          ? 'Auto-detected from your approved Travel Order'
                          : 'Manually set'
                        : 'You are currently available to sign'}
                    </Text>
                  </View>
                  {isUpdatingOnTravel ? (
                    <ActivityIndicator color={theme.primary} />
                  ) : (
                    <Switch
                      value={!!user?.onTravelManual}
                      onValueChange={handleToggleOnTravel}
                      trackColor={{ true: theme.primary, false: '#cbd5e1' }}
                      thumbColor={user?.onTravelManual ? theme.accent : '#f4f4f5'}
                    />
                  )}
                </View>

                <View style={styles.separator} />

                <Text style={styles.oicSlotLabel}>Primary OIC</Text>
                <Text style={styles.oicSlotHint}>
                  {user?.role === 'President'
                    ? 'Pick a Vice President to act as your default OIC.'
                    : user?.role === 'Faculty Dean'
                      ? 'Pick a Program Head from your faculty.'
                      : 'Pick a Faculty Staff from your faculty.'}
                </Text>
                <Pressable style={styles.oicPickerButton} onPress={() => void openOicPicker()}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.oicPickerName}>
                      {user?.oicPrimary ? user.oicPrimary.name : 'Not assigned'}
                    </Text>
                    {user?.oicPrimary && (
                      <Text style={styles.oicPickerRole}>
                        {user.oicPrimary.role}
                        {user.oicPrimary.faculty ? ` — ${user.oicPrimary.faculty}` : ''}
                      </Text>
                    )}
                  </View>
                  <FontAwesome name="chevron-right" size={14} color={theme.textMuted} />
                </Pressable>

              </View>
            </View>
          )}

          <View style={styles.card}>
            <View style={[styles.cardTopBar, styles.cardTopBarAccent]} />
            <View style={styles.cardBody}>
              <View style={styles.sectionTitleRow}>
                <FontAwesome name="cog" size={16} color={theme.primary} />
                <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>Account Settings</Text>
              </View>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  const nameParts = user?.name.split(' ').filter(Boolean) || [];
                  let currentFirstName = '';
                  let currentMiddleName = '';
                  let currentSurname = '';
                  if (nameParts.length === 1) currentFirstName = nameParts[0];
                  else if (nameParts.length === 2) {
                    currentFirstName = nameParts[0];
                    currentSurname = nameParts[1];
                  } else if (nameParts.length > 2) {
                    currentSurname = nameParts.pop() || '';
                    currentFirstName = nameParts.shift() || '';
                    currentMiddleName = nameParts.join(' ');
                  }
                  setFirstName(currentFirstName);
                  setMiddleName(currentMiddleName);
                  setSurname(currentSurname);
                  setEditNameModalVisible(true);
                }}
              >
                <View style={styles.infoIconWrap}>
                  <FontAwesome name="edit" size={18} color={theme.primary} />
                </View>
                <View style={styles.settingTextWrap}>
                  <Text style={styles.settingText}>Edit Name</Text>
                  <Text style={styles.settingSubtext}>Update how your name appears</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color={theme.textMuted} />
              </TouchableOpacity>
              <View style={styles.separator} />
              <TouchableOpacity style={styles.settingRow} onPress={() => setChangePasswordModalVisible(true)}>
                <View style={styles.infoIconWrap}>
                  <FontAwesome name="lock" size={18} color={theme.primary} />
                </View>
                <View style={styles.settingTextWrap}>
                  <Text style={styles.settingText}>Change Password</Text>
                  <Text style={styles.settingSubtext}>Keep your account secure</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color={theme.textMuted} />
              </TouchableOpacity>
              {user?.role !== 'admin' && (
                <>
                  <View style={styles.separator} />
                  <TouchableOpacity style={styles.settingRow} onPress={openRoleChangeModal}>
                    <View style={styles.infoIconWrap}>
                      <FontAwesome name="exchange" size={18} color={theme.primary} />
                    </View>
                    <View style={styles.settingTextWrap}>
                      <Text style={styles.settingText}>Request Role Change</Text>
                      {pendingRoleRequest ? (
                        <View style={styles.pendingBadge}>
                          <FontAwesome name="clock-o" size={11} color="#7c5e00" />
                          <Text style={styles.pendingBadgeText}>Pending HR review</Text>
                        </View>
                      ) : (
                        <Text style={styles.settingSubtext}>Update role, campus, or faculty</Text>
                      )}
                    </View>
                    <FontAwesome name="chevron-right" size={14} color={theme.textMuted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <View style={[styles.cardTopBar, styles.cardTopBarAccent]} />
            <View style={styles.cardBody}>
              <Pressable
                style={styles.activitySectionHeader}
                onPress={() => setIsActivityExpanded((prev) => !prev)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isActivityExpanded }}
              >
                <View style={[styles.sectionTitleRow, styles.sectionTitleRowFlush]}>
                  <FontAwesome name="history" size={16} color={theme.primary} />
                  <Text style={[styles.sectionTitle, styles.activitySectionTitle]}>Recent Activity</Text>
                  {!isActivityExpanded && activityItems.length > 0 ? (
                    <View style={styles.activityCountBadge}>
                      <Text style={styles.activityCountText}>{activityItems.length}</Text>
                    </View>
                  ) : null}
                </View>
                <FontAwesome
                  name={isActivityExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={theme.primary}
                />
              </Pressable>
              {isActivityExpanded ? (
                isLoadingActivity ? (
                  <ActivityIndicator size="small" color={theme.primary} style={styles.activityLoader} />
                ) : activityItems.length === 0 ? (
                  <Text style={styles.activityEmpty}>No recent activity yet.</Text>
                ) : (
                  activityItems.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.activityRow}
                      onPress={() => {
                        if (item.relatedId) router.push('/(tabs)/slips');
                      }}
                      activeOpacity={item.relatedId ? 0.7 : 1}
                    >
                      <View style={styles.activityIconWrap}>
                        <FontAwesome name={activityIcon(item.category) as any} size={16} color={theme.primary} />
                      </View>
                      <View style={styles.activityTextWrap}>
                        <Text style={styles.activityTitle}>{item.title}</Text>
                        <Text style={styles.activityDetail} numberOfLines={2}>{item.detail}</Text>
                        <Text style={styles.activityDate}>{formatActivityDate(item.createdAt)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )
              ) : null}
            </View>
          </View>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <FontAwesome name="sign-out" size={16} color={theme.danger} style={styles.logoutIcon} />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  screenHeaderBg: {
    width: '100%',
    minHeight: 120,
  },
  screenHeaderImageStyle: {
    resizeMode: 'cover',
  },
  screenHeaderOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 4,
    borderBottomColor: theme.accent,
    backgroundColor: 'rgba(1,26,107,0.82)',
    minHeight: 120,
  },
  screenHeaderLogo: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  screenHeaderInner: {
    flex: 1,
  },
  screenHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  welcomeLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  userNameHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  contentContainer: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background,
  },
  profileHeaderBand: {
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(1,26,107,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  profileDetailsSection: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  profileDetailsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  profileDetailsPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: 'rgba(1,26,107,0.02)',
    overflow: 'hidden',
  },
  profileDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 12,
  },
  profileDetailRowLast: {
    borderBottomWidth: 0,
  },
  profileDetailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(1,26,107,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  profileDetailText: {
    flex: 1,
    minWidth: 0,
  },
  profileDetailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    marginBottom: 2,
  },
  profileDetailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.text,
    lineHeight: 21,
  },
  profilePictureContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'rgba(1,26,107,0.06)',
    borderWidth: 3,
    borderColor: theme.accent,
  },
  profilePicture: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: theme.primary,
    padding: 7,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.surface,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 44,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text,
    lineHeight: 26,
    marginTop: 12,
    textAlign: 'center',
  },
  roleBadge: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(1,26,107,0.08)',
    borderWidth: 1,
    borderColor: theme.border,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  profileMetaHint: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#011a6b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  cardTopBar: {
    height: 4,
    width: '100%',
    backgroundColor: theme.primary,
  },
  cardTopBarAccent: {
    backgroundColor: theme.accent,
  },
  cardBody: {
    padding: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitleInline: {
    marginBottom: 0,
    flex: 1,
  },
  sectionTitleRowFlush: {
    marginBottom: 0,
    flex: 1,
  },
  activitySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  activitySectionTitle: {
    marginBottom: 0,
    flex: 0,
  },
  activityCountBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  activityLoader: {
    marginVertical: 12,
  },
  activityEmpty: {
    fontSize: 14,
    color: theme.textMuted,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  activityIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(1,26,107,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  activityDetail: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  activityDate: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 4,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoContent: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 15,
    color: theme.text,
    lineHeight: 21,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(1,26,107,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  separator: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 14,
  },
  balanceStatRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.primary,
  },
  balanceStatLabel: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  balanceBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(1,26,107,0.1)',
    overflow: 'hidden',
  },
  balanceBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: theme.accent,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  settingSubtext: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  settingTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(254,206,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(180,140,0,0.35)',
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7c5e00',
  },
  roleChangeModalScroll: {
    flex: 1,
    width: '100%',
  },
  roleChangeModalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: '100%',
  },
  roleChangeModalCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: theme.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#011a6b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  roleChangeModalAccent: {
    height: 4,
    backgroundColor: theme.accent,
  },
  roleChangeModalHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  roleChangeModalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(1,26,107,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  roleChangeModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  roleChangeModalSubtitle: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  roleChangeSection: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: 'rgba(1,26,107,0.04)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  roleChangeSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  roleChangeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChangeChip: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
    minWidth: 110,
    flexGrow: 1,
  },
  roleChangeChipWide: {
    minWidth: '100%',
    flexBasis: '100%',
  },
  roleChangeChipKey: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  roleChangeChipValue: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  roleChangePendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(254,206,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(180,140,0,0.35)',
  },
  roleChangePendingText: {
    flex: 1,
    minWidth: 0,
  },
  roleChangePendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7c5e00',
    marginBottom: 4,
  },
  roleChangePendingBody: {
    fontSize: 13,
    color: theme.primary,
    lineHeight: 18,
  },
  roleChangeHrNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
  },
  roleChangeHrNoteText: {
    flex: 1,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 17,
  },
  roleChangeCloseButton: {
    alignSelf: 'stretch',
    marginHorizontal: 20,
    marginBottom: 20,
    marginTop: 4,
  },
  roleChangeModalFooter: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  logoutButton: {
    marginTop: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(220,53,69,0.35)',
  },
  logoutIcon: {
    marginRight: 2,
  },
  logoutButtonText: {
    color: theme.danger,
    fontWeight: '700',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  /** ScrollView container so input modals always scroll above the keyboard. */
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  modalContent: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#011a6b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
    marginBottom: 6,
  },
  picker: {
    color: theme.text,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    color: theme.text,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: theme.textMuted,
  },
  saveButton: {
    backgroundColor: theme.primary,
  },
  logoutConfirmText: {
    fontSize: 15,
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 21,
  },
  logoutConfirmButton: {
    backgroundColor: '#b42318',
  },
  logoutStayButton: {
    backgroundColor: '#6b7280',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  oicHelperText: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 14,
    lineHeight: 18,
  },
  onTravelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  onTravelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  onTravelSubLabel: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  oicSlotLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 4,
  },
  oicSlotHint: {
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: 8,
  },
  oicPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(1,26,107,0.06)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  oicPickerName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  oicPickerRole: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  oicCandidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  oicCandidateName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  oicCandidateRole: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  oicEmptyText: {
    textAlign: 'center',
    color: theme.textMuted,
    paddingVertical: 16,
  },
});
