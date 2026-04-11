import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, SafeAreaView, Platform, Image, ScrollView } from 'react-native';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { API_URL } from '../config/api';

// --- Type Definitions ---
type RootStackParamList = {
  Login: undefined;
  HrpDashboard: undefined;
  SecurityDashboard: undefined;
  Profile: undefined;
};

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Profile'>;

// --- Main Component ---
const ProfileScreen = () => {
  const { isNarrow, isCompact } = useResponsiveLayout();
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const navigation = useNavigation<ProfileScreenNavigationProp>();

  useEffect(() => {
    const fetchUserData = async () => {
      const token = await AsyncStorage.getItem('userToken');
      const role = await AsyncStorage.getItem('userRole');
      setUserRole(role);
      const headers = { 'x-auth-token': token };
      try {
        const response = await axios.get(`${API_URL}/users/me`, { headers });
        setName(response.data.name);
      } catch (error) {
        console.error('Failed to fetch user data', error);
      }
    };
    fetchUserData();
  }, []);

  const handleUpdateName = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      await axios.put(`${API_URL}/users/me/name`, { name }, { headers });
      Alert.alert('Success', 'Your name has been updated.');
    } catch (error) {
      Alert.alert('Error', 'Failed to update your name.');
      console.error(error);
    }
  };

  const handleChangePassword = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      await axios.put(`${API_URL}/users/me/password`, { currentPassword, newPassword }, { headers });
      Alert.alert('Success', 'Your password has been changed.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      Alert.alert('Error', 'Failed to change your password. Please check your current password.');
      console.error(error);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['userToken', 'userRole']);
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={[styles.container, isNarrow && styles.containerMobile]}>
      {/* Sidebar */}
      {userRole && (
        <View style={[styles.sidebar, isNarrow && styles.sidebarMobile]}>
          <View style={[styles.sidebarTop, isNarrow && styles.sidebarTopMobile]}>
            <Image
              source={require('../../assets/dorsulogo-removebg-preview (1).png')}
              style={[styles.logoImage, isCompact && styles.logoImageCompact]}
            />
            <Text style={[styles.logo, isCompact && styles.logoTextCompact]}>GoPass DOrSU</Text>
          </View>
          <View style={[styles.nav, isNarrow && styles.navMobile]}>
            <Pressable style={[styles.navItem, isNarrow && styles.navItemMobile]} onPress={() => navigation.navigate(userRole === 'Human Resource Personnel' ? 'HrpDashboard' : 'SecurityDashboard')}>
              <Text style={styles.navText}>Dashboard</Text>
            </Pressable>
            <Pressable style={[styles.navItem, styles.activeNavItem, isNarrow && styles.navItemMobile]}>
              <Text style={[styles.navText, styles.activeNavText]}>Profile</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={[styles.header, isNarrow && styles.headerMobile]}>
          <Text style={[styles.headerTitle, isNarrow && styles.headerTitleMobile]}>My Profile</Text>
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.contentContainer, isNarrow && styles.contentContainerMobile]}>
          <View style={[styles.formContainer, isNarrow && styles.formContainerMobile]}>
            <Text style={styles.formTitle}>Update Your Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={name}
              onChangeText={setName}
            />
            <Pressable style={styles.button} onPress={handleUpdateName}>
              <Text style={styles.buttonText}>Update Name</Text>
            </Pressable>
          </View>

          <View style={[styles.formContainer, isNarrow && styles.formContainerMobile]}>
            <Text style={styles.formTitle}>Change Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Current Password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="New Password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <Pressable style={styles.button} onPress={handleChangePassword}>
              <Text style={styles.buttonText}>Change Password</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    ...Platform.select({
      web: {
        minHeight: '100vh' as any,
      },
    }),
  },
  containerMobile: {
    flexDirection: 'column',
  },
  sidebar: {
    width: 260,
    backgroundColor: '#003366',
    borderTopWidth: 5,
    borderTopColor: '#FFC107',
    ...Platform.select({ web: { boxShadow: '2px 0 5px rgba(0,0,0,0.05)' } })
  },
  sidebarMobile: {
    width: '100%',
    borderTopWidth: 0,
    borderBottomWidth: 4,
    borderBottomColor: '#FFC107',
    paddingBottom: 8,
    ...Platform.select({ web: { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }),
  },
  sidebarTop: {
    alignItems: 'center',
  },
  sidebarTopMobile: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 12,
    gap: 12 as any,
  },
  logoImage: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginTop: 40,
    marginBottom: 15,
  },
  logoImageCompact: {
    width: 56,
    height: 56,
    marginTop: 0,
    marginBottom: 0,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  logoTextCompact: {
    fontSize: 18,
    textAlign: 'left',
  },
  nav: {
    flex: 1,
    padding: 20,
  },
  navMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    flexGrow: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navItemMobile: {
    marginHorizontal: 4,
    marginBottom: 8,
  },
  navItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    ...Platform.select({ web: { transition: 'background-color 0.2s ease' } })
  },
  activeNavItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderLeftColor: '#FFC107',
  },
  navText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#e9ecef',
  },
  activeNavText: {
    fontWeight: 'bold',
    color: '#ffffff',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFC107',
  },
  headerMobile: {
    padding: 16,
    flexWrap: 'wrap',
    gap: 8 as any,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#003366',
    flexShrink: 1,
  },
  headerTitleMobile: {
    fontSize: 20,
  },
  contentContainer: {
    padding: 24,
  },
  contentContainerMobile: {
    padding: 16,
    paddingBottom: 32,
  },
  logoutButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#003366',
  },
  logoutButtonText: {
    color: '#003366',
    fontSize: 14,
    fontWeight: 'bold',
  },
  formContainer: {
    backgroundColor: '#ffffff',
    padding: 30,
    borderRadius: 12,
    marginBottom: 30,
    ...Platform.select({ web: { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } })
  },
  formContainerMobile: {
    padding: 20,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#343a40',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    paddingBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  button: {
    backgroundColor: '#003366',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    ...Platform.select({ web: { transition: 'background-color 0.2s ease' } })
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ProfileScreen;
