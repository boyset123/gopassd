import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Modal, TextInput, Alert, ScrollView, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

// Theme: match AdminScreen / HrpDashboardScreen (#fece00, darker blue, #ffffff)
const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
  danger: '#dc3545',
};

// These should match the lists in your RegistrationForm
const campuses = ['All Campuses', 'Main Campus', 'Baganga Campus', 'Banaybanay Campus', 'Cateel Campus', 'San Isidro Campus', 'Tarragona Campus'];
const roles = ['All Roles', 'Office Staff', 'Faculty Staff', 'Program Head', 'Human Resource Personnel', 'Office Records', 'Faculty Dean', 'Security Personnel', 'President', 'Vice President'];
const faculties = ['All Faculties', 'Faculty of Agriculture and Life Sciences', 'Faculty of Computing, Engineering, and Technology', 'Faculty of Criminal Justice Education', 'Faculty of Nursing and Allied Health Sciences', 'Faculty of Humanities, Social Science, and Communication', 'Faculty of Teacher Education', 'Faculty of Business Management'];

interface User {
  _id: string;
  name: string;
  email: string;
  campus: string;
  role: string;
  faculty?: string;
}

const UserManagement = () => {
  const { isCompact } = useResponsiveLayout();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCampus, setSelectedCampus] = useState('All Campuses');
  const [selectedRole, setSelectedRole] = useState('All Roles');
  const [selectedFaculty, setSelectedFaculty] = useState('All Faculties');
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

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

  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedUsers = users.slice(startIndex, startIndex + pageSize);

  const openEditModal = (user: User) => {
    setEditingUser(JSON.parse(JSON.stringify(user))); // Create a copy to avoid direct state mutation
    setIsEditModalVisible(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_URL}/admin/users/${editingUser._id}`, editingUser, {
        headers: { 'x-auth-token': token },
      });
      Alert.alert('Success', 'User updated successfully.');
      setIsEditModalVisible(false);
      fetchUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
      Alert.alert('Error', 'Failed to update user.');
    }
  };

  const confirmDelete = (userId: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteUser(userId) },
      ]
    );
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.delete(`${API_URL}/admin/users/${userId}`, {
        headers: { 'x-auth-token': token },
      });
      Alert.alert('Success', 'User deleted successfully.');
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      Alert.alert('Error', 'Failed to delete user.');
    }
  };

  const renderHeader = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableHorizontalScroll}>
      <View style={[styles.tableInner, styles.tableHeader]}>
        <Text numberOfLines={1} style={[styles.headerText, styles.colName]}>Name</Text>
        <Text numberOfLines={1} style={[styles.headerText, styles.colEmail]}>Email</Text>
        <Text numberOfLines={1} style={[styles.headerText, styles.colCampus]}>Campus</Text>
        <Text numberOfLines={1} style={[styles.headerText, styles.colRole]}>Role</Text>
        <Text numberOfLines={1} style={[styles.headerText, styles.colFaculty]}>Faculty</Text>
        <Text numberOfLines={1} style={[styles.headerText, styles.colActions]}>Actions</Text>
      </View>
    </ScrollView>
  );

  const renderItem = ({ item, index }: { item: User; index: number }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableHorizontalScroll}>
      <View style={[styles.tableInner, styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.rowText, styles.colName]}>{item.name}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.rowText, styles.colEmail]}>{item.email}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.rowText, styles.colCampus]}>{item.campus}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.rowText, styles.colRole]}>{item.role}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.rowText, styles.colFaculty]}>{item.faculty || 'N/A'}</Text>
        <View style={styles.colActions}>
          {item.role !== 'admin' && (
            <>
              <Pressable
                style={[styles.actionButton, styles.editButton]}
                onPress={() => openEditModal(item)}
                accessibilityLabel="Edit user"
                {...(Platform.OS === 'web' ? ({ title: 'Edit' } as any) : {})}
              >
                <FontAwesome name="pencil" size={16} color="#667085" />
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => confirmDelete(item._id)}
                accessibilityLabel="Delete user"
                {...(Platform.OS === 'web' ? ({ title: 'Delete' } as any) : {})}
              >
                <FontAwesome name="trash" size={16} color="#667085" />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );

  const renderFooter = () => (
    <View style={styles.paginationFooter}>
      <Text style={styles.paginationInfo}>
        Page {safePage} of {totalPages} • Showing {users.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, users.length)} of {users.length}
      </Text>
      <View style={styles.paginationActions}>
        <Pressable
          style={[styles.paginationButton, safePage <= 1 && styles.paginationButtonDisabled]}
          disabled={safePage <= 1}
          onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
        >
          <Text style={styles.paginationButtonText}>Prev</Text>
        </Pressable>
        <Pressable
          style={[styles.paginationButton, safePage >= totalPages && styles.paginationButtonDisabled]}
          disabled={safePage >= totalPages}
          onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        >
          <Text style={styles.paginationButtonText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Edit Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, isCompact && styles.modalContentCompact]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit User</Text>
              <Pressable onPress={() => setIsEditModalVisible(false)}>
                <FontAwesome name="close" size={22} color={theme.primary} />
              </Pressable>
            </View>
            {editingUser && (
              <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={editingUser.name}
                  onChangeText={(text) => setEditingUser({ ...editingUser, name: text })}
                  placeholder="Name"
                />
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={editingUser.email}
                  onChangeText={(text) => setEditingUser({ ...editingUser, email: text })}
                  placeholder="Email"
                />
                <Text style={styles.label}>Campus</Text>
                <View style={styles.pickerContainerModal}>
                  <Picker
                    selectedValue={editingUser.campus}
                    onValueChange={(itemValue) => setEditingUser({ ...editingUser, campus: itemValue })}
                    style={styles.picker}
                  >
                    {campuses.slice(1).map(c => <Picker.Item key={c} label={c} value={c} />)}
                  </Picker>
                </View>
                <Text style={styles.label}>Role</Text>
                <View style={styles.pickerContainerModal}>
                  <Picker
                    selectedValue={editingUser.role}
                    onValueChange={(itemValue) => setEditingUser({ ...editingUser, role: itemValue })}
                    style={styles.picker}
                  >
                    {roles.slice(1).map(r => <Picker.Item key={r} label={r} value={r} />)}
                  </Picker>
                </View>
                {['Faculty Staff', 'Program Head', 'Faculty Dean'].includes(editingUser.role) && (
                  <>
                    <Text style={styles.label}>Faculty</Text>
                    <View style={styles.pickerContainerModal}>
                      <Picker
                          selectedValue={editingUser.faculty}
                          onValueChange={(itemValue) => setEditingUser({ ...editingUser, faculty: itemValue })}
                          style={styles.picker}
                      >
                          {faculties.slice(1).map(f => <Picker.Item key={f} label={f} value={f} />)}
                      </Picker>
                    </View>
                  </>
                )}

                <View style={styles.modalButtonContainer}>
                  <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsEditModalVisible(false)}>
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.modalButton, styles.saveButton]} onPress={handleUpdateUser}>
                    <Text style={styles.modalButtonText}>Save Changes</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.filtersContainer}>
        {/* Campus Filter */}
        <Picker
          selectedValue={selectedCampus}
          onValueChange={(itemValue) => setSelectedCampus(itemValue)}
          style={styles.picker}
        >
          {campuses.map(c => <Picker.Item key={c} label={c} value={c} />)}
        </Picker>

        {/* Role Filter */}
        <Picker
          selectedValue={selectedRole}
          onValueChange={(itemValue) => setSelectedRole(itemValue)}
          style={styles.picker}
        >
          {roles.map(r => <Picker.Item key={r} label={r} value={r} />)}
        </Picker>

        {/* Faculty Filter */}
        <Picker
          selectedValue={selectedFaculty}
          onValueChange={(itemValue) => setSelectedFaculty(itemValue)}
          style={styles.picker}
        >
          {faculties.map(f => <Picker.Item key={f} label={f} value={f} />)}
        </Picker>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={theme.primary} />
      ) : (
        <View style={styles.tableCard}>
          <FlatList
            data={pagedUsers}
            renderItem={renderItem}
            keyExtractor={(item) => item._id}
            ListHeaderComponent={renderHeader}
            ListFooterComponent={renderFooter}
            contentContainerStyle={styles.tableListContent}
            showsVerticalScrollIndicator
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.primary,
    marginBottom: 6,
    marginTop: 12,
  },
  container: {
    flex: 1,
    padding: 0,
  },
  filtersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  tableCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: '#EAECF0',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.10)',
      },
    }),
  },
  tableListContent: {
    paddingBottom: 0,
  },
  paginationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
    backgroundColor: '#FFFFFF',
  },
  paginationInfo: {
    color: '#475467',
    fontSize: 14,
    fontWeight: '500',
  },
  paginationActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  paginationButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
      },
    }),
  },
  paginationButtonDisabled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    ...Platform.select({
      web: {
        cursor: 'not-allowed' as any,
        boxShadow: 'none' as any,
      },
    }),
  },
  paginationButtonText: {
    color: '#344054',
    fontWeight: '600',
    fontSize: 13,
  },
  tableHorizontalScroll: {
    flexGrow: 0,
  },
  tableInner: {
    minWidth: 980,
  },
  picker: {
    flex: 1,
    minWidth: 160,
    height: 44,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerText: {
    fontWeight: '600',
    fontSize: 12,
    color: '#475467',
    textAlign: 'left',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  tableRowAlt: {
    backgroundColor: '#F9FAFB',
  },
  rowText: {
    fontSize: 14,
    color: '#101828',
    fontWeight: '500',
    textAlign: 'left',
  },
  colName: { width: 180, flexGrow: 0, flexShrink: 0, paddingRight: 14 },
  colEmail: { width: 260, flexGrow: 0, flexShrink: 0, paddingRight: 14 },
  colCampus: { width: 150, flexGrow: 0, flexShrink: 0, paddingRight: 14 },
  colRole: { width: 200, flexGrow: 0, flexShrink: 0, paddingRight: 14 },
  colFaculty: { width: 280, flexGrow: 0, flexShrink: 0, paddingRight: 14 },
  colActions: {
    width: 120,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  /** ButtonUtility xs tertiary — transparent, hover bg, slate icon */
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transitionProperty: 'background-color' as any,
        transitionDuration: '120ms' as any,
      },
    }),
  },
  actionButtonText: {
    color: '#667085',
    fontWeight: '600',
    textAlign: 'center',
  },
  editButton: {
    backgroundColor: 'transparent',
  },
  deleteButton: {
    backgroundColor: 'transparent',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(1,26,107,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 28,
    borderWidth: 2,
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 50px rgba(1,26,107,0.15)',
      },
    }),
  },
  modalContentCompact: {
    padding: 20,
    borderRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: theme.border,
    paddingBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
  },
  input: {
    borderWidth: 2,
    borderColor: theme.border,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 15,
    color: theme.primary,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  modalButtonText: {
    color: theme.surface,
    fontWeight: '600',
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: theme.primary,
  },
  cancelButton: {
    backgroundColor: 'rgba(1,26,107,0.35)',
  },
  pickerContainerModal: {
    borderWidth: 2,
    borderColor: theme.border,
    borderRadius: 10,
    marginBottom: 16,
    justifyContent: 'center',
  },
});

export default UserManagement;
