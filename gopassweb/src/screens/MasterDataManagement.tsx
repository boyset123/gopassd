import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.22)',
  danger: '#dc3545',
  success: '#22c55e',
};

interface MetadataItem {
  _id: string;
  name: string;
  active: boolean;
  isSystem?: boolean;
  isMainCampus?: boolean;
}

type SectionKey = 'roles' | 'faculties' | 'extensions';

const SECTIONS: {
  key: SectionKey;
  label: string;
  shortLabel: string;
  endpoint: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  addPlaceholder: string;
  emptyTitle: string;
  emptyHint: string;
}[] = [
  {
    key: 'roles',
    label: 'Roles',
    shortLabel: 'Roles',
    endpoint: 'roles',
    icon: 'id-badge',
    addPlaceholder: 'e.g. Office Staff',
    emptyTitle: 'No roles yet',
    emptyHint: 'Add a role above to make it available during user registration.',
  },
  {
    key: 'faculties',
    label: 'Faculties/Office',
    shortLabel: 'Faculties/Office',
    endpoint: 'faculties',
    icon: 'graduation-cap',
    addPlaceholder: 'e.g. Faculty of Teacher Education',
    emptyTitle: 'No faculties yet',
    emptyHint: 'Add faculty departments used when assigning faculty-related roles.',
  },
  {
    key: 'extensions',
    label: 'Campuses',
    shortLabel: 'Campuses',
    endpoint: 'extensions',
    icon: 'map-marker',
    addPlaceholder: 'e.g. Main Campus',
    emptyTitle: 'No campuses yet',
    emptyHint: 'Add campus or extension locations for user assignments.',
  },
];

