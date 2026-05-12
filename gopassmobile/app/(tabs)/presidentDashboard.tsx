import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Image, ImageBackground, Modal, TouchableOpacity, FlatList, TextInput, RefreshControl, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { API_URL } from '../../config/api';
import { useSocket } from '../../config/SocketContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { NotificationsModal, type Notification } from '../../components/NotificationsModal';
import TravelOrderForm from '../../components/TravelOrderForm';

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
  danger: '#dc3545',
};

// --- Type Definitions ---
interface User {
  _id: string;
  id?: string;
  name: string;
  email: string;
  role: string;
}

interface Employee {
  _id: string;
  name: string;
  email: string;
  role?: string;
}

interface NextSignerInfo {
  originalId: string;
  originalName?: string | null;
  signerId: string;
  signerName?: string | null;
  viaOic: 'primary' | 'fallback' | null;
  noDelegateAvailable?: boolean;
}

interface PassSlip {
  _id: string;
  employee: Employee;
  purpose: string;
  destination: string;
  status: 'Pending' | 'Recommended' | 'Approved' | 'Rejected';
  date: string;
  timeOut: string;
  estimatedTimeBack: string;
  signature: string;
  approverSignature?: string;
  approvedBy?: { name: string };
  nextSigner?: NextSignerInfo;
}

interface TravelOrder {
  _id: string;
  employee: Employee;
  purpose: string;
  to: string;
  status: 'Pending' | 'Recommended' | 'Approved' | 'Rejected';
  date: string;
  travelOrderNo: string;
  travelOrderNoSignature?: string;
  address: string;
  employeeAddress?: string;
  salary: string;
  departureDate: string;
  arrivalDate: string;
  additionalInfo: string;
  signature: string;
  approverSignature?: string;
  hrApproverSignature?: string;
  departureSignature?: string;
  arrivalSignature?: string;
  approvedBy?: { name: string };
  recommendedBy?: { _id: string, name: string }[];
  recommenderSignatures?: { user: string, signature: string, date: string }[];
  recommendersWhoApproved?: string[];
  departureTime?: string;
  nextSigner?: NextSignerInfo;
}

const formatDate = (dateString: string, includeTime: boolean = false) => {
  if (!dateString) return 'No Date';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  if (includeTime) {
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  }
  return date.toLocaleDateString();
};

const formatSalary = (salary: string | undefined) =>
  !salary ? '' : salary.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type ItemType = 'slip' | 'order';

