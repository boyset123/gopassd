import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import axios, { isAxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import FormSelect from './FormSelect';

const CONTENT_MAX_WIDTH = 720;

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
  danger: '#dc3545',
};

interface PendingUser {
  _id: string;
  name: string;
  email: string;
  employeeId?: string;
  phone?: string;
  role: string;
  faculty?: string;
  campus: string;
  createdAt: string;
}

interface RoleChangeRequest {
  _id: string;
  user: {
    _id: string;
    name: string;
    email: string;
    employeeId?: string;
  };
  currentRole: string;
  currentFaculty?: string;
  currentExtension: string;
  requestedRole: string;
  requestedFaculty?: string;
  requestedExtension: string;
  createdAt: string;
}

const FACULTY_ROLES = ['Faculty Staff', 'Program Head', 'Faculty Dean'];

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return value;
  }
}

function formatAssignment(role: string, campus: string, faculty?: string) {
  let text = `${role} · ${campus}`;
  if (faculty) text += ` · ${faculty}`;
  return text;
}

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  }
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function CardActions({
  onApprove,
  onReject,
  approveLabel = 'Approve',
  loading,
}: {
  onApprove: () => void;
  onReject: () => void;
  approveLabel?: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.cardActions}>
      <Pressable style={styles.rejectBtn} onPress={onReject} disabled={loading}>
        <Text style={styles.rejectBtnText}>Reject</Text>
      </Pressable>
      <Pressable style={[styles.approveBtn, loading && styles.btnDisabled]} onPress={onApprove} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.approveBtnText}>{approveLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

function SectionBlock({
  title,
  count,
  description,
  emptyMessage,
  children,
}: {
  title: string;
  count: number;
  description: string;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      <Text style={styles.sectionDescription}>{description}</Text>
      {count === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        <View style={styles.cardList}>{children}</View>
      )}
    </View>
  );
}