const MasterDataManagement = () => {
  const { isCompact } = useResponsiveLayout();
  const [activeSection, setActiveSection] = useState<SectionKey>('roles');
  const [items, setItems] = useState<MetadataItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [isMainCampus, setIsMainCampus] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'error'>('success');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MetadataItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sectionConfig = SECTIONS.find((s) => s.key === activeSection)!;

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(`${API_URL}/metadata/admin/${sectionConfig.endpoint}`, {
        headers: { 'x-auth-token': token },
      });
      setItems(response.data);
    } catch (error) {
      console.error('Failed to fetch metadata:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sectionConfig.endpoint]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const showModal = (message: string, type: 'success' | 'error') => {
    setModalMessage(message);
    setModalType(type);
    setModalVisible(true);
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) {
      showModal('Please enter a name.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const body: Record<string, unknown> = { name };
      if (activeSection === 'extensions') {
        body.isMainCampus = isMainCampus;
      }
      await axios.post(`${API_URL}/metadata/admin/${sectionConfig.endpoint}`, body, {
        headers: { 'x-auth-token': token },
      });
      setNewName('');
      setIsMainCampus(false);
      showModal(`${sectionSingularTitle} added successfully.`, 'success');
      fetchItems();
    } catch (error: unknown) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || 'Failed to add item.'
        : 'Failed to add item.';
      showModal(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.isSystem) {
      showModal('System roles cannot be deleted.', 'error');
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.delete(
        `${API_URL}/metadata/admin/${sectionConfig.endpoint}/${deleteTarget._id}`,
        { headers: { 'x-auth-token': token } }
      );
      setDeleteTarget(null);
      showModal(`${sectionSingularTitle} deleted successfully.`, 'success');
      fetchItems();
    } catch (error: unknown) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || 'Failed to delete item.'
        : 'Failed to delete item.';
      setDeleteTarget(null);
      showModal(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const sectionSingular =
    activeSection === 'roles' ? 'role' : activeSection === 'faculties' ? 'faculty' : 'campus';
  const sectionSingularTitle =
    sectionSingular.charAt(0).toUpperCase() + sectionSingular.slice(1);

  const customCount = items.filter((item) => !item.isSystem).length;
  const systemCount = items.filter((item) => item.isSystem).length;

  return (
    <View style={styles.container}>
      <Text style={styles.pageDescription}>
        Manage roles, faculty departments, and campuses shown when registering users or updating
        assignments. Items in use cannot be deleted until users are reassigned.
      </Text>

      <View style={[styles.tabRow, isCompact && styles.tabRowCompact]}>
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.key;
          return (
            <Pressable
              key={section.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveSection(section.key)}
            >
              <FontAwesome
                name={section.icon}
                size={15}
                color={isActive ? theme.primary : 'rgba(1,26,107,0.55)'}
              />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {isCompact ? section.shortLabel : section.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.card}>
        <View style={styles.cardAccent} />

        <View style={styles.addPanel}>
          <View style={styles.addPanelHeader}>
            <View style={styles.addPanelIconWrap}>
              <FontAwesome name={sectionConfig.icon} size={16} color={theme.primary} />
            </View>
            <View style={styles.addPanelTitles}>
              <Text style={styles.addPanelTitle}>Add new {sectionSingular}</Text>
              <Text style={styles.addPanelSubtitle}>
                {activeSection === 'extensions'
                  ? 'Campus or extension location'
                  : `Available in registration and user management`}
              </Text>
            </View>
          </View>

          <View style={[styles.addRow, isCompact && styles.addRowCompact]}>
            <TextInput
              style={[styles.input, isCompact && styles.inputFull]}
              placeholder={sectionConfig.addPlaceholder}
              value={newName}
              onChangeText={setNewName}
              placeholderTextColor={theme.textMuted}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            {activeSection === 'extensions' && (
              <Pressable
                style={[styles.mainCampusToggle, isMainCampus && styles.mainCampusToggleOn]}
                onPress={() => setIsMainCampus(!isMainCampus)}
              >
                <FontAwesome
                  name={isMainCampus ? 'check-circle' : 'circle-o'}
                  size={18}
                  color={isMainCampus ? theme.primary : theme.textMuted}
                />
                <Text style={[styles.mainCampusLabel, isMainCampus && styles.mainCampusLabelOn]}>
                  Main campus
                </Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.addButton, isSaving && styles.buttonDisabled]}
              onPress={handleAdd}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <>
                  <FontAwesome name="plus" size={13} color={theme.primary} />
                  <Text style={styles.addButtonText}>Add</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.listToolbar}>
          <Text style={styles.listToolbarTitle}>{sectionConfig.label}</Text>
          <Text style={styles.listToolbarCount}>
            {items.length} total
            {systemCount > 0 ? ` · ${systemCount} system` : ''}
            {customCount > 0 && systemCount > 0 ? ` · ${customCount} custom` : ''}
          </Text>
        </View>

        <View style={[styles.listHeader, isCompact && styles.listHeaderHidden]}>
          <Text style={[styles.headerText, styles.colName]}>Name</Text>
          <Text style={[styles.headerText, styles.colTags]}>Tags</Text>
          <Text style={[styles.headerText, styles.colActions]}>Actions</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.loadingText}>Loading {sectionConfig.label.toLowerCase()}…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <FontAwesome name={sectionConfig.icon} size={28} color={theme.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{sectionConfig.emptyTitle}</Text>
            <Text style={styles.emptyHint}>{sectionConfig.emptyHint}</Text>
          </View>
        ) : (
          <ScrollView style={styles.listScroll} nestedScrollEnabled>
            {items.map((item, index) => (
              <View
                key={item._id}
                style={[styles.listItem, index % 2 === 1 && styles.listItemAlt]}
              >
                <View style={styles.colName}>
                  <View style={styles.itemLeading}>
                    <View
                      style={[
                        styles.itemIconWrap,
                        item.isSystem && styles.itemIconWrapSystem,
                      ]}
                    >
                      <FontAwesome
                        name={item.isSystem ? 'lock' : sectionConfig.icon}
                        size={14}
                        color={item.isSystem ? theme.primary : theme.primary}
                      />
                    </View>
                    <Text style={styles.listItemName} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                </View>

                <View style={styles.colTags}>
                  <View style={styles.badges}>
                    {item.isSystem && (
                      <View style={styles.badgeSystem}>
                        <Text style={styles.badgeSystemText}>System</Text>
                      </View>
                    )}
                    {item.isMainCampus && (
                      <View style={styles.badgeMain}>
                        <Text style={styles.badgeMainText}>Main</Text>
                      </View>
                    )}
                    {!item.isSystem && !item.isMainCampus && (
                      <Text style={styles.badgeNone}>—</Text>
                    )}
                  </View>
                </View>

                <View style={styles.colActions}>
                  {item.isSystem ? (
                    <Text style={styles.protectedLabel}>Protected</Text>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.deleteIconBtn,
                        pressed && styles.deleteIconBtnPressed,
                      ]}
                      onPress={() => setDeleteTarget(item)}
                      accessibilityLabel={`Delete ${item.name}`}
                    >
                      <FontAwesome name="trash-o" size={15} color={theme.danger} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {!isLoading && items.length > 0 && (
          <View style={styles.listFooter}>
            <FontAwesome name="info-circle" size={13} color={theme.textMuted} />
            <Text style={styles.listFooterText}>
              Deletion is blocked while users are assigned to a {sectionSingular}.
            </Text>
          </View>
        )}
      </View>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <FontAwesome
              name={modalType === 'success' ? 'check-circle' : 'exclamation-circle'}
              size={40}
              color={modalType === 'success' ? theme.success : theme.danger}
            />
            <Text style={styles.modalMessage}>{modalMessage}</Text>
            <Pressable style={styles.modalPrimaryBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalPrimaryBtnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteTarget !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.deleteModal]}>
            <View style={styles.deleteModalIconWrap}>
              <FontAwesome name="exclamation-triangle" size={32} color={theme.danger} />
            </View>
            <Text style={styles.modalTitle}>Delete {sectionSingular}?</Text>
            <Text style={styles.deleteMessage}>
              You are about to permanently delete{' '}
              <Text style={styles.deleteName}>&quot;{deleteTarget?.name}&quot;</Text>. This cannot
              be undone.
            </Text>
            <View style={styles.deleteNotice}>
              <FontAwesome name="users" size={14} color={theme.primary} />
              <Text style={styles.deleteNoticeText}>
                If users are still assigned to this {sectionSingular}, deletion will be blocked.
                Reassign them in User Management first.
              </Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDelete, isDeleting && styles.buttonDisabled]}
                onPress={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalPrimaryBtnText}>Delete</Text>
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
  container: { gap: 16 },
  pageDescription: {
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 21,
    maxWidth: 720,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  tabRowCompact: {
    flexDirection: 'column',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EAECF0',
    backgroundColor: theme.surface,
    ...Platform.select({
      web: {
        cursor: 'pointer' as const,
        transition: 'all 0.15s ease',
        boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
      },
    }),
  },
  tabActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(254,206,0,0.35)' } }),
  },
  tabText: {
    color: theme.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  tabTextActive: {
    color: theme.primary,
    fontWeight: '700',
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: '#EAECF0',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
      },
    }),
  },
  cardAccent: {
    height: 3,
    backgroundColor: theme.accent,
  },
  addPanel: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    backgroundColor: '#FAFBFC',
  },
  addPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  addPanelIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(254,206,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPanelTitles: { flex: 1 },
  addPanelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 2,
  },
  addPanelSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 18,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  addRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  input: {
    flex: 1,
    minWidth: 220,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: theme.primary,
    backgroundColor: '#fff',
    ...Platform.select({
      web: { outlineStyle: 'none' as const },
    }),
  },
  inputFull: {
    width: '100%',
    flex: undefined,
    minWidth: undefined,
  },
  mainCampusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#fff',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  mainCampusToggleOn: {
    borderColor: theme.primary,
    backgroundColor: 'rgba(1,26,107,0.04)',
  },
  mainCampusLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.textMuted,
  },
  mainCampusLabelOn: {
    color: theme.primary,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: theme.accent,
    minWidth: 88,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  addButtonText: {
    color: theme.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  buttonDisabled: { opacity: 0.6 },
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
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
  },
  listHeaderHidden: {
    display: 'none',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  colName: { flex: 1, minWidth: 0, paddingRight: 12 },
  colTags: { width: 120, paddingRight: 12, flexShrink: 0 },
  colActions: {
    width: 72,
    flexShrink: 0,
    alignItems: 'flex-end',
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
  listScroll: {
    maxHeight: 420,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    backgroundColor: '#FFFFFF',
  },
  listItemAlt: {
    backgroundColor: '#FAFBFC',
  },
  itemLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  itemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(254,206,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemIconWrapSystem: {
    backgroundColor: 'rgba(1,26,107,0.08)',
  },
  listItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
    lineHeight: 20,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  badgeSystem: {
    backgroundColor: 'rgba(1,26,107,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeSystemText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.primary,
  },
  badgeMain: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeMainText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803d',
  },
  badgeNone: {
    fontSize: 13,
    color: '#98A2B3',
  },
  protectedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    fontStyle: 'italic',
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
  deleteIconBtnPressed: {
    backgroundColor: 'rgba(220,53,69,0.14)',
  },
  listFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
    backgroundColor: '#FAFBFC',
  },
  listFooterText: {
    flex: 1,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 18,
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
    maxWidth: 400,
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.primary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: theme.primary,
    textAlign: 'center',
    marginVertical: 16,
    lineHeight: 22,
  },
  deleteMessage: {
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 21,
    textAlign: 'center',
  },
  deleteName: {
    fontWeight: '700',
    color: theme.primary,
  },
  deleteNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(1,26,107,0.04)',
    borderWidth: 1,
    borderColor: theme.border,
  },
  deleteNoticeText: {
    flex: 1,
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 19,
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
  modalPrimaryBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 4,
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
  modalPrimaryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default MasterDataManagement;