export default function PresidentDashboard() {
  const insets = useSafeAreaInsets();
  const [pendingSlips, setPendingSlips] = useState<PassSlip[]>([]);
  const [recommendedOrders, setRecommendedOrders] = useState<TravelOrder[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isReviewModalVisible, setReviewModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PassSlip | TravelOrder | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ItemType | null>(null);
  const [approverSignature, setApproverSignature] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<'draw' | 'upload' | null>(null);
  const [showSignatureCanvas, setShowSignatureCanvas] = useState(false);
  const sigCanvas = useRef<SignatureViewRef>(null);
  const [activeTab, setActiveTab] = useState<ItemType>('slip');
  const {
    notifications,
    fetchNotifications,
    markNotificationRead,
    markAllRead,
    deleteNotification: deleteNotificationFromContext,
    deleteAllNotifications,
  } = useNotifications();
  const [isNotificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const socket = useSocket();
  const [refreshing, setRefreshing] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ type: ItemType; id: string } | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  // Defer mounting signature canvas so iOS Modal has layout before WebView (fixes "only appears when exit")
  useEffect(() => {
    if (signatureType === 'draw') {
      const t = setTimeout(() => setShowSignatureCanvas(true), 200);
      return () => clearTimeout(t);
    }
    setShowSignatureCanvas(false);
  }, [signatureType]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };

      const [slipsResponse, ordersResponse, userResponse] = await Promise.all([
        axios.get<PassSlip[]>(`${API_URL}/pass-slips/president-pending`, { headers }),
        axios.get<TravelOrder[]>(`${API_URL}/travel-orders/for-president-approval`, { headers }),
        axios.get<User>(`${API_URL}/users/me`, { headers }),
      ]);

      setPendingSlips(slipsResponse.data);
      setRecommendedOrders(ordersResponse.data);
      setUser(userResponse.data);
      await fetchNotifications();
    } catch (err) {
      setError('Failed to fetch recommended travel orders. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      fetchNotifications();
    }, [fetchData, fetchNotifications])
  );

  useEffect(() => {
    if (!socket || !user) return;

    const handleNewItem = () => fetchData();
    const handleUpdate = () => fetchData();
    const handleDelete = () => fetchData();
    socket.on('newPassSlip', handleNewItem);
    socket.on('travelOrderDataChanged', handleUpdate);
    socket.on('passSlipStatusUpdate', handleUpdate);
    socket.on('passSlipDeleted', handleDelete);

    return () => {
      socket.off('newPassSlip', handleNewItem);
      socket.off('travelOrderDataChanged', handleUpdate);
      socket.off('passSlipStatusUpdate', handleUpdate);
      socket.off('passSlipDeleted', handleDelete);
    };
  }, [socket, user, fetchData]);

  const handleOpenNotifications = () => {
    setNotificationsModalVisible(true);
  };

  const handleDeleteNotification = (notificationId: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNotificationFromContext(notificationId);
            } catch (error) {
              Alert.alert('Error', 'Could not delete the notification.');
            }
          },
        },
      ]
    );
  };

  const handleOpenReview = (item: PassSlip | TravelOrder, type: ItemType) => {
    setSelectedItem(item);
    setSelectedItemType(type);
    setApproverSignature(null); // Clear previous signature
    setReviewModalVisible(true);
  };

  const handleDrawOK = (sig: string) => {
    setApproverSignature(sig);
    setSignatureType(null);
  };

  const handleClearSignature = () => {
    sigCanvas.current?.clearSignature();
  };

  const handleConfirmSignature = () => {
    sigCanvas.current?.readSignature();
  };

  const handleUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission required", "You need to allow access to your photos to upload a signature.");
      setSignatureType(null); // Reset signature type
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [2, 1],
      quality: 0.5,
      base64: true,
    });

    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets[0].base64) {
      const uri = `data:image/jpeg;base64,${pickerResult.assets[0].base64}`;
      setApproverSignature(uri);
    }
    setSignatureType(null);
  };

  useEffect(() => {
    if (signatureType === 'upload') {
      handleUpload();
    }
  }, [signatureType]);

  const handleRejectPress = (type: ItemType, id: string) => {
    setRejectTarget({ type, id });
    setRejectComment('');
    setRejectModalVisible(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const url = rejectTarget.type === 'slip' ? `${API_URL}/pass-slips/${rejectTarget.id}/status` : `${API_URL}/travel-orders/${rejectTarget.id}/status`;
      await axios.put(url, { status: 'Rejected', rejectionReason: rejectComment.trim() || undefined }, { headers });
      Alert.alert('Success', 'Request has been rejected.');
      setRejectModalVisible(false);
      setRejectTarget(null);
      setRejectComment('');
      fetchData();
    } catch (err) {
      Alert.alert('Error', 'Failed to update the request status.');
      console.error(err);
    }
  };

  const handleSubmit = async () => {
    if (!selectedItem || !selectedItemType) return;

    if (!approverSignature) {
      Alert.alert('Signature Required', 'Please provide your signature to proceed.');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      let url = '';
      let payload: any = { approverSignature };
      let successMessage = '';

      if (selectedItemType === 'slip') {
        url = `${API_URL}/pass-slips/${selectedItem._id}/status`;
        payload.status = 'Recommended';
        successMessage = `Pass slip has been recommended.`;
      } else { // order
                url = `${API_URL}/travel-orders/${selectedItem._id}/approve-president`;
        payload.status = 'President Approved';
        successMessage = 'Travel order has been approved.';
      }

      await axios.put(url, payload, { headers });

      Alert.alert('Success', successMessage);
      setReviewModalVisible(false);
      setSelectedItem(null);
      setSelectedItemType(null);
      fetchData(); // Refresh the list
    } catch (err) {
      Alert.alert('Error', `Failed to update the ${selectedItemType === 'slip' ? 'pass slip' : 'travel order'}.`);
      console.error(err);
    }
  };


  const renderItem = (item: PassSlip | TravelOrder, type: ItemType) => (
    <Pressable key={item._id} style={styles.itemCard} onPress={() => handleOpenReview(item, type)}>
      <View style={[styles.itemCardTopBar, type === 'slip' ? styles.itemCardTopBarSlip : styles.itemCardTopBarOrder]} />
      {item.nextSigner?.viaOic && item.nextSigner.signerId === (user?._id || user?.id) && (
        <View style={styles.oicBadge}>
          <FontAwesome name="user-secret" size={12} color="#fff" />
          <Text style={styles.oicBadgeText}>
            Acting as OIC for {item.nextSigner.originalName || 'original signatory'}
          </Text>
        </View>
      )}
      <View style={styles.itemCardHeader}>
        <View style={[styles.itemIconWrap, type === 'slip' ? styles.itemIconWrapSlip : styles.itemIconWrapOrder]}>
          <FontAwesome name={type === 'slip' ? 'file-text-o' : 'plane'} size={18} color="#fff" />
        </View>
        <View style={styles.itemHeaderText}>
          <Text style={styles.itemTitle}>{item.employee?.name || 'N/A'}</Text>
          <Text style={styles.itemSubtitle}>{type === 'slip' ? 'Pass Slip' : 'Travel Order'}</Text>
        </View>
      </View>
      <View style={styles.itemBody}>
        <Text style={styles.itemDetail}><Text style={styles.bold}>Purpose:</Text> {item.purpose}</Text>
        <Text style={styles.itemDetail}><Text style={styles.bold}>Date:</Text> {formatDate(item.date)}</Text>
      </View>
      <View style={styles.itemButtonRow}>
        <Pressable style={[styles.itemButton, styles.reviewButton]} onPress={() => handleOpenReview(item, type)}>
          <Text style={styles.itemButtonText}>Review</Text>
        </Pressable>
        <Pressable style={[styles.itemButton, styles.rejectButton]} onPress={(e) => { e.stopPropagation(); handleRejectPress(type, item._id); }}>
          <Text style={styles.itemButtonText}>Reject</Text>
        </Pressable>
      </View>
    </Pressable>
  );

  const renderPassSlipReview = () => {
    if (!selectedItem || !('destination' in selectedItem)) return null;
    const item = selectedItem as PassSlip;

    return (
      <View style={styles.modalContent}>
        <View style={styles.docHeader}>
          <View>
            <View style={styles.blueLine} />
            <Text style={styles.docUniversityName}>DAVAO ORIENTAL</Text>
            <Text style={styles.docUniversityName}>STATE UNIVERSITY</Text>
            <Text style={styles.docMotto}>"A university of excellence, innovation, and inclusion"</Text>
            <View style={styles.blueLine} />
            <Text style={styles.docPassSlipHeader}>PASS SLIP</Text>
          </View>
          <Image source={require('../../assets/images/dorsulogo-removebg-preview (1).png')} style={styles.docLogo} />
        </View>
        <View style={styles.docTitleContainer}>
          <View />
          <Text style={styles.docField}>Date: <Text style={styles.docValue}>{formatDate(item.date)}</Text></Text>
        </View>
        <View style={styles.docMainTitleContainer}>
          <Text style={styles.docMainTitle}>PASS SLIP</Text>
          <Text style={styles.docSubTitle}>(Within Mati City)</Text>
        </View>
        <View style={styles.docRow}><Text style={styles.docField}>Name of Employee: <Text style={styles.docValue}>{item.employee?.name}</Text></Text></View>
        <View style={styles.docRow}><Text style={styles.docField}>Time Out: <Text style={styles.docValue}>{item.timeOut}</Text></Text></View>
        <View style={styles.docRow}><Text style={styles.docField}>Estimated Time to be Back: <Text style={styles.docValue}>{item.estimatedTimeBack}</Text></Text></View>
        <View style={styles.docRow}><Text style={styles.docField}>Destination: <Text style={styles.docValue}>{item.destination}</Text></Text></View>
        <View style={styles.docRow}><Text style={styles.docField}>Purpose/s: <Text style={styles.docValue}>{item.purpose}</Text></Text></View>

        <View style={styles.docSignatureContainer}>
          <View style={styles.docSignatureBox}>
            <Text style={styles.docField}>Requested by:</Text>
            <View style={styles.docSignatureDisplay}>
              {item.signature && <Image source={{ uri: item.signature }} style={styles.docSignatureImage} />}
              <Text style={styles.docSignatureName}>{item.employee?.name}</Text>
            </View>
            <Text style={styles.docSignatureUnderline}>Faculty Dean</Text>
          </View>
          <View style={styles.docSignatureBox}>
            <Text style={styles.docField}>Approved by:</Text>
            <View style={styles.docSignatureDisplay}>
              {approverSignature ? (
                <View style={styles.signatureImageContainer}>
                  <Image source={{ uri: approverSignature }} style={styles.docSignatureImage} />
                  <Pressable style={styles.redoButton} onPress={() => setApproverSignature(null)}>
                    <FontAwesome name="undo" size={18} color="#003366" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.signatureButtonsContainer}>
                  <Pressable style={styles.signatureButton} onPress={() => setSignatureType('draw')}>
                    <FontAwesome name="pencil" size={24} color="#003366" />
                  </Pressable>
                  <Pressable style={styles.signatureButton} onPress={() => setSignatureType('upload')}>
                    <FontAwesome name="upload" size={24} color="#003366" />
                  </Pressable>
                </View>
              )}
              <Text style={styles.docSignatureName}>{user?.name}</Text>
            </View>
            <Text style={styles.docSignatureUnderline}>President</Text>
            {selectedItem?.nextSigner?.viaOic && selectedItem?.nextSigner?.originalName && (
              <Text style={styles.docOicNote}>(OIC for {selectedItem.nextSigner.originalName})</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderTravelOrderReview = () => {
    if (!selectedItem) return null;
    const item = selectedItem as TravelOrder;

    return (
      <View style={styles.modalContent}>
        <TravelOrderForm
          order={item as any}
          presidentName={user?.name || ''}
          currentUserId={user?._id || ''}
          approverSignature={approverSignature}
          onRedoApproverSignature={() => setApproverSignature(null)}
          onChooseSignature={(type) => setSignatureType(type as 'draw' | 'upload')}
          presidentCanSign
        />
      </View>
    );
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="light" />
      <ImageBackground source={headerBgImage} style={styles.screenHeaderBg} imageStyle={styles.screenHeaderImageStyle}>
        <View style={[styles.screenHeaderOverlay, { paddingTop: insets.top + 12 }]}>
          <Image source={headerLogo} style={styles.screenHeaderLogo} />
          <View style={styles.screenHeaderInner}>
            <Text style={styles.screenHeaderTitle}>Dashboard</Text>
            <Text style={styles.screenHeaderSubtitle}>President</Text>
          </View>
          <TouchableOpacity style={styles.bellTouchable} onPress={handleOpenNotifications}>
            <FontAwesome name="bell-o" size={24} color="#fff" />
            {notifications.some(n => !n.read) && <View style={styles.notificationIndicator} />}
          </TouchableOpacity>
        </View>
      </ImageBackground>

      <Modal visible={rejectModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.rejectModalOverlay}
        >
          <ScrollView
            contentContainerStyle={styles.rejectModalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>Reject request</Text>
              <Text style={styles.rejectModalSubtitle}>Add an optional comment for the employee (e.g. reason for rejection).</Text>
              <TextInput
                style={styles.rejectCommentInput}
                placeholder="Comment (optional)"
                placeholderTextColor={theme.textMuted}
                value={rejectComment}
                onChangeText={setRejectComment}
                multiline
                numberOfLines={3}
              />
              <View style={styles.rejectModalButtons}>
                <Pressable style={[styles.rejectModalButton, styles.rejectModalCancel]} onPress={() => { setRejectModalVisible(false); setRejectTarget(null); setRejectComment(''); }}>
                  <Text style={styles.rejectModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.rejectModalButton, styles.rejectModalConfirm]} onPress={handleRejectConfirm}>
                  <Text style={styles.rejectModalConfirmText}>Confirm Rejection</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={isReviewModalVisible}
        animationType="fade"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <ScrollView>
            {selectedItemType === 'slip' ? renderPassSlipReview() : renderTravelOrderReview()}
          </ScrollView>
          <View style={styles.modalButtonContainer}>
            <Pressable style={[styles.button, styles.approveButton]} onPress={handleSubmit}>
              <Text style={styles.buttonText}>Approve</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={() => setReviewModalVisible(false)}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
          </View>

          {signatureType === 'draw' && (
            <View style={[StyleSheet.absoluteFillObject, styles.signatureOverlay]}>
              <View style={styles.signatureModalContainer}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Draw Signature</Text>
                  <Pressable onPress={() => setSignatureType(null)}>
                    <Text style={styles.modalCancelButtonText}>Cancel</Text>
                  </Pressable>
                </View>
                <View style={styles.signatureCanvasWrapper}>
                  {showSignatureCanvas && (
                    <SignatureScreen
                      ref={sigCanvas}
                      onOK={handleDrawOK}
                      onEmpty={() => console.log('empty')}
                      descriptionText=""
                      imageType="image/png"
                      backgroundColor="rgba(0,0,0,0)"
                      webStyle={`.m-signature-pad { box-shadow: none; border: none; background-color: transparent; } .m-signature-pad--body { border-radius: 4px; border: 1px solid #ccc; background-color: transparent; } .m-signature-pad--footer { display: none; }`}
                    />
                  )}
                </View>
                <View style={styles.signatureActionContainer}>
                  <Pressable style={[styles.signatureActionButton, styles.cancelButton]} onPress={handleClearSignature}>
                    <Text style={styles.signatureActionButtonText}>Clear</Text>
                  </Pressable>
                  <Pressable style={[styles.signatureActionButton, styles.confirmButton]} onPress={handleConfirmSignature}>
                    <Text style={styles.signatureActionButtonText}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>

      <NotificationsModal
        visible={isNotificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
        notifications={notifications}
        onDeleteNotification={handleDeleteNotification}
        onDeleteAllNotifications={deleteAllNotifications}
        onMarkNotificationRead={markNotificationRead}
        onMarkAllRead={markAllRead}
      />

      <View style={styles.contentContainer}>
        <ScrollView
          contentContainerStyle={[styles.scrollContainer, { paddingBottom: (insets.bottom || 20) + 88 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <ActivityIndicator size="large" color={theme.primary} />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionCardTopBar} />
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <View style={styles.sectionIconWrap}>
                      <FontAwesome name="list-alt" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sectionTitle}>Pending Requests</Text>
                  </View>
                </View>

                <View style={styles.tabContainer}>
                  <Pressable
                    style={[styles.tab, activeTab === 'slip' && styles.activeTab]}
                    onPress={() => setActiveTab('slip')}
                  >
                    <FontAwesome name="file-text-o" size={18} color={activeTab === 'slip' ? theme.primary : theme.textMuted} style={styles.tabIcon} />
                    <Text style={[styles.tabText, activeTab === 'slip' && styles.activeTabText]}>Pass Slips ({pendingSlips.length})</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.tab, activeTab === 'order' && styles.activeTab]}
                    onPress={() => setActiveTab('order')}
                  >
                    <FontAwesome name="plane" size={18} color={activeTab === 'order' ? theme.primary : theme.textMuted} style={styles.tabIcon} />
                    <Text style={[styles.tabText, activeTab === 'order' && styles.activeTabText]}>Travel Orders ({recommendedOrders.length})</Text>
                  </Pressable>
                </View>
              </View>

              {activeTab === 'slip' && (
                pendingSlips.length > 0 ? (
                  pendingSlips.map(item => renderItem(item, 'slip'))
                ) : (
                  <Text style={styles.noRequestsText}>No pending pass slips.</Text>
                )
              )}

              {activeTab === 'order' && (
                recommendedOrders.length > 0 ? (
                  recommendedOrders.map(item => renderItem(item, 'order'))
                ) : (
                  <Text style={styles.noRequestsText}>No pending travel orders.</Text>
                )
              )}
            </>
          )}
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
    minHeight: 100,
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
    minHeight: 100,
  },
  screenHeaderLogo: {
    width: 44,
    height: 44,
    marginRight: 12,
  },
  screenHeaderInner: {
    flex: 1,
  },
  screenHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  screenHeaderSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  bellTouchable: {
    padding: 8,
  },
  contentContainer: {
    flex: 1,
    padding: 16,
  },
  scrollContainer: {
    paddingBottom: 24,
    paddingHorizontal: 4,
  },
  noRequestsText: {
    textAlign: 'center',
    color: theme.textMuted,
    marginTop: 24,
    fontSize: 15,
  },
  sectionCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  sectionCardTopBar: {
    height: 4,
    width: '100%',
    backgroundColor: theme.accent,
  },
  sectionHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.primary,
    letterSpacing: -0.2,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    backgroundColor: 'rgba(1,26,107,0.04)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  tabIcon: {
    marginRight: 8,
  },
  activeTab: {
    backgroundColor: '#fff',
  },
  tabText: {
    color: theme.textMuted,
    fontWeight: '700',
    fontSize: 12.5,
  },
  activeTabText: {
    color: theme.primary,
  },
  itemCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  itemCardTopBar: {
    height: 4,
    width: '100%',
  },
  oicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  oicBadgeText: {
    color: theme.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  itemCardTopBarSlip: {
    backgroundColor: theme.primary,
  },
  itemCardTopBarOrder: {
    backgroundColor: theme.accent,
  },
  itemCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  itemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemIconWrapSlip: {
    backgroundColor: theme.primary,
  },
  itemIconWrapOrder: {
    backgroundColor: theme.primaryDark,
  },
  itemHeaderText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.primary,
  },
  itemSubtitle: {
    fontSize: 12,
    color: theme.textMuted,
  },
  itemBody: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  itemDetail: {
    fontSize: 14,
    color: 'rgba(1,26,107,0.92)',
    marginBottom: 4,
  },
  bold: {
    fontWeight: '600',
    color: theme.primary,
  },
  itemButtonRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  itemButton: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  reviewButton: {
    backgroundColor: theme.primary,
  },
  rejectButton: {
    backgroundColor: theme.danger,
  },
  itemButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  rejectModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  /** Scroll wrapper so the keyboard never hides the action buttons. */
  rejectModalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  rejectModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    maxHeight: '95%',
  },
  rejectModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  rejectModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  rejectCommentInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  rejectModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  rejectModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 12,
  },
  rejectModalCancel: {
    backgroundColor: '#e9ecef',
  },
  rejectModalCancelText: {
    color: '#495057',
    fontWeight: '600',
  },
  rejectModalConfirm: {
    backgroundColor: '#dc3545',
  },
  rejectModalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  approveButton: {
    backgroundColor: '#22c55e',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  signatureButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    width: '100%',
    paddingVertical: 10, // Add padding for vertical spacing
  },
  signatureButton: {
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 50,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(1,26,107,0.06)',
    marginRight: 10,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalContent: {
    padding: 20,
    backgroundColor: '#fff',
  },
  signatureTitle: {
    fontSize: 14,
    color: '#333',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  // Document Preview Styles
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  docSignatureDisplay: {
    position: 'relative',
    alignSelf: 'flex-start',
    alignItems: 'center',
    marginBottom: 5,
    minHeight: 60,
  },
  recommenderSignatureDisplay: {
    position: 'relative',
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  recommenderNameRow: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  placeholderSignature: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    width: 150,
  },
  placeholderText: {
    color: '#999',
    fontSize: 12,
    fontStyle: 'italic',
  },
  docSignatureImage: {
    width: 100,
    height: 50,
  },
  signatureImageContainer: {
    position: 'absolute',
    top: -5,
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redoButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#fff',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#003366',
    zIndex: 1,
  },
  universityNameContainer: {
    flex: 1,
  },
  headerLine: {
    height: 2,
    backgroundColor: '#3498db',
    marginVertical: 4,
  },
  logo: {
    width: 70,
    height: 70,
    marginHorizontal: 10,
  },
  universityName: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#2980b9',
  },
  universityMotto: {
    fontSize: 8,
    fontStyle: 'italic',
  },
  docHeaderRight: {
    borderWidth: 1,
    borderColor: '#34495e',
    maxWidth: '45%',
  },
  docInfoBoxHeader: {
    backgroundColor: '#34495e',
    padding: 4,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#34495e',
  },
  docInfoBoxContent: {
    backgroundColor: 'white',
    padding: 4,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#34495e',
  },
  docInfoTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
  },
  docInfoContent: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  docInfoColumnsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ecf0f1',
  },
  docInfoColumnHeader: {
    flex: 1,
    padding: 4,
    textAlign: 'center',
    borderRightWidth: 1,
    borderColor: '#bdc3c7',
    fontSize: 8,
    color: '#7f8c8d',
    backgroundColor: '#ecf0f1',
  },
  docInfoColumnValue: {
    flex: 1,
    padding: 4,
    textAlign: 'center',
    borderRightWidth: 1,
    borderColor: '#bdc3c7',
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: 'white',
  },
  docTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
    marginVertical: 5,
    textDecorationLine: 'underline',
  },
  revisedText: {
    textAlign: 'left',
    fontSize: 10,
    marginBottom: 10,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  formLabel: {
    fontSize: 10,
    marginRight: 5,
  },
  formValue: {
    fontSize: 10,
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderColor: '#000',
    flex: 1,
  },
  formLabelRight: {
    fontSize: 10,
    marginLeft: 10,
    marginRight: 5,
  },
  directiveText: {
    fontSize: 10,
    marginVertical: 10,
  },
  infoText: {
    fontSize: 10,
    marginBottom: 5,
  },
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  signatureSectionColumn: {
    flexDirection: 'column',
    marginTop: 20,
  },
  signatureBlockLeft: {
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  signatureHeader: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  signatureNameContainer: {
    marginTop: 15,
    alignSelf: 'flex-start',
  },
  signatureName: {
    fontSize: 12,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    textAlign: 'left',
  },
  docUniversityName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003366',
  },
  docMotto: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  docPassSlipHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#003366',
    marginTop: 5,
  },
  blueLine: {
    height: 2,
    backgroundColor: '#003366',
    marginTop: 2,
    marginBottom: 5,
    width: '80%',
  },
  docLogo: {
    width: 60,
    height: 60,
  },
  docTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  docMainTitleContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  docMainTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  docSubTitle: {
    fontSize: 14,
  },
  docRow: {
    marginBottom: 15,
  },
  docField: {
    fontSize: 14,
  },
  docValue: {
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  docSignatureContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 40,
  },
  docSignatureBox: {
    width: '48%',
  },
  docSignatureName: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  docOicNote: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#444',
    marginTop: 2,
  },
  docSignatureUnderline: {
    borderTopWidth: 1,
    borderColor: '#000',
    textAlign: 'left',
    paddingTop: 2,
    fontSize: 12,
  },
  notificationIndicator: {
    position: 'absolute',
    right: -3,
    top: -3,
    backgroundColor: 'red',
    borderRadius: 8,
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003366',
  },
  signatureOverlay: {
    backgroundColor: '#fff',
    zIndex: 9999,
  },
  signatureModalContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
    justifyContent: 'center', // Center vertically
  },
  signatureCanvasWrapper: {
    height: 250, // Fixed height for wide aspect ratio
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
  },
  modalCancelButtonText: {
    fontSize: 16,
    color: '#003366',
  },
  signatureActionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: '#ccc',
  },
  signatureActionButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  signatureActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: theme.primary,
  },
});
