import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Image, ImageBackground, Modal, TouchableOpacity, TextInput, RefreshControl, KeyboardAvoidingView } from 'react-native';
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
  id: string; // From /me
  _id: string; // Fallback
  name: string;
  email: string;
  role: string;
  faculty?: string;
}

interface Employee {
  _id: string;
  name: string;
  email: string;
  role?: string;
}

interface PassSlip {
  _id: string;
  employee: Employee;
  purpose: string;
  destination: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  date: string;
  timeOut: string;
  estimatedTimeBack: string;
  signature: string;
  approvedBy?: { name: string };
  nextSigner?: NextSignerInfo;
}

interface NextSignerInfo {
  originalId: string;
  originalName?: string | null;
  signerId: string;
  signerName?: string | null;
  viaOic: 'primary' | 'fallback' | null;
  noDelegateAvailable?: boolean;
}

interface TravelOrder {
  _id: string;
  employee: Employee;
  purpose: string;
  to: string;
  status: 'Pending' | 'Recommended' | 'Approved' | 'Rejected' | 'For HR Approval' | 'For President Approval' | 'President Approved';
  date: string;
  travelOrderNo: string;
  address: string;
  employeeAddress?: string;
  salary: string;
  departureDate: string;
  arrivalDate: string;
  additionalInfo: string;
  signature: string;
  approverSignature?: string;
  approvedBy?: { name: string };
  recommendedBy: { id?: string, _id: string, name: string }[];
  recommenderSignatures?: { user: string, signature: string, date: string }[];
  recommendersWhoApproved?: string[];
  participants?: string[];
  nextSigner?: NextSignerInfo;
}

type ItemType = 'slip' | 'order';

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

