import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Image, TouchableOpacity, Alert, Modal, TextInput, ImageBackground, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { API_URL } from '../../config/api';

const headerBgImage = require('../../assets/images/dorsubg3.jpg');
const headerLogo = require('../../assets/images/dorsulogo-removebg-preview (1).png');

const theme = {
  primary: '#011a6b',
  primaryDark: '#010d40',
  accent: '#fece00',
  surface: '#ffffff',
  background: '#ffffff',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
};

interface PassSlip {
  _id: string;
  date: string;
  timeOut: string;
  estimatedTimeBack: string;
  status: string;
}

interface User {
  name: string;
  email: string;
  role: string;
  campus: string;
  faculty?: string; // Faculty is optional
  profilePicture?: string;
  passSlipMinutes?: number;
}

export default function ProfileScreen() {
  const router = useRouter();
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
    }, [fetchUserData])
  );

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

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    router.replace('/');
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
        <View style={styles.modalOverlay}>
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
            <View style={styles.modalButtonContainer}>
              <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setEditNameModalVisible(false)} disabled={isUpdating}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.saveButton]} onPress={handleUpdateName} disabled={isUpdating}>
                {isUpdating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isChangePasswordModalVisible}
        onRequestClose={() => setChangePasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
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
            <View style={styles.modalButtonContainer}>
              <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setChangePasswordModalVisible(false)} disabled={isUpdating}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.saveButton]} onPress={handleChangePassword} disabled={isUpdating}>
                {isUpdating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.contentContainer}>
        <ScrollView contentContainerStyle={[styles.scrollContainer, { paddingBottom: (insets.bottom || 20) + 88 }]}>
          <View style={styles.profileHeader}>
            <TouchableOpacity onPress={handleChoosePhoto} disabled={isUploading}>
              <View style={styles.profilePictureContainer}>
                {user?.profilePicture ? (
                  <Image
                    source={{ uri: `${API_URL.replace('/api', '')}${user.profilePicture}` }}
                    style={styles.profilePicture}
                  />
                ) : (
                  <FontAwesome name="user-circle-o" size={100} color={theme.primary} />
                )}
                <View style={styles.cameraIconContainer}>
                  <FontAwesome name="camera" size={20} color="#fff" />
                </View>
                {isUploading && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userRole}>{user?.role}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTopBar} />
            <View style={styles.cardBody}>
              <View style={styles.infoRow}>
                <View style={styles.infoIconWrap}>
                  <FontAwesome name="envelope-o" size={18} color={theme.primary} />
                </View>
                <Text style={styles.infoText}>{user?.email}</Text>
              </View>
              {user?.faculty && (
                <>
                  <View style={styles.separator} />
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconWrap}>
                      <FontAwesome name="university" size={18} color={theme.primary} />
                    </View>
                    <Text style={styles.infoText}>{user.faculty}</Text>
                  </View>
                </>
              )}
              <View style={styles.separator} />
              <View style={styles.infoRow}>
                <View style={styles.infoIconWrap}>
                  <FontAwesome name="map-marker" size={18} color={theme.primary} />
                </View>
                <Text style={styles.infoText}>{user?.campus}</Text>
              </View>
            </View>
          </View>

          {user?.passSlipMinutes !== undefined && user?.role !== 'President' && (
            <View style={styles.card}>
              <View style={[styles.cardTopBar, styles.cardTopBarAccent]} />
              <View style={styles.cardBody}>
                <Text style={styles.sectionTitle}>Weekly Pass Slip Limit</Text>
                <Text style={styles.timeLimitText}>Remaining Minutes: {user.passSlipMinutes}</Text>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <View style={[styles.cardTopBar, styles.cardTopBarAccent]} />
            <View style={styles.cardBody}>
              <Text style={styles.sectionTitle}>Account Settings</Text>
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
                <Text style={styles.settingText}>Edit Name</Text>
                <FontAwesome name="angle-right" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              <View style={styles.separator} />
              <TouchableOpacity style={styles.settingRow} onPress={() => setChangePasswordModalVisible(true)}>
                <View style={styles.infoIconWrap}>
                  <FontAwesome name="lock" size={18} color={theme.primary} />
                </View>
                <Text style={styles.settingText}>Change Password</Text>
                <FontAwesome name="angle-right" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
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
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profilePictureContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'rgba(1,26,107,0.08)',
    borderWidth: 2,
    borderColor: theme.primary,
  },
  profilePicture: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.primary,
    padding: 8,
    borderRadius: 15,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 50,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
    marginTop: 12,
  },
  userRole: {
    fontSize: 15,
    color: theme.textMuted,
    marginTop: 4,
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  infoText: {
    flex: 1,
    fontSize: 15,
    color: theme.text,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingText: {
    flex: 1,
    fontSize: 15,
    color: theme.text,
    marginLeft: 0,
  },
  timeLimitText: {
    fontSize: 15,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  logoutButton: {
    marginTop: 24,
    marginBottom: 16,
    backgroundColor: theme.primaryDark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.primary,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
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
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
