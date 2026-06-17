import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
import { ModalActionFooter } from './ModalActionFooter';
import { SignatureActionButtons } from './SignatureActionButtons';
import { useSavedSignature } from '../hooks/useSavedSignature';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
  danger: '#dc3545',
};

interface SavedSignatureProfileCardProps {
  userId?: string;
}

export function SavedSignatureProfileCard({ userId }: SavedSignatureProfileCardProps) {
  const {
    hasSavedSignature,
    savedSignature,
    saveSignature,
    clearSavedSignature,
    refreshSavedSignature,
  } = useSavedSignature(userId);

  const [signatureType, setSignatureType] = useState<'draw' | 'upload' | null>(null);
  const [showSignatureCanvas, setShowSignatureCanvas] = useState(false);
  const [signatureCanvasKey, setSignatureCanvasKey] = useState(0);
  const sigCanvas = useRef<SignatureViewRef>(null);

  useEffect(() => {
    if (signatureType === 'draw') {
      const t = setTimeout(() => setShowSignatureCanvas(true), 200);
      return () => clearTimeout(t);
    }
    setShowSignatureCanvas(false);
  }, [signatureType]);

  const closeEditor = () => {
    setShowSignatureCanvas(false);
    setSignatureType(null);
  };

  const openDrawEditor = () => {
    setShowSignatureCanvas(false);
    setSignatureCanvasKey((k) => k + 1);
    setSignatureType('draw');
  };

  const handleUpdatePress = () => {
    Alert.alert('Update signature', 'Choose how to update your saved signature.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Draw', onPress: openDrawEditor },
      { text: 'Upload', onPress: () => setSignatureType('upload') },
    ]);
  };

  const handleDrawOK = async (sig: string) => {
    try {
      await saveSignature(sig);
      closeEditor();
      Alert.alert('Saved', 'Your signature has been saved on this device.');
    } catch {
      Alert.alert('Error', 'Could not save your signature.');
    }
  };

  const handleUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Allow photo access to upload a signature.');
      setSignatureType(null);
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [2, 1],
      quality: 0.5,
      base64: true,
    });

    if (!pickerResult.canceled && pickerResult.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${pickerResult.assets[0].base64}`;
      try {
        await saveSignature(uri);
        Alert.alert('Saved', 'Your signature has been saved on this device.');
      } catch {
        Alert.alert('Error', 'Could not save your signature.');
      }
    }
    setSignatureType(null);
  };

  useEffect(() => {
    if (signatureType === 'upload') {
      handleUpload();
    }
  }, [signatureType]);

  const handleRemove = () => {
    Alert.alert(
      'Remove saved signature?',
      'You will need to draw or upload again to reuse a signature on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await clearSavedSignature();
            await refreshSavedSignature();
          },
        },
      ],
    );
  };

  const handleClearSignature = () => {
    if (!showSignatureCanvas) return;
    sigCanvas.current?.clearSignature();
  };

  const handleConfirmSignature = () => {
    if (!showSignatureCanvas) return;
    sigCanvas.current?.readSignature();
  };

  return (
    <>
      <View style={styles.card}>
        <View style={[styles.cardTopBar, styles.cardTopBarAccent]} />
        <View style={styles.cardBody}>
          <View style={styles.sectionTitleRow}>
            <FontAwesome name="pencil-square-o" size={16} color={theme.primary} />
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>Saved Signature</Text>
          </View>
          <Text style={styles.helperText}>
            Save a signature on this device to reuse when creating pass slips or approving documents.
          </Text>

          {hasSavedSignature && savedSignature ? (
            <View style={styles.previewBlock}>
              <Image source={{ uri: savedSignature }} style={styles.previewImage} resizeMode="contain" />
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, styles.updateBtn]} onPress={handleUpdatePress}>
                  <FontAwesome name="pencil" size={14} color="#fff" style={styles.actionBtnIcon} />
                  <Text style={styles.actionBtnText}>Update</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.removeBtn]} onPress={handleRemove}>
                  <FontAwesome name="trash-o" size={14} color={theme.danger} style={styles.actionBtnIcon} />
                  <Text style={[styles.actionBtnText, styles.removeBtnText]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyText}>No signature saved on this device yet.</Text>
              <SignatureActionButtons
                onDraw={openDrawEditor}
                onUpload={() => setSignatureType('upload')}
                iconColor={theme.primary}
                buttonStyle={styles.addBtn}
                containerStyle={styles.addBtnRow}
              />
            </View>
          )}
        </View>
      </View>

      {signatureType === 'draw' && (
        <Modal visible animationType="fade" transparent onRequestClose={closeEditor}>
          <View style={styles.signatureModalOverlay}>
            <View style={styles.signatureModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Draw Signature</Text>
                <Pressable onPress={closeEditor}>
                  <FontAwesome name="close" size={22} color={theme.primary} />
                </Pressable>
              </View>
              <View style={styles.signatureCanvasContainer}>
                {showSignatureCanvas ? (
                  <SignatureScreen
                    key={signatureCanvasKey}
                    ref={sigCanvas}
                    onOK={handleDrawOK}
                    onEmpty={() => Alert.alert('Signature required', 'Please draw your signature before confirming.')}
                    descriptionText=""
                    imageType="image/png"
                    backgroundColor="rgba(0,0,0,0)"
                    webStyle={`.m-signature-pad { box-shadow: none; border: none; background-color: transparent; } .m-signature-pad--body { border-radius: 4px; border: 1px solid #ccc; background-color: transparent; } .m-signature-pad--footer { display: none; }`}
                  />
                ) : (
                  <View style={styles.signatureCanvasLoading}>
                    <ActivityIndicator size="large" color={theme.primary} />
                  </View>
                )}
              </View>
              <ModalActionFooter style={styles.signatureActionContainer}>
                <Pressable style={[styles.signatureActionButton, styles.clearButton]} onPress={handleClearSignature}>
                  <Text style={styles.signatureActionButtonText}>Clear</Text>
                </Pressable>
                <Pressable style={[styles.signatureActionButton, styles.confirmButton]} onPress={handleConfirmSignature}>
                  <Text style={styles.signatureActionButtonText}>Confirm</Text>
                </Pressable>
              </ModalActionFooter>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
    ...Platform.select({ ios: { shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  cardTopBar: {
    height: 4,
    backgroundColor: theme.primary,
  },
  cardTopBarAccent: {
    backgroundColor: theme.accent,
  },
  cardBody: {
    padding: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
  },
  sectionTitleInline: {
    marginLeft: 8,
  },
  helperText: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 14,
    lineHeight: 18,
  },
  previewBlock: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fafbfd',
  },
  previewImage: {
    width: '100%',
    height: 100,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtnIcon: {
    marginRight: 6,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  updateBtn: {
    backgroundColor: theme.primary,
  },
  removeBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.danger,
  },
  removeBtnText: {
    color: theme.danger,
  },
  emptyBlock: {
    alignItems: 'flex-start',
  },
  emptyText: {
    fontSize: 14,
    color: theme.textMuted,
    marginBottom: 10,
  },
  addBtnRow: {
    gap: 8,
  },
  addBtn: {
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  signatureModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  signatureModalContent: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    ...Platform.select({ ios: { shadowOpacity: 0.2, shadowRadius: 12 }, android: { elevation: 6 } }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
  },
  signatureCanvasContainer: {
    height: 250,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
  },
  signatureCanvasLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 250,
  },
  signatureActionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  signatureActionButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  clearButton: {
    backgroundColor: theme.danger,
  },
  confirmButton: {
    backgroundColor: theme.primary,
  },
  signatureActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
