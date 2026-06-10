import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
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
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
  danger: '#dc3545',
  success: '#22c55e',
  warning: '#b45309',
};

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];
const PAGE_SIZE = 10;

interface User {
  _id: string;
  name: string;
  email: string;
  campus: string;
  role: string;
  faculty?: string;
  employeeId?: string;
  phone?: string;
  accountStatus?: string;
}

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error) && error.response?.data?.message) {
    return error.response.data.message as string;
  }
  return fallback;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = (status || 'active').toLowerCase();
  const badgeStyle =
    normalized === 'pending'
      ? styles.statusPending
      : normalized === 'rejected'
        ? styles.statusRejected
        : styles.statusActive;
  const textStyle =
    normalized === 'pending'
      ? styles.statusTextPending
      : normalized === 'rejected'
        ? styles.statusTextRejected
        : styles.statusTextActive;
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);

  return (
    <View style={[styles.statusBadge, badgeStyle]}>
      <Text style={[styles.statusBadgeText, textStyle]}>{label}</Text>
    </View>
  );
}

const UserManagement = () => {
  const { isCompact } = useResponsiveLayout();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCampus, setSelectedCampus] = useState('All Campuses');
  const [selectedRole, setSelectedRole] = useState('All Roles');
  const [selectedFaculty, setSelectedFaculty] = useState('All Faculties');
  const [roles, setRoles] = useState<string[]>(['All Roles']);
  const [faculties, setFaculties] = useState<string[]>(['All Faculties']);
  const [extensions, setExtensions] = useState<string[]>(['All Campuses']);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [rolesRes, facultiesRes, extensionsRes] = await Promise.all([
          axios.get<string[]>(`${API_URL}/metadata/roles`),
          axios.get<string[]>(`${API_URL}/metadata/faculties`),
          axios.get<string[]>(`${API_URL}/metadata/extensions`),
        ]);
        setRoles(['All Roles', ...rolesRes.data]);
        setFaculties(['All Faculties', ...facultiesRes.data]);
        setExtensions(['All Campuses', ...extensionsRes.data]);
      } catch (error) {
        console.error('Failed to load metadata:', error);
      }
    };
    loadMetadata();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [selectedCampus, selectedRole, selectedFaculty]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCampus, selectedRole, selectedFaculty]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const params = {
        campus: selectedCampus === 'All Campuses' ? undefined : selectedCampus,
        role: selectedRole === 'All Roles' ? undefined : selectedRole,
        faculty: selectedFaculty === 'All Faculties' ? undefined : selectedFaculty,
      };

      const response = await axios.get(`${API_URL}/admin/users`, {
        headers: { 'x-auth-token': token },
        params,
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pagedUsers = users.slice(startIndex, startIndex + PAGE_SIZE);

  const openEditModal = (user: User) => {
    setEditingUser(JSON.parse(JSON.stringify(user)));
    setIsEditModalVisible(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_URL}/admin/users/${editingUser._id}`, editingUser, {
        headers: { 'x-auth-token': token },
      });
      showMessage('Success', 'User updated successfully.');
      setIsEditModalVisible(false);
      fetchUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
      showMessage('Error', getApiErrorMessage(error, 'Failed to update user.'));
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.delete(`${API_URL}/admin/users/${deleteTarget._id}`, {
        headers: { 'x-auth-token': token },
      });
      setDeleteTarget(null);
      showMessage('Success', 'User deleted successfully.');
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      showMessage('Error', getApiErrorMessage(error, 'Failed to delete user.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.filtersRow}>
          <FormSelect value={selectedCampus} options={extensions} onChange={setSelectedCampus} style={styles.filterSelect} />
          <FormSelect value={selectedRole} options={roles} onChange={setSelectedRole} style={styles.filterSelect} />
          <FormSelect value={selectedFaculty} options={faculties} onChange={setSelectedFaculty} style={styles.filterSelect} />
        </View>
        <Text style={styles.resultCount}>
          {users.length} {users.length === 1 ? 'user' : 'users'}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <View style={styles.tableCard}>
          <View style={styles.tableTopBar} />
          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableHScroll}>
            <View style={styles.tableInner}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.headerText, styles.colName]}>Name</Text>
                <Text style={[styles.headerText, styles.colEmail]}>Email</Text>
                <Text style={[styles.headerText, styles.colId]}>Employee ID</Text>
                <Text style={[styles.headerText, styles.colPhone]}>Phone</Text>
                <Text style={[styles.headerText, styles.colStatus]}>Status</Text>
                <Text style={[styles.headerText, styles.colCampus]}>Campus</Text>
                <Text style={[styles.headerText, styles.colRole]}>Role</Text>
                <Text style={[styles.headerText, styles.colFaculty]}>Faculty</Text>
                <Text style={[styles.headerText, styles.colActions]}>Actions</Text>
              </View>

              {pagedUsers.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>No users match the selected filters.</Text>
                </View>
              ) : (
                pagedUsers.map((item, index) => (
                  <View key={item._id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                    <Text numberOfLines={1} style={[styles.cellText, styles.colName]}>{item.name}</Text>
                    <Text numberOfLines={1} style={[styles.cellText, styles.colEmail]}>{item.email}</Text>
                    <Text numberOfLines={1} style={[styles.cellText, styles.colId]}>{item.employeeId || '—'}</Text>
                    <Text numberOfLines={1} style={[styles.cellText, styles.colPhone]}>{item.phone || '—'}</Text>
                    <View style={styles.colStatus}>
                      <StatusBadge status={item.accountStatus || 'active'} />
                    </View>
                    <Text numberOfLines={1} style={[styles.cellText, styles.colCampus]}>{item.campus}</Text>
                    <Text numberOfLines={1} style={[styles.cellText, styles.colRole]}>{item.role}</Text>
                    <Text numberOfLines={1} style={[styles.cellText, styles.colFaculty]}>{item.faculty || '—'}</Text>
                    <View style={styles.colActions}>
                      {item.role === 'admin' ? (
                        <Text style={styles.protectedLabel}>Protected</Text>
                      ) : (
                        <>
                          <Pressable
                            style={styles.iconBtn}
                            onPress={() => openEditModal(item)}
                            accessibilityLabel="Edit user"
                            {...(Platform.OS === 'web' ? ({ title: 'Edit' } as object) : {})}
                          >
                            <FontAwesome name="pencil" size={15} color="#667085" />
                          </Pressable>
                          <Pressable
                            style={styles.iconBtn}
                            onPress={() => setDeleteTarget(item)}
                            accessibilityLabel="Delete user"
                            {...(Platform.OS === 'web' ? ({ title: 'Delete' } as object) : {})}
                          >
                            <FontAwesome name="trash" size={15} color="#667085" />
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          <View style={styles.paginationFooter}>
            <Text style={styles.paginationInfo}>
              Page {safePage} of {totalPages}
              {users.length > 0
                ? ` · ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, users.length)} of ${users.length}`
                : ''}
            </Text>
            <View style={styles.paginationActions}>
              <Pressable
                style={[styles.pageBtn, safePage <= 1 && styles.pageBtnDisabled]}
                disabled={safePage <= 1}
                onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <Text style={styles.pageBtnText}>Previous</Text>
              </Pressable>
              <Pressable
                style={[styles.pageBtn, safePage >= totalPages && styles.pageBtnDisabled]}
                disabled={safePage >= totalPages}
                onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <Text style={styles.pageBtnText}>Next</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <Modal visible={isEditModalVisible} transparent animationType="fade" onRequestClose={() => setIsEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit user</Text>
              <Pressable onPress={() => setIsEditModalVisible(false)} hitSlop={8}>
                <FontAwesome name="times" size={20} color={theme.primary} />
              </Pressable>
            </View>
            {editingUser && (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={editingUser.name}
                  onChangeText={(text) => setEditingUser({ ...editingUser, name: text })}
                  placeholder="Name"
                />
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={editingUser.email}
                  onChangeText={(text) => setEditingUser({ ...editingUser, email: text })}
                  placeholder="Email"
                  autoCapitalize="none"
                />
                <Text style={styles.fieldLabel}>Employee ID</Text>
                <TextInput
                  style={styles.input}
                  value={editingUser.employeeId || ''}
                  onChangeText={(text) => setEditingUser({ ...editingUser, employeeId: text })}
                  placeholder="Employee ID"
                />
                <Text style={styles.fieldLabel}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={editingUser.phone || ''}
                  onChangeText={(text) => setEditingUser({ ...editingUser, phone: text })}
                  placeholder="Phone"
                  keyboardType="phone-pad"
                />
                <FormSelect
                  label="Campus / Extension"
                  value={editingUser.campus}
                  options={extensions.slice(1)}
                  onChange={(campus) => setEditingUser({ ...editingUser, campus })}
                />
                <FormSelect
                  label="Role"
                  value={editingUser.role}
                  options={roles.slice(1)}
                  onChange={(role) => setEditingUser({ ...editingUser, role })}
                />
                {FACULTY_ROLES.includes(editingUser.role) && (
                  <FormSelect
                    label="Faculty"
                    value={editingUser.faculty || ''}
                    options={faculties.slice(1)}
                    onChange={(faculty) => setEditingUser({ ...editingUser, faculty })}
                  />
                )}
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancel} onPress={() => setIsEditModalVisible(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.modalSave} onPress={handleUpdateUser}>
                    <Text style={styles.modalSaveText}>Save changes</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !isDeleting && setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.deleteModal]}>
            <Text style={styles.modalTitle}>Delete user?</Text>
            <Text style={styles.deleteMessage}>
              Permanently remove <Text style={styles.deleteName}>{deleteTarget?.name}</Text> ({deleteTarget?.email})?
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setDeleteTarget(null)} disabled={isDeleting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalDelete, isDeleting && styles.btnDisabled]} onPress={handleDeleteUser} disabled={isDeleting}>
                {isDeleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
    ...Platform.select({
      web: {
        flexGrow: 0,
      },
      default: {
        flex: 1,
        minHeight: 0,
      },
    }),
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    flex: 1,
    minWidth: 280,
  },
  filterSelect: {
    flex: 1,
    minWidth: 160,
    maxWidth: 220,
    marginBottom: 0,
  },
  resultCount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textMuted,
    paddingBottom: 4,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    paddingVertical: 48,
  },
  tableCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: '#EAECF0',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
        display: 'flex' as any,
        flexDirection: 'column' as any,
      },
    }),
  },
  tableTopBar: {
    height: 3,
    backgroundColor: theme.accent,
  },
  tableHScroll: {
    ...Platform.select({
      web: {
        overflowX: 'auto' as any,
        maxWidth: '100%' as any,
      },
    }),
  },
  tableInner: {
    minWidth: 1080,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    backgroundColor: '#FFFFFF',
  },
  tableHeader: {
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
  },
  tableRowAlt: {
    backgroundColor: '#FAFBFC',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  cellText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#101828',
  },
  colName: { width: 150, paddingRight: 12, flexShrink: 0 },
  colEmail: { width: 190, paddingRight: 12, flexShrink: 0 },
  colId: { width: 96, paddingRight: 12, flexShrink: 0 },
  colPhone: { width: 108, paddingRight: 12, flexShrink: 0 },
  colStatus: { width: 88, paddingRight: 12, flexShrink: 0 },
  colCampus: { width: 120, paddingRight: 12, flexShrink: 0 },
  colRole: { width: 150, paddingRight: 12, flexShrink: 0 },
  colFaculty: { width: 170, paddingRight: 12, flexShrink: 0 },
  colActions: {
    width: 80,
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusTextActive: { color: '#15803d' },
  statusTextPending: { color: '#92400e' },
  statusTextRejected: { color: '#b42318' },
  statusActive: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  statusPending: {
    backgroundColor: 'rgba(254,206,0,0.35)',
  },
  statusRejected: {
    backgroundColor: 'rgba(220,53,69,0.12)',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  protectedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  emptyRow: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: theme.textMuted,
  },
  paginationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
    backgroundColor: '#FAFBFC',
    flexShrink: 0,
  },
  paginationInfo: {
    fontSize: 13,
    color: '#475467',
    fontWeight: '500',
  },
  paginationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  pageBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  pageBtnDisabled: {
    opacity: 0.45,
    ...Platform.select({ web: { cursor: 'not-allowed' as const } }),
  },
  pageBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#344054',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(1,26,107,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: theme.border,
    borderTopColor: theme.accent,
    ...Platform.select({ web: { boxShadow: '0 16px 40px rgba(1,26,107,0.12)' } }),
  },
  modalCardCompact: { padding: 20 },
  deleteModal: { maxWidth: 420 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalScroll: { maxHeight: 420 },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.primary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: theme.primary,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  modalCancelText: {
    color: theme.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  modalSave: {
    backgroundColor: theme.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  modalDelete: {
    backgroundColor: theme.danger,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 88,
    alignItems: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  deleteMessage: {
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 21,
    marginTop: 4,
  },
  deleteName: {
    fontWeight: '700',
    color: theme.primary,
  },
  btnDisabled: { opacity: 0.65 },
});

export default UserManagement;
