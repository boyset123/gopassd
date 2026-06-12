import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, SafeAreaView, Platform, Image, ScrollView, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { API_URL } from '../config/api';
import FormSelect from '../components/FormSelect';

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
  sectionBg: 'rgba(1,26,107,0.04)',
  pendingBg: 'rgba(254,206,0,0.18)',
  pendingBorder: 'rgba(180,140,0,0.35)',
  pendingText: '#7c5e00',
};

interface PendingRoleRequest {
  requestedRole: string;
  requestedFaculty?: string;
  requestedExtension?: string;
  status?: string;
}

interface ActivityItem {
  id: string;
  category: 'notification' | 'role-change' | 'submission';
  title: string;
  detail: string;
  createdAt: string;
  relatedId?: string;
}

// --- Type Definitions ---
type RootStackParamList = {
  Login: undefined;
  Admin: undefined;
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
  const [userCampus, setUserCampus] = useState('');
  const [userFaculty, setUserFaculty] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [faculties, setFaculties] = useState<string[]>([]);
  const [extensions, setExtensions] = useState<string[]>([]);
  const [requestedRole, setRequestedRole] = useState('');
  const [requestedFaculty, setRequestedFaculty] = useState('');
  const [requestedExtension, setRequestedExtension] = useState('');
  const [pendingRoleRequest, setPendingRoleRequest] = useState<PendingRoleRequest | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);
  const navigation = useNavigation<ProfileScreenNavigationProp>();

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

  useEffect(() => {
    const fetchUserData = async () => {
      const token = await AsyncStorage.getItem('userToken');
      const role = await AsyncStorage.getItem('userRole');
      setUserRole(role);
      const headers = { 'x-auth-token': token };
      try {
        const [meRes, rolesRes, facultiesRes, extensionsRes] = await Promise.all([
          axios.get(`${API_URL}/users/me`, { headers }),
          axios.get<string[]>(`${API_URL}/metadata/roles`),
          axios.get<string[]>(`${API_URL}/metadata/faculties`),
          axios.get<string[]>(`${API_URL}/metadata/extensions`),
        ]);
        setName(meRes.data.name);
        setUserRole(meRes.data.role);
        setUserCampus(meRes.data.campus || '');
        setUserFaculty(meRes.data.faculty || '');
        setRoles(rolesRes.data);
        setFaculties(facultiesRes.data);
        setExtensions(extensionsRes.data);
        setRequestedRole(meRes.data.role);
        setRequestedFaculty(meRes.data.faculty || facultiesRes.data[0] || '');
        setRequestedExtension(meRes.data.campus || extensionsRes.data[0] || '');
        try {
          const reqRes = await axios.get(`${API_URL}/users/me/role-change-request`, { headers });
          setPendingRoleRequest(reqRes.data);
        } catch {
          setPendingRoleRequest(null);
        }
      } catch (error) {
        console.error('Failed to fetch user data', error);
      }
    };
    const fetchActivity = async () => {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      setIsLoadingActivity(true);
      try {
        const response = await axios.get<ActivityItem[]>(`${API_URL}/users/me/activity`, {
          headers: { 'x-auth-token': token },
          params: { limit: 20 },
        });
        setActivityItems(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Failed to fetch activity', error);
        setActivityItems([]);
      } finally {
        setIsLoadingActivity(false);
      }
    };

    fetchUserData();
    fetchActivity();
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

  const handleSubmitRoleChange = async () => {
    if (pendingRoleRequest) {
      Alert.alert('Pending Request', 'You already have a role change request awaiting HR review.');
      return;
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      await axios.post(
        `${API_URL}/users/me/role-change-request`,
        {
          requestedRole,
          requestedFaculty: FACULTY_ROLES.includes(requestedRole) ? requestedFaculty : undefined,
          requestedExtension,
        },
        { headers }
      );
      setPendingRoleRequest({ requestedRole, requestedExtension, requestedFaculty: FACULTY_ROLES.includes(requestedRole) ? requestedFaculty : undefined });
      Alert.alert('Submitted', 'Your role change request was sent to HR for review.');
    } catch (error: unknown) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message || 'Request failed.' : 'Request failed.';
      Alert.alert('Error', msg);
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
            <Pressable
              style={[styles.navItem, isNarrow && styles.navItemMobile]}
              onPress={() =>
                navigation.navigate(
                  userRole === 'Human Resource Personnel' ? 'HrpDashboard' : userRole === 'admin' ? 'Admin' : 'Login'
                )
              }
            >
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

          {userRole !== 'admin' && (
            <View style={[styles.formContainer, styles.roleChangeCard, isNarrow && styles.formContainerMobile]}>
              <View style={styles.roleChangeHeader}>
                <View style={styles.roleChangeIconWrap}>
                  <FontAwesome name="exchange" size={20} color={theme.primary} />
                </View>
                <View style={styles.roleChangeHeaderText}>
                  <Text style={styles.roleChangeTitle}>Request Role Change</Text>
                  <Text style={styles.roleChangeSubtitle}>
                    Ask HR to update your role, campus, or faculty assignment.
                  </Text>
                </View>
              </View>

              <View style={styles.assignmentCard}>
                <Text style={styles.assignmentLabel}>Current assignment</Text>
                <View style={styles.chipRow}>
                  <View style={styles.chip}>
                    <Text style={styles.chipKey}>Role</Text>
                    <Text style={styles.chipValue}>{userRole}</Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipKey}>Campus</Text>
                    <Text style={styles.chipValue}>{userCampus || '—'}</Text>
                  </View>
                  {userFaculty ? (
                    <View style={[styles.chip, styles.chipWide]}>
                      <Text style={styles.chipKey}>Faculty</Text>
                      <Text style={styles.chipValue}>{userFaculty}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {pendingRoleRequest ? (
                <View style={styles.pendingBanner}>
                  <FontAwesome name="clock-o" size={18} color={theme.pendingText} />
                  <View style={styles.pendingBannerText}>
                    <Text style={styles.pendingBannerTitle}>Awaiting HR review</Text>
                    <Text style={styles.pendingBannerBody}>
                      Requested: {pendingRoleRequest.requestedRole}
                      {pendingRoleRequest.requestedExtension ? ` @ ${pendingRoleRequest.requestedExtension}` : ''}
                      {pendingRoleRequest.requestedFaculty ? ` (${pendingRoleRequest.requestedFaculty})` : ''}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.requestSection}>
                  <Text style={styles.assignmentLabel}>Requested assignment</Text>
                  <View style={styles.requestFields}>
                    <FormSelect label="Role" value={requestedRole} options={roles} onChange={setRequestedRole} />
                    <FormSelect label="Campus / Extension" value={requestedExtension} options={extensions} onChange={setRequestedExtension} />
                    {FACULTY_ROLES.includes(requestedRole) && (
                      <FormSelect label="Faculty / Department" value={requestedFaculty} options={faculties} onChange={setRequestedFaculty} />
                    )}
                  </View>
                  <View style={styles.hrNote}>
                    <FontAwesome name="info-circle" size={14} color={theme.textMuted} />
                    <Text style={styles.hrNoteText}>HR will review your request before any changes take effect.</Text>
                  </View>
                  <Pressable style={styles.roleChangeButton} onPress={handleSubmitRoleChange}>
                    <Text style={styles.buttonText}>Submit Request to HR</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          <View style={[styles.formContainer, isNarrow && styles.formContainerMobile]}>
            <Pressable
              style={styles.activitySectionHeader}
              onPress={() => setIsActivityExpanded((prev) => !prev)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isActivityExpanded }}
            >
              <Text style={[styles.formTitle, styles.activitySectionTitle]}>Recent Activity</Text>
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
                <Text style={styles.formHint}>No recent activity yet.</Text>
              ) : (
                activityItems.map((item) => (
                  <View key={item.id} style={styles.activityRow}>
                    <View style={styles.activityIconWrap}>
                      <FontAwesome name={activityIcon(item.category) as any} size={16} color={theme.primary} />
                    </View>
                    <View style={styles.activityTextWrap}>
                      <Text style={styles.activityTitle}>{item.title}</Text>
                      <Text style={styles.activityDetail}>{item.detail}</Text>
                      <Text style={styles.activityDate}>{formatActivityDate(item.createdAt)}</Text>
                    </View>
                  </View>
                ))
              )
            ) : null}
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
  formHint: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 16,
  },
  roleChangeCard: {
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    overflow: 'hidden',
  },
  roleChangeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14 as any,
    marginBottom: 20,
  },
  roleChangeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.sectionBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  roleChangeHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  roleChangeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 4,
  },
  roleChangeSubtitle: {
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 20,
  },
  assignmentCard: {
    backgroundColor: theme.sectionBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  assignmentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10 as any,
  },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.border,
    minWidth: 120,
    flexGrow: 1,
  },
  chipWide: {
    minWidth: '100%' as any,
    flexBasis: '100%' as any,
  },
  chipKey: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  chipValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12 as any,
    backgroundColor: theme.pendingBg,
    borderWidth: 1,
    borderColor: theme.pendingBorder,
    borderRadius: 12,
    padding: 16,
  },
  pendingBannerText: {
    flex: 1,
    minWidth: 0,
  },
  pendingBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.pendingText,
    marginBottom: 4,
  },
  pendingBannerBody: {
    fontSize: 14,
    color: theme.primary,
    lineHeight: 20,
  },
  requestSection: {
    gap: 12 as any,
  },
  requestFields: {
    backgroundColor: theme.sectionBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  hrNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8 as any,
    paddingHorizontal: 4,
  },
  hrNoteText: {
    flex: 1,
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 18,
  },
  roleChangeButton: {
    backgroundColor: theme.primary,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
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
  activitySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  activitySectionTitle: {
    marginBottom: 0,
    flex: 1,
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  activityLoader: {
    marginVertical: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  activityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.sectionBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  activityTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primary,
  },
  activityDetail: {
    fontSize: 14,
    color: theme.textMuted,
    marginTop: 2,
    lineHeight: 20,
  },
  activityDate: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 4,
  },
});

export default ProfileScreen;
