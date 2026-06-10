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

const SECTIONS: { key: SectionKey; label: string; endpoint: string }[] = [
  { key: 'roles', label: 'Roles', endpoint: 'roles' },
  { key: 'faculties', label: 'Faculties', endpoint: 'faculties' },
  { key: 'extensions', label: 'Campus / Extension', endpoint: 'extensions' },
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
      showModal(`${sectionConfig.label} added successfully.`, 'success');
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

  const toggleActive = async (item: MetadataItem) => {
    if (item.isSystem && item.active) {
      showModal('System roles cannot be deactivated.', 'error');
      return;
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(
        `${API_URL}/metadata/admin/${sectionConfig.endpoint}/${item._id}`,
        { active: !item.active },
        { headers: { 'x-auth-token': token } }
      );
      fetchItems();
    } catch (error: unknown) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || 'Failed to update item.'
        : 'Failed to update item.';
      showModal(msg, 'error');
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.pageDescription}>
        Manage the roles, faculty departments, and campus locations shown when registering users or updating assignments.
      </Text>
      <View style={[styles.tabRow, isCompact && styles.tabRowCompact]}>
        {SECTIONS.map((section) => (
          <Pressable
            key={section.key}
            style={[styles.tab, activeSection === section.key && styles.tabActive]}
            onPress={() => setActiveSection(section.key)}
          >
            <Text style={[styles.tabText, activeSection === section.key && styles.tabTextActive]}>
              {section.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, isCompact && styles.inputFull]}
          placeholder={`New ${sectionConfig.label.toLowerCase()} name`}
          value={newName}
          onChangeText={setNewName}
          placeholderTextColor={theme.textMuted}
        />
        {activeSection === 'extensions' && (
          <Pressable
            style={[styles.checkboxRow, isCompact && styles.checkboxRowCompact]}
            onPress={() => setIsMainCampus(!isMainCampus)}
          >
            <FontAwesome
              name={isMainCampus ? 'check-square-o' : 'square-o'}
              size={20}
              color={theme.primary}
            />
            <Text style={styles.checkboxLabel}>Main campus</Text>
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
              <FontAwesome name="plus" size={14} color={theme.primary} />
              <Text style={styles.addButtonText}>Add</Text>
            </>
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
      ) : (
        <ScrollView style={styles.listScroll}>
          {items.map((item) => (
            <View key={item._id} style={styles.listItem}>
              <View style={styles.listItemInfo}>
                <Text style={[styles.listItemName, !item.active && styles.inactiveText]}>{item.name}</Text>
                <View style={styles.badges}>
                  {!item.active && <Text style={styles.badgeInactive}>Inactive</Text>}
                  {item.isSystem && <Text style={styles.badgeSystem}>System</Text>}
                  {item.isMainCampus && <Text style={styles.badgeMain}>Main</Text>}
                </View>
              </View>
              {!item.isSystem && (
                <Pressable
                  style={[styles.toggleButton, !item.active && styles.toggleButtonActivate]}
                  onPress={() => toggleActive(item)}
                >
                  <Text style={styles.toggleButtonText}>{item.active ? 'Deactivate' : 'Activate'}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <FontAwesome
              name={modalType === 'success' ? 'check-circle' : 'exclamation-circle'}
              size={40}
              color={modalType === 'success' ? theme.success : theme.danger}
            />
            <Text style={styles.modalMessage}>{modalMessage}</Text>
            <Pressable style={styles.modalButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  pageDescription: {
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 20,
    marginBottom: 16,
    maxWidth: 640,
  },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  tabRowCompact: { flexDirection: 'column' },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  tabActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  tabText: { color: theme.primary, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#fff' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  input: {
    flex: 1,
    minWidth: 200,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.primary,
    backgroundColor: '#fff',
  },
  inputFull: { width: '100%', flex: undefined },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxRowCompact: { width: '100%' },
  checkboxLabel: { color: theme.primary, fontSize: 14 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.accent,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  addButtonText: { color: theme.primary, fontWeight: '700', fontSize: 14 },
  buttonDisabled: { opacity: 0.6 },
  loader: { marginTop: 40 },
  listScroll: { maxHeight: 480 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: '#fff',
  },
  listItemInfo: { flex: 1, marginRight: 12 },
  listItemName: { fontSize: 15, fontWeight: '600', color: theme.primary },
  inactiveText: { color: theme.textMuted, textDecorationLine: 'line-through' },
  badges: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  badgeInactive: {
    fontSize: 11,
    color: theme.danger,
    backgroundColor: 'rgba(220,53,69,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeSystem: {
    fontSize: 11,
    color: theme.primary,
    backgroundColor: 'rgba(1,26,107,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeMain: {
    fontSize: 11,
    color: '#166534',
    backgroundColor: 'rgba(34,197,94,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.danger,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  toggleButtonActivate: { borderColor: theme.success },
  toggleButtonText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
  },
  modalMessage: {
    fontSize: 15,
    color: theme.primary,
    textAlign: 'center',
    marginVertical: 16,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: theme.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  modalButtonText: { color: '#fff', fontWeight: '600' },
});

export default MasterDataManagement;
