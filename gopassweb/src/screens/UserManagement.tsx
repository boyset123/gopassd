import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import axios, { isAxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import FormSelect from '../components/FormSelect';
import { formatRoleLabel, rolesToSelectOptions } from '../utils/roleLabels';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
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

function getApiErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error) && error.response?.data?.message) {
    return error.response.data.message as string;
  }
  return fallback;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
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

function RolePill({ role }: { role: string }) {
  const isAdmin = role === 'admin';
  return (
    <View style={[styles.rolePill, isAdmin && styles.rolePillAdmin]}>
      <Text style={[styles.rolePillText, isAdmin && styles.rolePillTextAdmin]} numberOfLines={1}>
        {formatRoleLabel(role)}
      </Text>
    </View>
  );
}

const UserManagement = () => {
  const { isCompact, isNarrow } = useResponsiveLayout();
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
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type: 'success' | 'error';
    message: string;
  }>({ visible: false, type: 'success', message: '' });

  const hasActiveFilters =
    selectedCampus !== 'All Campuses' ||
    selectedRole !== 'All Roles' ||
    selectedFaculty !== 'All Faculties';

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

  const statusCounts = useMemo(() => {
    const counts = { active: 0, pending: 0, rejected: 0 };
    users.forEach((user) => {
      const status = (user.accountStatus || 'active').toLowerCase();
      if (status === 'pending') counts.pending += 1;
      else if (status === 'rejected') counts.rejected += 1;
      else counts.active += 1;
    });
    return counts;
  }, [users]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pagedUsers = users.slice(startIndex, startIndex + PAGE_SIZE);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedbackModal({ visible: true, type, message });
  };

  const clearFilters = () => {
    setSelectedCampus('All Campuses');
    setSelectedRole('All Roles');
    setSelectedFaculty('All Faculties');
  };

  const openEditModal = (user: User) => {
    setEditingUser(JSON.parse(JSON.stringify(user)));
    setIsEditModalVisible(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_URL}/admin/users/${editingUser._id}`, editingUser, {
        headers: { 'x-auth-token': token },
      });
      setIsEditModalVisible(false);
      showFeedback('success', 'User updated successfully.');
      fetchUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
      showFeedback('error', getApiErrorMessage(error, 'Failed to update user.'));
    } finally {
      setIsSaving(false);
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
      showFeedback('success', 'User deleted successfully.');
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      showFeedback('error', getApiErrorMessage(error, 'Failed to delete user.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const renderUserActions = (item: User, compact?: boolean) => {
    if (item.role === 'admin') {
      return (
        <View style={[styles.protectedWrap, compact && styles.protectedWrapCompact]}>
          <FontAwesome name="lock" size={12} color={theme.textMuted} />
          <Text style={styles.protectedLabel}>Protected</Text>
        </View>
      );
    }
    return (
      <View style={styles.actionGroup}>
        <Pressable
          style={({ pressed }) => [styles.editIconBtn, pressed && styles.iconBtnPressed]}
          onPress={() => openEditModal(item)}
          accessibilityLabel="Edit user"
        >
          <FontAwesome name="pencil" size={14} color={theme.primary} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.deleteIconBtn, pressed && styles.deleteIconBtnPressed]}
          onPress={() => setDeleteTarget(item)}
          accessibilityLabel="Delete user"
        >
          <FontAwesome name="trash-o" size={14} color={theme.danger} />
        </Pressable>
      </View>
    );
  };

  const renderUserCard = (item: User) => (
    <View key={item._id} style={styles.userCard}>
      <View style={styles.userCardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.userCardInfo}>
          <Text style={styles.userCardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.userCardEmail} numberOfLines={1}>
            {item.email}
          </Text>
        </View>
        <StatusBadge status={item.accountStatus || 'active'} />
      </View>
      <View style={styles.userCardMeta}>
        <View style={styles.metaItem}>
          <FontAwesome name="id-badge" size={12} color={theme.textMuted} />
          <Text style={styles.metaText}>{item.employeeId || '—'}</Text>
        </View>
        <View style={styles.metaItem}>
          <FontAwesome name="phone" size={12} color={theme.textMuted} />
          <Text style={styles.metaText}>{item.phone || '—'}</Text>
        </View>
      </View>
      <View style={styles.userCardTags}>
        <RolePill role={item.role} />
        <View style={styles.campusTag}>
          <FontAwesome name="map-marker" size={11} color={theme.primary} />
          <Text style={styles.campusTagText} numberOfLines={1}>
            {item.campus}
          </Text>
        </View>
      </View>
      {item.faculty ? (
        <Text style={styles.facultyLine} numberOfLines={2}>
          {item.faculty}
        </Text>
      ) : null}
      <View style={styles.userCardActions}>{renderUserActions(item, true)}</View>
    </View>
  );

  const renderTableRow = (item: User, index: number) => (
    <View key={item._id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
      <View style={[styles.colUser, styles.colUserCell]}>
        <View style={styles.avatarSmall}>
          <Text style={styles.avatarSmallText}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.userCellText}>
          <Text numberOfLines={1} style={styles.cellName}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={styles.cellEmail}>
            {item.email}
          </Text>
        </View>
      </View>
      <Text numberOfLines={1} style={[styles.cellText, styles.colId]}>
        {item.employeeId || '—'}
      </Text>
      <Text numberOfLines={1} style={[styles.cellText, styles.colPhone]}>
        {item.phone || '—'}
      </Text>
      <View style={styles.colStatus}>
        <StatusBadge status={item.accountStatus || 'active'} />
      </View>
      <Text numberOfLines={1} style={[styles.cellText, styles.colCampus]}>
        {item.campus}
      </Text>
      <View style={styles.colRole}>
        <RolePill role={item.role} />
      </View>
      <Text numberOfLines={1} style={[styles.cellText, styles.colFaculty]}>
        {item.faculty || '—'}
      </Text>
      <View style={styles.colActions}>{renderUserActions(item)}</View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.pageDescription}>
        View, filter, edit, and remove user accounts. Admin accounts are protected and cannot be
        modified from this screen.
      </Text>

      <View style={styles.filterCard}>
        <View style={styles.filterCardAccent} />
        <View style={styles.filterHeader}>
          <View style={styles.filterHeaderLeft}>
            <View style={styles.filterIconWrap}>
              <FontAwesome name="filter" size={14} color={theme.primary} />
            </View>
            <View>
              <Text style={styles.filterTitle}>Filter users</Text>
              <Text style={styles.filterSubtitle}>Narrow by campus, role, or faculty</Text>
            </View>
          </View>
          {hasActiveFilters && (
            <Pressable style={styles.clearFiltersBtn} onPress={clearFilters}>
              <FontAwesome name="times-circle" size={14} color={theme.primary} />
              <Text style={styles.clearFiltersText}>Clear</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.filtersRow, isCompact && styles.filtersRowCompact]}>
          <FormSelect
            label="Campus"
            value={selectedCampus}
            options={extensions}
            onChange={setSelectedCampus}
            style={styles.filterSelect}
          />
          <FormSelect
            label="Role"
            value={selectedRole}
            options={rolesToSelectOptions(roles)}
            onChange={setSelectedRole}
            style={styles.filterSelect}
          />
          <FormSelect
            label="Faculty"
            value={selectedFaculty}
            options={faculties}
            onChange={setSelectedFaculty}
            style={styles.filterSelect}
          />
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{users.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statChip, styles.statChipActive]}>
          <Text style={[styles.statValue, styles.statValueActive]}>{statusCounts.active}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statChip, styles.statChipPending]}>
          <Text style={[styles.statValue, styles.statValuePending]}>{statusCounts.pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={[styles.statChip, styles.statChipRejected]}>
          <Text style={[styles.statValue, styles.statValueRejected]}>{statusCounts.rejected}</Text>
          <Text style={styles.statLabel}>Rejected</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading users…</Text>
        </View>
      ) : (
        <View style={styles.tableCard}>
          <View style={styles.tableTopBar} />

          <View style={styles.listToolbar}>
            <Text style={styles.listToolbarTitle}>User directory</Text>
            <Text style={styles.listToolbarCount}>
              {users.length} {users.length === 1 ? 'user' : 'users'}
              {hasActiveFilters ? ' (filtered)' : ''}
            </Text>
          </View>

          {pagedUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <FontAwesome name="users" size={28} color={theme.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No users found</Text>
              <Text style={styles.emptyHint}>
                {hasActiveFilters
                  ? 'Try adjusting your filters or clear them to see all users.'
                  : 'Registered users will appear here once accounts are created.'}
              </Text>
              {hasActiveFilters && (
                <Pressable style={styles.emptyActionBtn} onPress={clearFilters}>
                  <Text style={styles.emptyActionBtnText}>Clear filters</Text>
                </Pressable>
              )}
            </View>
          ) : isCompact ? (
            <ScrollView style={styles.cardListScroll} nestedScrollEnabled>
              {pagedUsers.map((item) => renderUserCard(item))}
            </ScrollView>
          ) : (
            <ScrollView
              horizontal={isNarrow}
              showsHorizontalScrollIndicator={isNarrow}
              style={styles.tableHScroll}
            >
              <View style={[styles.tableInner, !isNarrow && styles.tableInnerFull]}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.headerText, styles.colUser]}>User</Text>
                  <Text style={[styles.headerText, styles.colId]}>Employee ID</Text>
                  <Text style={[styles.headerText, styles.colPhone]}>Phone</Text>
                  <Text style={[styles.headerText, styles.colStatus]}>Status</Text>
                  <Text style={[styles.headerText, styles.colCampus]}>Campus</Text>
                  <Text style={[styles.headerText, styles.colRole]}>Role</Text>
                  <Text style={[styles.headerText, styles.colFaculty]}>Faculty</Text>
                  <Text style={[styles.headerText, styles.colActions]}>Actions</Text>
                </View>
                {pagedUsers.map((item, index) => renderTableRow(item, index))}
              </View>
            </ScrollView>
          )}

          {pagedUsers.length > 0 && (
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
                  <FontAwesome name="chevron-left" size={12} color="#344054" />
                  <Text style={styles.pageBtnText}>Previous</Text>
                </Pressable>
                <Pressable
                  style={[styles.pageBtn, safePage >= totalPages && styles.pageBtnDisabled]}
                  disabled={safePage >= totalPages}
                  onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <Text style={styles.pageBtnText}>Next</Text>
                  <FontAwesome name="chevron-right" size={12} color="#344054" />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit user</Text>
              <Pressable onPress={() => setIsEditModalVisible(false)} hitSlop={8}>
                <FontAwesome name="times" size={20} color={theme.primary} />
              </Pressable>
            </View>
            {editingUser && (
              <>
                <View style={styles.editUserBanner}>
                  <View style={styles.avatarLarge}>
                    <Text style={styles.avatarLargeText}>{getInitials(editingUser.name)}</Text>
                  </View>
                  <View style={styles.editUserBannerInfo}>
                    <Text style={styles.editUserBannerName} numberOfLines={1}>
                      {editingUser.name}
                    </Text>
                    <Text style={styles.editUserBannerEmail} numberOfLines={1}>
                      {editingUser.email}
                    </Text>
                    <StatusBadge status={editingUser.accountStatus || 'active'} />
                  </View>
                </View>
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.sectionLabel}>Profile</Text>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    style={styles.input}
                    value={editingUser.name}
                    onChangeText={(text) => setEditingUser({ ...editingUser, name: text })}
                    placeholder="Full name"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={editingUser.email}
                    onChangeText={(text) => setEditingUser({ ...editingUser, email: text })}
                    placeholder="Email address"
                    autoCapitalize="none"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={styles.fieldLabel}>Employee ID</Text>
                  <TextInput
                    style={styles.input}
                    value={editingUser.employeeId || ''}
                    onChangeText={(text) => setEditingUser({ ...editingUser, employeeId: text })}
                    placeholder="Employee ID"
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={styles.fieldLabel}>Phone</Text>
                  <TextInput
                    style={styles.input}
                    value={editingUser.phone || ''}
                    onChangeText={(text) => setEditingUser({ ...editingUser, phone: text })}
                    placeholder="Phone number"
                    keyboardType="phone-pad"
                    placeholderTextColor={theme.textMuted}
                  />

                  <Text style={styles.sectionLabel}>Assignment</Text>
                  <FormSelect
                    label="Campus / Extension"
                    value={editingUser.campus}
                    options={extensions.slice(1)}
                    onChange={(campus) => setEditingUser({ ...editingUser, campus })}
                  />
                  <FormSelect
                    label="Role"
                    value={editingUser.role}
                    options={rolesToSelectOptions(roles.slice(1))}
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
                </ScrollView>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancel} onPress={() => setIsEditModalVisible(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalSave, isSaving && styles.btnDisabled]}
                    onPress={handleUpdateUser}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalSaveText}>Save changes</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => !isDeleting && setDeleteTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.deleteModal]}>
            <View style={styles.deleteModalIconWrap}>
              <FontAwesome name="exclamation-triangle" size={32} color={theme.danger} />
            </View>
            <Text style={styles.modalTitle}>Delete user?</Text>
            <Text style={styles.deleteMessage}>
              You are about to permanently remove{' '}
              <Text style={styles.deleteName}>{deleteTarget?.name}</Text> ({deleteTarget?.email}).
              This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDelete, isDeleting && styles.btnDisabled]}
                onPress={handleDeleteUser}
                disabled={isDeleting}
              >
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

      <Modal
        visible={feedbackModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackModal((f) => ({ ...f, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.feedbackModal}>
            <FontAwesome
              name={feedbackModal.type === 'success' ? 'check-circle' : 'exclamation-circle'}
              size={40}
              color={feedbackModal.type === 'success' ? theme.success : theme.danger}
            />
            <Text style={styles.feedbackMessage}>{feedbackModal.message}</Text>
            <Pressable
              style={styles.modalSave}
              onPress={() => setFeedbackModal((f) => ({ ...f, visible: false }))}
            >
              <Text style={styles.modalSaveText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 16 },
  pageDescription: {
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 21,
    maxWidth: 720,
  },
  filterCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: '#EAECF0',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({ web: { boxShadow: '0 1px 3px rgba(16,24,40,0.08)' } }),
  },
  filterCardAccent: {
    height: 3,
    backgroundColor: theme.accent,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 12,
    flexWrap: 'wrap',
  },
  filterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  filterIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(254,206,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primary,
  },
  filterSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 1,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#FAFBFC',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  clearFiltersText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 20,
    paddingTop: 12,
  },
  filtersRowCompact: {
    flexDirection: 'column',
  },
  filterSelect: {
    flex: 1,
    minWidth: 160,
    maxWidth: 240,
    marginBottom: 0,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statChip: {
    flex: 1,
    minWidth: 72,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EAECF0',
    backgroundColor: '#FAFBFC',
    alignItems: 'center',
  },
  statChipActive: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  statChipPending: {
    backgroundColor: 'rgba(254,206,0,0.2)',
    borderColor: 'rgba(254,206,0,0.45)',
  },
  statChipRejected: {
    backgroundColor: 'rgba(220,53,69,0.08)',
    borderColor: 'rgba(220,53,69,0.2)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
  },
  statValueActive: { color: '#15803d' },
  statValuePending: { color: '#92400e' },
  statValueRejected: { color: '#b42318' },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: theme.textMuted,
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
        display: 'flex' as const,
        flexDirection: 'column' as const,
      },
    }),
  },
  tableTopBar: {
    height: 3,
    backgroundColor: theme.accent,
  },
  listToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    flexWrap: 'wrap',
    gap: 8,
  },
  listToolbarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primary,
  },
  listToolbarCount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475467',
  },
  tableHScroll: {
    width: '100%',
    ...Platform.select({
      web: {
        maxWidth: '100%' as const,
      },
    }),
  },
  tableInner: {
    minWidth: 960,
  },
  tableInnerFull: {
    width: '100%',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
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
  cellName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
  },
  cellEmail: {
    fontSize: 12,
    color: '#667085',
    marginTop: 2,
  },
  colUser: { flex: 2.2, minWidth: 200, paddingRight: 12 },
  colUserCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colId: { width: 100, paddingRight: 12, flexShrink: 0 },
  colPhone: { width: 110, paddingRight: 12, flexShrink: 0 },
  colStatus: { width: 90, paddingRight: 12, flexShrink: 0 },
  colCampus: { flex: 1, minWidth: 110, paddingRight: 12 },
  colRole: { flex: 1.2, minWidth: 130, paddingRight: 12 },
  colFaculty: { flex: 1.5, minWidth: 150, paddingRight: 12 },
  colActions: {
    width: 88,
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  avatarSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(254,206,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarSmallText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.primary,
  },
  userCellText: {
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(254,206,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
  },
  avatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(254,206,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarLargeText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.primary,
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
  statusActive: { backgroundColor: 'rgba(34,197,94,0.12)' },
  statusPending: { backgroundColor: 'rgba(254,206,0,0.35)' },
  statusRejected: { backgroundColor: 'rgba(220,53,69,0.12)' },
  rolePill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(1,26,107,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.1)',
  },
  rolePillAdmin: {
    backgroundColor: 'rgba(254,206,0,0.35)',
    borderColor: 'rgba(254,206,0,0.6)',
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.primary,
  },
  rolePillTextAdmin: {
    fontWeight: '700',
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  editIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.15)',
    backgroundColor: 'rgba(1,26,107,0.04)',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  deleteIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(220,53,69,0.25)',
    backgroundColor: 'rgba(220,53,69,0.06)',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  iconBtnPressed: {
    backgroundColor: 'rgba(1,26,107,0.1)',
  },
  deleteIconBtnPressed: {
    backgroundColor: 'rgba(220,53,69,0.14)',
  },
  protectedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  protectedWrapCompact: {
    justifyContent: 'flex-end',
  },
  protectedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  cardListScroll: {
    maxHeight: 520,
    padding: 12,
    gap: 12,
  },
  userCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EAECF0',
    backgroundColor: '#FFFFFF',
    ...Platform.select({ web: { boxShadow: '0 1px 2px rgba(16,24,40,0.05)' } }),
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  userCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  userCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101828',
  },
  userCardEmail: {
    fontSize: 13,
    color: '#667085',
    marginTop: 2,
  },
  userCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#475467',
    fontWeight: '500',
  },
  userCardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  campusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  campusTagText: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: '500',
    flexShrink: 1,
  },
  facultyLine: {
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: 10,
    lineHeight: 18,
  },
  userCardActions: {
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
    paddingTop: 12,
    alignItems: 'flex-end',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  emptyActionBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.accent,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  emptyActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  deleteModal: {
    maxWidth: 440,
    alignItems: 'stretch',
  },
  deleteModalIconWrap: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(220,53,69,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  editUserBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: '#FAFBFC',
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  editUserBannerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  editUserBannerName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.primary,
  },
  editUserBannerEmail: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 4,
  },
  modalScroll: { maxHeight: 360 },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.primary,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 4,
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
    borderColor: '#D0D5DD',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: theme.primary,
    marginBottom: 4,
    backgroundColor: '#fff',
    ...Platform.select({ web: { outlineStyle: 'none' as const } }),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
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
    minWidth: 100,
    alignItems: 'center',
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
    marginTop: 12,
    textAlign: 'center',
  },
  deleteName: {
    fontWeight: '700',
    color: theme.primary,
  },
  btnDisabled: { opacity: 0.65 },
  feedbackModal: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: theme.border,
    borderTopColor: theme.accent,
    ...Platform.select({ web: { boxShadow: '0 16px 40px rgba(1,26,107,0.12)' } }),
  },
  feedbackMessage: {
    fontSize: 15,
    color: theme.primary,
    textAlign: 'center',
    marginVertical: 16,
    lineHeight: 22,
  },
});

export default UserManagement;