const HrpUserApprovals: React.FC = () => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [roleRequests, setRoleRequests] = useState<RoleChangeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [faculties, setFaculties] = useState<string[]>([]);
  const [extensions, setExtensions] = useState<string[]>([]);

  const [approveUser, setApproveUser] = useState<PendingUser | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editFaculty, setEditFaculty] = useState('');
  const [editCampus, setEditCampus] = useState('');
  const [rejectUser, setRejectUser] = useState<PendingUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectRequest, setRejectRequest] = useState<RoleChangeRequest | null>(null);
  const [rejectRequestNote, setRejectRequestNote] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const [pendingRes, requestsRes, rolesRes, facultiesRes, extensionsRes] = await Promise.all([
        axios.get<PendingUser[]>(`${API_URL}/hr/users/pending-registrations`, { headers }),
        axios.get<RoleChangeRequest[]>(`${API_URL}/hr/users/role-change-requests`, { headers }),
        axios.get<string[]>(`${API_URL}/metadata/roles`),
        axios.get<string[]>(`${API_URL}/metadata/faculties`),
        axios.get<string[]>(`${API_URL}/metadata/extensions`),
      ]);
      setPendingUsers(pendingRes.data);
      setRoleRequests(requestsRes.data);
      setRoles(rolesRes.data);
      setFaculties(facultiesRes.data);
      setExtensions(extensionsRes.data);
    } catch (error) {
      console.error('Failed to load user approvals:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openApproveModal = (user: PendingUser) => {
    setApproveUser(user);
    setEditRole(user.role);
    setEditFaculty(user.faculty || faculties[0] || '');
    setEditCampus(user.campus);
  };

  const getErrorMessage = (error: unknown, fallback: string) =>
    isAxiosError(error) ? (error.response?.data?.message as string) || fallback : fallback;

  const handleApproveUser = async () => {
    if (!approveUser) return;
    setIsActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(
        `${API_URL}/hr/users/pending-registrations/${approveUser._id}/approve`,
        {
          role: editRole,
          faculty: FACULTY_ROLES.includes(editRole) ? editFaculty : undefined,
          campus: editCampus,
        },
        { headers: { 'x-auth-token': token } }
      );
      setApproveUser(null);
      loadData();
      showMessage('Success', `${approveUser.name} has been approved.`);
    } catch (error: unknown) {
      showMessage('Error', getErrorMessage(error, 'Approval failed.'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRejectUser = async () => {
    if (!rejectUser) return;
    setIsActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(
        `${API_URL}/hr/users/pending-registrations/${rejectUser._id}/reject`,
        { reason: rejectReason.trim() || 'Registration not approved.' },
        { headers: { 'x-auth-token': token } }
      );
      setRejectUser(null);
      setRejectReason('');
      loadData();
      showMessage('Done', 'Registration rejected.');
    } catch (error: unknown) {
      showMessage('Error', getErrorMessage(error, 'Rejection failed.'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleApproveRoleChange = async (request: RoleChangeRequest) => {
    setIsActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_URL}/hr/users/role-change-requests/${request._id}/approve`, {}, { headers: { 'x-auth-token': token } });
      loadData();
      showMessage('Success', 'Role change approved.');
    } catch (error: unknown) {
      showMessage('Error', getErrorMessage(error, 'Approval failed.'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRejectRoleChange = async () => {
    if (!rejectRequest) return;
    setIsActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(
        `${API_URL}/hr/users/role-change-requests/${rejectRequest._id}/reject`,
        { reviewNote: rejectRequestNote.trim() || 'Role change not approved.' },
        { headers: { 'x-auth-token': token } }
      );
      setRejectRequest(null);
      setRejectRequestNote('');
      loadData();
      showMessage('Done', 'Role change rejected.');
    } catch (error: unknown) {
      showMessage('Error', getErrorMessage(error, 'Rejection failed.'));
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.contentColumn}>
        <SectionBlock
          title="Pending registrations"
          count={pendingUsers.length}
          description="New accounts waiting for HR approval."
          emptyMessage="No registrations pending."
        >
          {pendingUsers.map((user) => (
            <View key={user._id} style={styles.approvalCard}>
              <View style={styles.cardTopBar} />
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderMain}>
                  <Text style={styles.cardName}>{user.name}</Text>
                  <Text style={styles.cardEmail}>{user.email}</Text>
                </View>
                <Text style={styles.cardDate}>{formatDate(user.createdAt)}</Text>
              </View>
              <View style={styles.detailGrid}>
                <DetailItem label="Employee ID" value={user.employeeId || '—'} />
                <DetailItem label="Phone" value={user.phone || '—'} />
                <DetailItem label="Role" value={user.role} />
                <DetailItem label="Campus" value={user.campus} />
                {user.faculty ? <DetailItem label="Faculty" value={user.faculty} /> : null}
              </View>
              <CardActions
                onReject={() => setRejectUser(user)}
                onApprove={() => openApproveModal(user)}
                approveLabel="Review & approve"
              />
            </View>
          ))}
        </SectionBlock>

        <SectionBlock
          title="Role change requests"
          count={roleRequests.length}
          description="Staff requests to update role or assignment."
          emptyMessage="No role changes pending."
        >
          {roleRequests.map((req) => (
            <View key={req._id} style={styles.approvalCard}>
              <View style={styles.cardTopBar} />
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderMain}>
                  <Text style={styles.cardName}>{req.user?.name || 'Unknown user'}</Text>
                  <Text style={styles.cardEmail}>{req.user?.email}</Text>
                </View>
                <Text style={styles.cardDate}>{formatDate(req.createdAt)}</Text>
              </View>
              <View style={styles.changeBlock}>
                <View style={styles.changeLine}>
                  <Text style={styles.changeLabel}>From</Text>
                  <Text style={styles.changeValue}>
                    {formatAssignment(req.currentRole, req.currentExtension, req.currentFaculty)}
                  </Text>
                </View>
                <View style={styles.changeDivider} />
                <View style={styles.changeLine}>
                  <Text style={styles.changeLabel}>To</Text>
                  <Text style={styles.changeValue}>
                    {formatAssignment(req.requestedRole, req.requestedExtension, req.requestedFaculty)}
                  </Text>
                </View>
              </View>
              <CardActions
                onReject={() => setRejectRequest(req)}
                onApprove={() => handleApproveRoleChange(req)}
                loading={isActionLoading}
              />
            </View>
          ))}
        </SectionBlock>
      </View>

      <Modal visible={!!approveUser} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Approve registration</Text>
              <Pressable onPress={() => setApproveUser(null)} hitSlop={8}>
                <FontAwesome name="times" size={20} color={theme.primary} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>{approveUser?.name}</Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <FormSelect label="Role" value={editRole} options={roles} onChange={setEditRole} />
              <FormSelect label="Campus / Extension" value={editCampus} options={extensions} onChange={setEditCampus} />
              {FACULTY_ROLES.includes(editRole) && (
                <FormSelect label="Faculty" value={editFaculty} options={faculties} onChange={setEditFaculty} />
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setApproveUser(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalConfirm, isActionLoading && styles.btnDisabled]} onPress={handleApproveUser} disabled={isActionLoading}>
                <Text style={styles.modalConfirmText}>{isActionLoading ? 'Saving…' : 'Confirm approval'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!rejectUser} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject registration</Text>
              <Pressable onPress={() => setRejectUser(null)} hitSlop={8}>
                <FontAwesome name="times" size={20} color={theme.primary} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>{rejectUser?.name}</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason (optional)"
              placeholderTextColor={theme.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setRejectUser(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalConfirmDanger, isActionLoading && styles.btnDisabled]} onPress={handleRejectUser} disabled={isActionLoading}>
                <Text style={styles.modalConfirmText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!rejectRequest} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject role change</Text>
              <Pressable onPress={() => setRejectRequest(null)} hitSlop={8}>
                <FontAwesome name="times" size={20} color={theme.primary} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>{rejectRequest?.user?.name}</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason (optional)"
              placeholderTextColor={theme.textMuted}
              value={rejectRequestNote}
              onChangeText={setRejectRequestNote}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setRejectRequest(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalConfirmDanger, isActionLoading && styles.btnDisabled]} onPress={handleRejectRoleChange} disabled={isActionLoading}>
                <Text style={styles.modalConfirmText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    width: '100%',
    alignItems: 'flex-start',
    paddingBottom: 32,
  },
  contentColumn: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    gap: 36,
  },
  loadingWrap: { padding: 48, alignItems: 'center', width: '100%' },
  section: { gap: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.primary,
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textMuted,
  },
  sectionDescription: {
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 20,
    marginBottom: 4,
  },
  cardList: { gap: 14 },
  approvalCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(16,24,40,0.08)' },
    }),
  },
  cardTopBar: {
    height: 3,
    backgroundColor: theme.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardHeaderMain: { flex: 1, minWidth: 0 },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 2,
  },
  cardEmail: {
    fontSize: 13,
    color: theme.textMuted,
  },
  cardDate: {
    fontSize: 12,
    color: theme.textMuted,
    flexShrink: 0,
    paddingTop: 2,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 12,
  },
  detailItem: {
    width: '47%' as any,
    minWidth: 140,
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.primary,
    lineHeight: 20,
  },
  changeBlock: {
    marginHorizontal: 20,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  changeLine: { gap: 4 },
  changeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  changeValue: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.primary,
    lineHeight: 20,
  },
  changeDivider: {
    height: 1,
    backgroundColor: '#EAECF0',
    marginVertical: 10,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
    marginTop: 8,
  },
  approveBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.primary,
    minWidth: 120,
    alignItems: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  approveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  rejectBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: theme.surface,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  rejectBtnText: { color: '#344054', fontWeight: '600', fontSize: 13 },
  emptyCard: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(1,26,107,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    borderWidth: 2,
    borderTopWidth: 4,
    borderColor: theme.border,
    borderTopColor: theme.accent,
    ...Platform.select({ web: { boxShadow: '0 20px 50px rgba(1,26,107,0.15)' } }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalScroll: { maxHeight: 280, marginTop: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.primary },
  modalSubtitle: { fontSize: 14, color: theme.textMuted, marginBottom: 12 },
  reasonInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    marginBottom: 8,
    textAlignVertical: 'top',
    color: theme.primary,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  modalCancelText: { color: theme.textMuted, fontWeight: '600' },
  modalConfirm: {
    backgroundColor: theme.primary,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  modalConfirmDanger: {
    backgroundColor: theme.danger,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  modalConfirmText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

export default HrpUserApprovals;