export default function ProgramHeadDashboard() {
  const insets = useSafeAreaInsets();
  const [pendingSlips, setPendingSlips] = useState<PassSlip[]>([]);
  const [pendingOrders, setPendingOrders] = useState<TravelOrder[]>([]);
  const {
    notifications,
    fetchNotifications,
    markNotificationRead,
    markAllRead,
    deleteNotification: deleteNotificationFromContext,
    deleteAllNotifications,
  } = useNotifications();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isReviewModalVisible, setReviewModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PassSlip | TravelOrder | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ItemType | null>(null);
  const [isNotificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [approverSignature, setApproverSignature] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<'draw' | 'upload' | null>(null);
  const [showSignatureCanvas, setShowSignatureCanvas] = useState(false);
  const sigCanvas = useRef<SignatureViewRef>(null);
  const [refreshing, setRefreshing] = useState(false);
  const socket = useSocket();
  const [activeTab, setActiveTab] = useState<'slips' | 'orders'>('slips');
  const [presidentName, setPresidentName] = useState('');
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ type: ItemType; id: string } | null>(null);
  const [rejectComment, setRejectComment] = useState('');

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

  // Defer mounting signature canvas so iOS Modal has layout before WebView (fixes "only appears when exit")
  useEffect(() => {
    if (signatureType === 'draw') {
      const t = setTimeout(() => setShowSignatureCanvas(true), 200);
      return () => clearTimeout(t);
    }
    setShowSignatureCanvas(false);
  }, [signatureType]);

  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };

      const [slipsResponse, ordersResponse, userResponse] = await Promise.all([
        axios.get<PassSlip[]>(`${API_URL}/pass-slips/pending`, { headers }),
        axios.get<TravelOrder[]>(`${API_URL}/travel-orders/pending`, { headers }),
        axios.get<User>(`${API_URL}/users/me`, { headers }),
      ]);

      const currentUser = userResponse.data;
      
      // Show orders where:
      // - the current user is a listed recommender (their direct turn), OR
      // - the next expected recommender is on travel and the current user is acting as their OIC.
      const filteredOrders = (ordersResponse.data || []).filter(order => {
        if (!order) return false;
        const currentUserId = currentUser.id || currentUser._id;
        if (order.recommendedBy?.some(rec => (rec._id === currentUserId) || (rec.id === currentUserId))) return true;
        if (order.nextSigner?.signerId === currentUserId && order.nextSigner?.viaOic) return true;
        return false;
      });

      setPendingSlips(slipsResponse.data);
      setPendingOrders(filteredOrders);
      setUser(currentUser);
      await fetchNotifications();
    } catch (err) {
      setError('Failed to fetch pending requests. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenNotifications = () => {
    setNotificationsModalVisible(true);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      fetchNotifications();
    }, [])
  );

  useEffect(() => {
    const fetchPresident = async () => {
      try {
        const response = await axios.get(`${API_URL}/users/president`);
        if (response.data && response.data.name) {
          setPresidentName(response.data.name);
        }
      } catch (error) {
        console.error("Failed to fetch President's name:", error);
      }
    };
    fetchPresident();
  }, []);

  useEffect(() => {
    if (!socket || !user) return;

    const handleNewPassSlip = ({ passSlip, programHeadId }: { passSlip: PassSlip, programHeadId: string }) => {
      fetchData();
    };

    const handleNewTravelOrder = (newOrder: TravelOrder) => {
      fetchData();
    };

    const handleStatusUpdate = (updatedItem: PassSlip | TravelOrder) => {
      fetchData();
    };

    const handleDelete = ({ passSlipId, travelOrderId }: { passSlipId?: string, travelOrderId?: string }) => {
      fetchData();
    };

    const handlePassSlipCancelled = ({ approverId }: { approverId: string }) => {
      if (user?._id === approverId) {
        fetchData();
      }
    };

    socket.on('newPassSlip', handleNewPassSlip);
    socket.on('travelOrderDataChanged', handleStatusUpdate);
    socket.on('passSlipStatusUpdate', handleStatusUpdate);
    socket.on('passSlipDeleted', handleDelete);
    socket.on('passSlipCancelled', handlePassSlipCancelled);

    return () => {
      socket.off('newPassSlip', handleNewPassSlip);
      socket.off('travelOrderDataChanged', handleStatusUpdate);
      socket.off('passSlipStatusUpdate', handleStatusUpdate);
      socket.off('passSlipDeleted', handleDelete);
      socket.off('passSlipCancelled', handlePassSlipCancelled);
    };
  }, [socket, user, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

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

  const handleSubmitToHR = async () => {
    if (!selectedItem || !selectedItemType) return;

    const status = 'Recommended';

    try {
      const token = await AsyncStorage.getItem('userToken'); 
      const headers = { 'x-auth-token': token };
      const url = selectedItemType === 'slip' ? `${API_URL}/pass-slips/${selectedItem._id}/status` : `${API_URL}/travel-orders/${selectedItem._id}/status`;

      if (!approverSignature) {
        Alert.alert('Signature Required', 'Please provide your signature to approve.');
        return;
      }
      const payload = { status, approverSignature };

      await axios.put(url, payload, { headers });

      Alert.alert('Success', `Request has been ${status.toLowerCase()}.`);
      setReviewModalVisible(false);
      setSelectedItem(null);
      fetchData(); // Refresh the list
    } catch (err) {
      Alert.alert('Error', 'Failed to update the request status.');
      console.error(err);
    }
  };

  const renderItem = (item: PassSlip | TravelOrder, type: ItemType) => (
    <Pressable key={item._id} style={styles.itemCard} onPress={() => handleOpenReview(item, type)}>
      <View style={[styles.itemCardTopBar, type === 'slip' ? styles.itemCardTopBarSlip : styles.itemCardTopBarOrder]} />
      {item.nextSigner?.viaOic && item.nextSigner.signerId === (user?.id || user?._id) && (
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

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="light" />
      <ImageBackground source={headerBgImage} style={styles.screenHeaderBg} imageStyle={styles.screenHeaderImageStyle}>
        <View style={[styles.screenHeaderOverlay, { paddingTop: insets.top + 12 }]}>
          <Image source={headerLogo} style={styles.screenHeaderLogo} />
          <View style={styles.screenHeaderInner}>
            <Text style={styles.screenHeaderTitle}>Dashboard</Text>
            <Text style={styles.screenHeaderSubtitle}>Program Head</Text>
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
            {selectedItem && (
              <View style={styles.modalContent}>
                {selectedItemType === 'slip' && (
                  <>
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
                      <Text style={styles.docField}>Date: <Text style={styles.docValue}>{formatDate((selectedItem as PassSlip).date)}</Text></Text>
                    </View>
                    <View style={styles.docMainTitleContainer}>
                      <Text style={styles.docMainTitle}>PASS SLIP</Text>
                      <Text style={styles.docSubTitle}>(Within Mati City)</Text>
                    </View>
                    <View style={styles.docRow}><Text style={styles.docField}>Name of Employee: <Text style={styles.docValue}>{selectedItem.employee?.name}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Time Out: <Text style={styles.docValue}>{(selectedItem as PassSlip).timeOut}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Estimated Time to be Back: <Text style={styles.docValue}>{(selectedItem as PassSlip).estimatedTimeBack}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Destination: <Text style={styles.docValue}>{(selectedItem as PassSlip).destination}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Purpose/s: <Text style={styles.docValue}>{selectedItem.purpose}</Text></Text></View>

                    <View style={styles.docSignatureContainer}>
                      <View style={styles.docSignatureBox}>
                        <Text style={styles.docField}>Requested by:</Text>
                        <View style={styles.chiefSignatureDisplay}>
                          {(selectedItem as PassSlip).signature ? (
                            <View style={styles.chiefSignatureImageContainer}>
                              <Image source={{ uri: (selectedItem as PassSlip).signature }} style={styles.docSignatureImage} />
                            </View>
                          ) : null}
                          <View style={styles.chiefSignatureNameContainer}>
                            <Text style={styles.docSignatureName}>{selectedItem.employee?.name}</Text>
                          </View>
                        </View>
                        <Text style={styles.docSignatureUnderline}>Faculty Staff</Text>
                      </View>
                      <View style={styles.docSignatureBox}>
                        <Text style={styles.docField}>Approved by:</Text>
                        <View style={styles.chiefSignatureDisplay}>
                          {approverSignature ? (
                            <View style={styles.chiefSignatureImageContainer}>
                              <Image source={{ uri: approverSignature }} style={styles.docSignatureImage} />
                              <Pressable style={styles.redoButton} onPress={() => setApproverSignature(null)}>
                                <FontAwesome name="undo" size={18} color={theme.primary} />
                              </Pressable>
                            </View>
                          ) : (
                            <View style={styles.chiefSignaturePlaceholderContainer}>
                              <View style={styles.signatureButtonsContainer}>
                                <Pressable style={styles.signatureButton} onPress={() => setSignatureType('draw')}>
                                  <FontAwesome name="pencil" size={24} color={theme.primary} />
                                </Pressable>
                                <Pressable style={styles.signatureButton} onPress={() => setSignatureType('upload')}>
                                  <FontAwesome name="upload" size={24} color={theme.primary} />
                                </Pressable>
                              </View>
                            </View>
                          )}
                          <View style={styles.chiefSignatureNameContainer}>
                            <Text style={styles.docSignatureName}>{user?.name}</Text>
                          </View>
                        </View>
                        <Text style={styles.docSignatureUnderline}>Immediate Head</Text>
                        {selectedItem?.nextSigner?.viaOic && selectedItem?.nextSigner?.originalName && (
                          <Text style={styles.docOicNote}>(OIC for {selectedItem.nextSigner.originalName})</Text>
                        )}
                      </View>
                    </View>
                  </>
                )}

                
                {selectedItemType === 'order' && selectedItem && (
                  <TravelOrderForm
                    order={selectedItem as TravelOrder}
                    presidentName={presidentName}
                    currentUserId={user?.id || user?._id}
                    approverSignature={approverSignature}
                    onRedoApproverSignature={() => setApproverSignature(null)}
                    onChooseSignature={(type) => setSignatureType(type)}
                  />
                )}
              </View>
            )}
          </ScrollView>
          <View style={styles.modalButtonContainer}>
            <Pressable 
              style={[
                styles.button, 
                styles.approveButton,
                (() => {
                  if (selectedItemType !== 'order' || !selectedItem) return false;
                  const order = selectedItem as TravelOrder;
                  const currentUserId = user?.id || user?._id;
                  const nextRecommender = order.recommendedBy?.[order.recommendersWhoApproved?.length || 0];
                  return (nextRecommender?._id !== currentUserId) && (nextRecommender?.id !== currentUserId);
                })() && styles.disabledButton
              ]} 
              onPress={handleSubmitToHR}
              disabled={(() => {
                if (selectedItemType !== 'order' || !selectedItem) return false;
                const order = selectedItem as TravelOrder;
                const currentUserId = user?.id || user?._id;
                const nextRecommender = order.recommendedBy?.[order.recommendersWhoApproved?.length || 0];
                return (nextRecommender?._id !== currentUserId) && (nextRecommender?.id !== currentUserId);
              })()}
            >
              <Text style={styles.buttonText}>{selectedItemType === 'slip' ? 'Approve' : 'Recommend'}</Text>
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
                  style={[styles.tab, activeTab === 'slips' && styles.activeTab]}
                  onPress={() => setActiveTab('slips')}
                >
                  <FontAwesome name="file-text-o" size={18} color={activeTab === 'slips' ? theme.primary : theme.textMuted} style={styles.tabIcon} />
                  <Text style={[styles.tabText, activeTab === 'slips' && styles.activeTabText]}>Pass Slips ({pendingSlips.length})</Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, activeTab === 'orders' && styles.activeTab]}
                  onPress={() => setActiveTab('orders')}
                >
                  <FontAwesome name="plane" size={18} color={activeTab === 'orders' ? theme.primary : theme.textMuted} style={styles.tabIcon} />
                  <Text style={[styles.tabText, activeTab === 'orders' && styles.activeTabText]}>Travel Orders ({pendingOrders.length})</Text>
                </Pressable>
              </View>
            </View>

            {activeTab === 'slips' && (
              pendingSlips.length > 0 ? (
                pendingSlips.map(item => renderItem(item, 'slip'))
              ) : (
                <Text style={styles.noRequestsText}>No pending pass slips.</Text>
              )
            )}

            {activeTab === 'orders' && (
              pendingOrders.length > 0 ? (
                pendingOrders.map(item => renderItem(item, 'order'))
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
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.primary,
  },
  tabContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.primary,
  },
  tabIcon: {
    marginRight: 0,
  },
  tabText: {
    fontSize: 14,
    color: theme.textMuted,
    fontWeight: '600',
  },
  activeTabText: {
    color: theme.primary,
    fontWeight: '700',
  },
  placeholderSignature: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 12,
    color: '#999',
  },
  waitingMessage: {
    fontSize: 10,
    color: '#d9534f',
    marginTop: 5,
    fontStyle: 'italic',
  },
  disabledButton: {
    backgroundColor: theme.textMuted,
    opacity: 0.8,
  },
  itemCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 },
      android: { elevation: 5 },
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
    backgroundColor: '#0d6efd',
  },
  itemCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  itemIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemIconWrapSlip: {
    backgroundColor: theme.primary,
  },
  itemIconWrapOrder: {
    backgroundColor: '#0d6efd',
  },
  itemHeaderText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
  },
  itemSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  itemBody: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  itemDetail: {
    fontSize: 14,
    color: theme.text,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '600',
    color: theme.primary,
  },
  itemButtonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  itemButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  itemButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  reviewButton: {
    backgroundColor: theme.primary,
  },
  approveButton: {
    backgroundColor: '#22c55e',
  },
  rejectButton: {
    backgroundColor: theme.danger,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 5,
    alignItems: 'center',
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
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    maxHeight: '95%',
    borderTopWidth: 4,
    borderTopColor: theme.accent,
  },
  rejectModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    color: theme.primary,
  },
  rejectModalSubtitle: {
    fontSize: 14,
    color: theme.textMuted,
    marginBottom: 12,
  },
  rejectCommentInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
    color: theme.text,
  },
  rejectModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rejectModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  rejectModalCancel: {
    backgroundColor: theme.textMuted,
  },
  rejectModalCancelText: {
    color: '#fff',
    fontWeight: '600',
  },
  rejectModalConfirm: {
    backgroundColor: theme.danger,
  },
  rejectModalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: theme.textMuted,
  },
  signatureButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  signatureButton: {
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 50,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(1,26,107,0.08)',
    marginHorizontal: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    color: theme.danger,
    textAlign: 'center',
  },
  signatureOverlay: {
    backgroundColor: theme.surface,
    zIndex: 9999,
  },
  signatureModalContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: theme.surface,
    justifyContent: 'center',
  },
  signatureCanvasWrapper: {
    height: 250,
    width: '100%',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalCancelButtonText: {
    fontSize: 16,
    color: theme.primary,
  },
  signatureActionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  signatureActionButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  signatureActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: theme.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalContent: {
    padding: 20,
    backgroundColor: theme.surface,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 25,
    color: theme.primary,
    textAlign: 'center',
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
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  docUniversityName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.primary,
  },
  docMotto: {
    fontSize: 10,
    fontStyle: 'italic',
    color: theme.textMuted,
  },
  docPassSlipHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.primary,
    marginTop: 5,
  },
  blueLine: {
    height: 2,
    backgroundColor: theme.primary,
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
    color: theme.text,
  },
  docValue: {
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    color: theme.primary,
  },
  docSignatureContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 40,
  },
  docSignatureBox: {
    width: '48%',
    alignItems: 'center',
  },
  docSignatureDisplay: {
    position: 'relative',
    alignSelf: 'flex-start',
    alignItems: 'center',
    marginBottom: 5,
    minHeight: 60,
  },
  chiefSignatureDisplay: {
    position: 'relative',
    width: '100%',
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  chiefSignatureImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chiefSignaturePlaceholderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chiefSignatureNameContainer: {
    alignSelf: 'center',
    alignItems: 'center',
    minWidth: 120,
  },
  docSignatureImage: {
    width: 100,
    height: 50,
  },
  docSignatureName: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  docOicNote: {
    fontSize: 11,
    fontStyle: 'italic',
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 2,
    width: '100%',
  },
  docSignatureUnderline: {
    borderTopWidth: 1,
    borderColor: theme.primary,
    textAlign: 'center',
    paddingTop: 2,
    fontSize: 12,
    color: theme.textMuted,
    width: '100%',
    marginTop: 4,
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
    backgroundColor: theme.surface,
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.primary,
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
    alignSelf: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#000',
    paddingBottom: 2,
    marginTop: 15,
  },
  signatureName: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
