import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Modal, TouchableOpacity, Image, ImageBackground, ScrollView, Alert, TextInput, Animated as RNAnimated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import Timer from '../../components/Timer';
import { useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { useState, useEffect, useCallback } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withRepeat } from 'react-native-reanimated';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config/api';
import { useSocket } from '../../config/SocketContext';
import { useCreateModalOptional } from '../../contexts/CreateModalContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { NotificationsModal, type Notification } from '../../components/NotificationsModal';
import TravelOrderForm from '../../components/TravelOrderForm';
import { getTravelOrderPrintHtml } from '../../utils/travelOrderPrintHtml';
import { getPassSlipPrintHtml } from '../../utils/passSlipPrintHtml';
import { assetToImageDataUri } from '../../utils/printImageDataUri';

const headerBgImage = require('../../assets/images/dorsubg3.jpg');
const headerLogo = require('../../assets/images/dorsulogo-removebg-preview (1).png');
/** Logos embedded as data URIs in PDF HTML (expo-print requires inline images). */
const printLogoPassSlip = require('../../assets/images/dorsulogo-removebg-preview (1).png');
const printLogoTravelOrder = require('../../assets/images/dorsulogo.png');

/** A4 page size for expo-print HTML→PDF (72 PPI; default is US Letter 612×792). */
const PRINT_A4_WIDTH_PX = 595;
const PRINT_A4_HEIGHT_PX = 842;

// Theme: match HrpDashboardScreen (primary blue, accent yellow)
const theme = {
  primary: '#011a6b',
  primaryDark: '#010d40',
  accent: '#fece00',
  surface: '#ffffff',
  background: '#ffffff',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
  success: '#22c55e',
  danger: '#dc3545',
  warning: '#fece00',
};

interface User {
  _id: string;
  name: string;
  role: string;
}

interface Submission {
  _id: string;
  type: 'Pass Slip' | 'Travel Order';
  date: string;
  status: string;
  employee: { name: string; role?: string; address?: string; employeeAddress?: string; };
  approvedBy?: { name: string; role?: string };
  /** Populated when the first-line approver slot was signed by an OIC. */
  approvedBySignedAsOicFor?: { _id: string; name?: string; role?: string } | null;
  /** President who signed (travel order); not the same as approvedBy (HR final approver). */
  presidentApprovedBy?: { name: string };
  /** Populated when the President's slot was signed by an OIC. */
  presidentSignedAsOicFor?: { _id: string; name?: string; role?: string } | null;
  recommendedBy?: { _id?: string; name: string; faculty?: string; campus?: string; }[];
  recommenderSignatures?: { user?: string | { _id?: string; name?: string }; signature?: string; signedAsOicFor?: { _id?: string; name?: string } | null }[];
  hrApprovedBy?: { name: string };
  purpose: string;
  additionalInfo?: string;
  qrCode?: string;
  destination?: string;
  timeOut?: string;
  estimatedTimeBack?: string;
  signature?: string;
  approverSignature?: string;
  hrApproverSignature?: string;
  to?: string;
  travelOrderNo?: string;
  travelOrderNoSignature?: string;
  departureSignature?: string;
  arrivalSignature?: string;
  presidentSignature?: string;
  salary?: string;
  departureDate?: string;
  arrivalDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  overdueMinutes?: number;
  trackingNo?: string;
  employeeAddress?: string;
  participants?: string[];
  rejectionReason?: string;
}

const formatDate = (dateString: string | undefined, includeTime: boolean = false) => {
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

/** Collapse whitespace/newlines to a single line (matches TravelOrderForm display of destination). */
const normalizeInline = (value: string | undefined | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'Approved':
    case 'President Approved':
      return styles.statusApproved;
    case 'Completed':
    case 'Verified':
    case 'Returned':
      return styles.statusCompleted;
    case 'Rejected':
    case 'Cancelled':
      return styles.statusRejected;
    default:
      return styles.statusPending;
  }
};

export default function SlipsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [isViewModalVisible, setViewModalVisible] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isQrModalVisible, setQrModalVisible] = useState(false);
  const [isScannerVisible, setScannerVisible] = useState(false);
  const [scanLineAnimation] = useState(new RNAnimated.Value(0));
  const [hasOngoingSubmission, setHasOngoingSubmission] = useState(false);
  const {
    notifications,
    fetchNotifications,
    addNotification,
    markNotificationRead,
    markAllRead,
    deleteNotification: deleteNotificationFromContext,
    deleteAllNotifications,
  } = useNotifications();
  const [isNotificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isCancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [itemToCancel, setItemToCancel] = useState<{ id: string; type: 'Pass Slip' | 'Travel Order' } | null>(null);
  const socket = useSocket();
  const insets = useSafeAreaInsets();
  const createModalContext = useCreateModalOptional();
  const [presidentName, setPresidentName] = useState('');
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
  const rotation = useSharedValue(0);

  useEffect(() => {
    createModalContext?.setHasOngoingSubmission(hasOngoingSubmission);
  }, [createModalContext, hasOngoingSubmission]);

  const toggleCardDetails = (id: string) => {
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  useEffect(() => {
    rotation.value = withRepeat(
      withSequence(
        withTiming(30, { duration: 150 }),
        withTiming(-30, { duration: 300 }),
        withTiming(0, { duration: 150 })
      ),
      -1,
      true
    );
  }, []);

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
    let animation: RNAnimated.CompositeAnimation | null = null;
    if (isScannerVisible) {
      animation = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(scanLineAnimation, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
          RNAnimated.timing(scanLineAnimation, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    }
    return () => {
      if (animation) {
        animation.stop();
      }
    };
  }, [isScannerVisible]);

  const generatePdf = async (item: Submission) => {
    let logoDataUri: string | undefined;
    try {
      logoDataUri = await assetToImageDataUri(item.type === 'Pass Slip' ? printLogoPassSlip : printLogoTravelOrder);
    } catch (e) {
      console.warn('PDF: could not load logo for embedding', e);
    }

    let html: string;
    if (item.type === 'Pass Slip') {
      html = getPassSlipPrintHtml(
        {
          date: item.date,
          status: item.status,
          trackingNo: item.trackingNo,
          destination: item.destination,
          employee: item.employee,
          timeOut: item.timeOut,
          estimatedTimeBack: item.estimatedTimeBack,
          arrivalTime: item.arrivalTime,
          overdueMinutes: item.overdueMinutes,
          additionalInfo: item.additionalInfo,
          purpose: item.purpose,
          signature: item.signature,
          approverSignature: item.approverSignature,
          approvedBy: item.approvedBy,
          rejectionReason: item.rejectionReason,
        },
        { viewerRole: user?.role, logoDataUri }
      );
    } else {
      html = getTravelOrderPrintHtml(
        item as Parameters<typeof getTravelOrderPrintHtml>[0],
        item.presidentApprovedBy?.name || presidentName || '',
        { logoDataUri }
      );
    }

    try {
      const { uri } = await Print.printToFileAsync({
        html,
        width: PRINT_A4_WIDTH_PX,
        height: PRINT_A4_HEIGHT_PX,
      });
      await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      Alert.alert('Error', 'Could not save the file.');
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
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
            } catch (err) {
              Alert.alert('Error', 'Failed to delete notification. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleOpenNotifications = () => {
    setNotificationsModalVisible(true);
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        router.replace('/');
        return;
      }
      const headers = { 'x-auth-token': token };

      const [userResponse, slipsResponse, ordersResponse] = await Promise.all([
        axios.get(`${API_URL}/users/me`, { headers }),
        axios.get(`${API_URL}/pass-slips/my-slips`, { headers }),
        axios.get(`${API_URL}/travel-orders/my-orders`, { headers }),
      ]);

      setUser(userResponse.data);
      await fetchNotifications();

      const combinedSubmissions = [
        ...slipsResponse.data.map((slip: any) => ({ ...slip, type: 'Pass Slip' })),
        ...ordersResponse.data.map((order: any) => ({ ...order, type: 'Travel Order' })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setSubmissions(combinedSubmissions);

      const ongoingStatuses = ['Pending', 'Recommended', 'Approved', 'Verified', 'For President Approval'];
      const hasOngoing = combinedSubmissions.some(s => ongoingStatuses.includes(s.status));
      setHasOngoingSubmission(hasOngoing);

    } catch (error) {
      console.error('Failed to fetch data:', error);
      // Optionally, show an error message to the user
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const handleCancel = (id: string, type: 'Pass Slip' | 'Travel Order') => {
    if (type === 'Pass Slip') {
      setItemToCancel({ id, type });
      setCancelModalVisible(true);
    } else {
      handleDelete(id, type);
    }
  };

  const submitCancellation = async () => {
    const reason = selectedReason === 'Other' ? cancellationReason : selectedReason;
    if (!itemToCancel || !reason) {
      Alert.alert('Error', 'Cancellation reason is required.');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const url = `${API_URL}/pass-slips/${itemToCancel.id}/cancel`;

      await axios.put(url, { cancellationReason: reason }, { headers });

      Alert.alert('Success', 'Your submission has been cancelled.');
      fetchData(); // Refresh the list
    } catch (err) {
      Alert.alert('Error', 'Failed to cancel the submission.');
      console.error(err);
    }

    setCancelModalVisible(false);
    setCancellationReason('');
    setSelectedReason('');
    setItemToCancel(null);
  };

  const handleDelete = async (id: string, type: 'Pass Slip' | 'Travel Order') => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this submission?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('userToken');
              const headers = { 'x-auth-token': token };
              const url = type === 'Pass Slip' ? `${API_URL}/pass-slips/${id}` : `${API_URL}/travel-orders/${id}`;

              await axios.delete(url, { headers });

              Alert.alert('Success', 'Your submission has been deleted.');
              fetchData(); // Refresh the list
            } catch (err) {
              Alert.alert('Error', 'Failed to delete the submission.');
              console.error(err);
            }
          },
        },
      ]
    );
  };

    useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    if (!socket) return;
    socket.on('newPassSlip', fetchData);
    socket.on('passSlipStatusUpdate', fetchData);
    socket.on('travelOrderDataChanged', fetchData);
    socket.on('passSlipVerified', fetchData);
    socket.on('passSlipReturned', fetchData);
    socket.on('passSlipDeleted', fetchData);
    return () => {
      socket.off('newPassSlip', fetchData);
      socket.off('passSlipStatusUpdate', fetchData);
      socket.off('travelOrderDataChanged', fetchData);
      socket.off('passSlipVerified', fetchData);
      socket.off('passSlipReturned', fetchData);
      socket.off('passSlipDeleted', fetchData);
    };
  }, [socket, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleTimeShort = (submissionId: string) => {
    const id = `time-short-${submissionId}`;
    if (notifications.some((n) => n._id === id)) return;
    addNotification({
      _id: id,
      message: 'Your time is running short. Please scan for arrival on time.',
      read: false,
      createdAt: new Date().toISOString(),
    });
  };

  const handleTimeOver = (submissionId: string) => {
    const id = `time-over-${submissionId}`;
    if (notifications.some((n) => n._id === id)) return;
    addNotification({
      _id: id,
      message: 'Warning: You are late. Please scan for arrival immediately.',
      read: false,
      createdAt: new Date().toISOString(),
    });
  };

  const renderPassSlipHistory = (status: string) => {
    const stages = user?.role === 'Program Head' 
      ? ['Faculty Dean', 'Human Resource', 'Security Personnel'] 
      : user?.role === 'Faculty Dean' 
        ? ['President', 'Human Resource', 'Security Personnel'] 
        : ['Program Head', 'Human Resource', 'Security Personnel'];
    let completedIndex = -1;
    let pendingIndex = -1;

    switch (status) {
      case 'Pending':
        pendingIndex = 0;
        break;
      case 'Recommended':
        completedIndex = 0;
        pendingIndex = 1;
        break;
      case 'Approved': // Approved by HR, pending at Security
        completedIndex = 1;
        pendingIndex = 2;
        break;
      case 'Completed':
        completedIndex = 2;
        break;
      case 'Rejected':
        break;
      default:
        break;
    }

    return renderHistoryStages(stages, completedIndex, pendingIndex);
  };

  const renderTravelOrderHistory = (status: string) => {
    // Make the first approver accurate based on who requested the document.
    // If requester is Program Head, the next/higher approver is the Faculty Dean.
    const firstStage =
      user?.role === 'Program Head'
        ? 'Faculty Dean'
        : user?.role === 'Faculty Dean'
          ? 'President'
          : 'Program Head';

    const stages = firstStage === 'President'
      ? ['President', 'Human Resource']
      : [firstStage, 'President', 'Human Resource'];
    let completedIndex = -1;
    let pendingIndex = -1;

    switch (status) {
      case 'Pending':
        pendingIndex = 0;
        break;
      case 'Recommended':
        completedIndex = 0;
        pendingIndex = 1;
        break;
      case 'For President Approval':
        completedIndex = 0;
        pendingIndex = 1;
        break;
      case 'President Approved':
        completedIndex = stages.length === 2 ? 0 : 1;
        pendingIndex = stages.length === 2 ? 1 : 2;
        break;
      case 'Approved':
        completedIndex = stages.length - 1;
        break;
      case 'Rejected':
        break;
      default:
        break;
    }

    return renderHistoryStages(stages, completedIndex, pendingIndex);
  };

  const renderHistoryStages = (stages: string[], completedIndex: number, pendingIndex: number) => (
    <View style={styles.historyContainer}>
      {stages.flatMap((stage, index) => {
        const isCompleted = index <= completedIndex;
        const isPending = index === pendingIndex;
        const segmentCompleted = index <= completedIndex;

        const nodeBlock = (
          <View key={`node-${index}`} style={styles.historyNodeBlock}>
            <View style={styles.historyDotWrap}>
              {isPending && (
                <View style={styles.historyDotOuterRing} />
              )}
              <View
                style={[
                  styles.historyDot,
                  isCompleted && styles.historyDotCompleted,
                  isPending && styles.historyDotPending,
                ]}
              >
                <View style={styles.historyDotInner} />
              </View>
            </View>
            <Text
              style={[
                styles.historyLabel,
                (isCompleted || isPending) && styles.historyLabelActive,
              ]}
              numberOfLines={2}
            >
              {stage}
            </Text>
          </View>
        );

        const lineSegment = index < stages.length - 1 ? (
          <View key={`line-${index}`} style={styles.historySegmentLineWrap}>
            <View
              style={[
                styles.historySegmentLine,
                segmentCompleted && styles.historySegmentLineCompleted,
              ]}
            />
          </View>
        ) : null;

        return lineSegment ? [nodeBlock, lineSegment] : [nodeBlock];
      })}
    </View>
  );

  const handleArrivalScan = async ({ data }: { data: string }) => {
    setScannerVisible(false);
    try {
      const parsedData = JSON.parse(data);
      const isPassSlip = parsedData.type === 'ReturnPassSlip';
      if (!isPassSlip) {
        Alert.alert('Invalid QR Code', 'This is not a valid return QR code.');
        return;
      }

      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const url = `${API_URL}/pass-slips/${parsedData.id}/return`;
      await axios.put(url, {}, { headers });

      Alert.alert('Success', 'You have successfully marked your return.');
      fetchData();
    } catch (err: any) {
      console.error('Arrival scan error:', err);
      const message = err?.response?.data?.message || 'Failed to process your return. Please try again.';
      Alert.alert('Error', message);
    }
  };

  const renderItem = ({ item }: { item: Submission }) => {
    const destinationRaw = item.type === 'Pass Slip' ? item.destination : item.to;
    const destination = destinationRaw ? normalizeInline(destinationRaw) : '';
    const isDetailsExpanded = expandedCardIds.has(item._id);
    return (
      <View style={styles.card}>
        <View style={[styles.cardTopBar, item.type === 'Pass Slip' ? styles.cardTopBarSlip : styles.cardTopBarOrder]} />
        <View style={[styles.cardHeader, item.type === 'Pass Slip' ? styles.cardHeaderSlip : styles.cardHeaderOrder]}>
          <View style={[styles.cardIconWrap, item.type === 'Pass Slip' ? styles.cardIconWrapSlip : styles.cardIconWrapOrder]}>
            <FontAwesome name={item.type === 'Pass Slip' ? 'file-text-o' : 'plane'} size={18} color="#fff" />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={[styles.cardTitle, item.type === 'Pass Slip' ? styles.cardTitleSlip : styles.cardTitleOrder]}>{item.type}</Text>
            <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
          </View>
          <Text style={[styles.statusPill, getStatusStyle(item.status)]}>{item.status}</Text>
        </View>
        <View style={styles.cardBody}>
          <Pressable style={styles.cardDetailsToggle} onPress={() => toggleCardDetails(item._id)}>
            <View style={styles.cardDetailsToggleHeader}>
              <FontAwesome name={isDetailsExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.primary} style={styles.cardDetailsChevron} />
              <Text style={styles.cardDetailsToggleLabel}>
                {isDetailsExpanded ? 'Hide' : 'Show'} location & purpose
              </Text>
            </View>
            {isDetailsExpanded && (
              <View style={styles.cardDetailsExpanded}>
                {destination ? (
                  <View style={styles.cardRow}>
                    <FontAwesome name="map-marker" size={14} color={theme.textMuted} style={styles.cardRowIcon} />
                    <Text style={styles.cardDestination}>{destination}</Text>
                  </View>
                ) : null}
                <View style={styles.cardRow}>
                  <FontAwesome name="info-circle" size={14} color={theme.textMuted} style={styles.cardRowIcon} />
                  <Text style={styles.cardPurpose}>{item.purpose}</Text>
                </View>
              </View>
            )}
            {!isDetailsExpanded && (destination || item.purpose) && (
              <Text style={styles.cardDetailsPreview} numberOfLines={1}>
                {[destination, item.purpose].filter(Boolean).join(' · ')}
              </Text>
            )}
          </Pressable>
          {(item.status === 'Rejected' || item.status === 'Cancelled') && (item.rejectionReason != null && String(item.rejectionReason).trim() !== '') ? (
            <View style={styles.cardRow}>
              <FontAwesome name="comment-o" size={14} color={theme.danger} style={styles.cardRowIcon} />
              <Text style={styles.rejectionReasonText} numberOfLines={2}>{String(item.rejectionReason).trim()}</Text>
            </View>
          ) : null}
          <View style={styles.historyWrapper}>
            {item.type === 'Pass Slip' ? renderPassSlipHistory(item.status) : renderTravelOrderHistory(item.status)}
          </View>
          {item.type === 'Pass Slip' && item.status === 'Verified' && item.departureTime && item.estimatedTimeBack && (
            <View style={styles.timerContainer}>
              <Text style={styles.timerLabel}>Time Remaining:</Text>
              <Timer timeOut={item.timeOut} estimatedTimeBack={item.estimatedTimeBack} departureTime={item.departureTime} onTimeShort={() => handleTimeShort(item._id)} onTimeOver={() => handleTimeOver(item._id)} />
            </View>
          )}
          {item.type === 'Pass Slip' && item.status === 'Returned' && typeof item.overdueMinutes === 'number' && item.overdueMinutes > 0 && (
            <View style={styles.overdueBox}>
              <FontAwesome name="exclamation-triangle" size={14} color={theme.danger} style={styles.cardRowIcon} />
              <Text style={styles.overdueText}>Overdue: {Math.round(item.overdueMinutes)} min added to time spent</Text>
            </View>
          )}
        </View>
        <View style={[styles.cardFooter, item.type === 'Pass Slip' ? styles.cardFooterSlip : styles.cardFooterOrder]}>
          <Pressable style={styles.viewButton} onPress={() => {
            setSelectedSubmission(item);
            setViewModalVisible(true);
          }}>
            <Text style={styles.viewButtonText}>View Details</Text>
          </Pressable>
          <View style={styles.rightButtonsContainer}>
            {item.status === 'Pending' && (
              <Pressable style={styles.cancelButtonSmall} onPress={() => handleCancel(item._id, item.type)}>
                <Text style={styles.cancelButtonTextSmall}>Cancel</Text>
              </Pressable>
            )}
            {item.type === 'Pass Slip' && item.status === 'Verified' && (
              <Pressable style={styles.scanArrivalButton} onPress={() => setScannerVisible(true)}>
                <FontAwesome name="camera" size={14} color="#fff" />
                <Text style={styles.scanArrivalButtonText}>Scan for Arrival</Text>
              </Pressable>
            )}
            {isHistoryItem(item) && (
              <Pressable style={styles.deleteButtonSmall} onPress={() => handleDelete(item._id, item.type)}>
                <FontAwesome name="trash-o" size={14} color="#fff" />
              </Pressable>
            )}
            {item.status === 'Returned' && (
              <Pressable style={styles.saveButton} onPress={() => generatePdf(item)}>
                <Text style={styles.saveButtonText}>Save File</Text>
              </Pressable>
            )}
            {item.type === 'Travel Order' && (item.status === 'Approved' || item.status === 'Completed') && (
              <Pressable style={styles.saveButton} onPress={() => generatePdf(item)}>
                <Text style={styles.saveButtonText}>Save File</Text>
              </Pressable>
            )}
            {item.type === 'Pass Slip' && (item.status === 'Approved' || item.status === 'Completed') && item.qrCode ? (
              <Pressable style={styles.qrButton} onPress={() => {
                setSelectedSubmission(item);
                setQrModalVisible(true);
              }}>
                <FontAwesome name="qrcode" size={18} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const isHistoryItem = (item: Submission) => {
    // Any terminal state (success or not) should live in History, not Active.
    const terminalStatuses = ['Completed', 'Returned', 'Rejected', 'Cancelled'];
    return terminalStatuses.includes(item.status);
  };

  const activeSubmissions = submissions.filter((s) => !isHistoryItem(s));
  const historySubmissions = submissions.filter((s) => isHistoryItem(s));

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="light" backgroundColor={theme.primary} />
      <ImageBackground source={headerBgImage} style={styles.screenHeaderBg} imageStyle={styles.screenHeaderImageStyle}>
        <View style={[styles.screenHeaderOverlay, { paddingTop: insets.top + 12 }]}>
          <Image source={headerLogo} style={styles.screenHeaderLogo} />
          <View style={styles.screenHeaderInner}>
            <Text style={styles.screenHeaderTitle}>My Slips</Text>
            <View style={styles.welcomeRow}>
              <Text style={styles.welcomeLabel}>Welcome, </Text>
              <Text style={styles.userName}>{user?.name?.split(' ')[0] || 'User'}</Text>
              <Animated.View style={[styles.handIcon, animatedStyle]}>
                <FontAwesome name="hand-paper-o" size={22} color={theme.accent} />
              </Animated.View>
            </View>
          </View>
          <TouchableOpacity style={styles.bellTouchable} onPress={handleOpenNotifications}>
            <FontAwesome name="bell-o" size={24} color="#fff" />
            {notifications.some(n => !n.read) && <View style={styles.notificationIndicator} />}
          </TouchableOpacity>
        </View>
      </ImageBackground>
      <View style={styles.contentContainer}>
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, activeTab === 'active' && styles.activeTab]}
            onPress={() => setActiveTab('active')}
          >
            <FontAwesome name="list-alt" size={18} color={activeTab === 'active' ? theme.primary : theme.textMuted} style={styles.tabIcon} />
            <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
              Active ({activeSubmissions.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'history' && styles.activeTab]}
            onPress={() => setActiveTab('history')}
          >
            <FontAwesome name="history" size={18} color={activeTab === 'history' ? theme.primary : theme.textMuted} style={styles.tabIcon} />
            <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
              History ({historySubmissions.length})
            </Text>
          </Pressable>
        </View>

        {(activeTab === 'active' ? activeSubmissions : historySubmissions).length > 0 ? (
          <FlatList
            data={activeTab === 'active' ? activeSubmissions : historySubmissions}
            renderItem={renderItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={{ paddingTop: 20, paddingBottom: (insets.bottom || 20) + 88 }}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
        ) : (
          <View style={styles.placeholderContainer}>
            {activeTab === 'active' ? (
              <>
                <Text style={styles.placeholderText}>You have no active submissions.</Text>
                <Text style={styles.placeholderSubText}>Completed pass slips and travel orders will appear in History.</Text>
              </>
            ) : (
              <>
                <Text style={styles.placeholderText}>No history yet.</Text>
                <Text style={styles.placeholderSubText}>Once your slip/order is completed, it will show up here.</Text>
              </>
            )}
          </View>
        )}
      </View>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isCancelModalVisible}
        onRequestClose={() => {
          setCancelModalVisible(false);
          setSelectedReason('');
          setCancellationReason('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cancel Submission</Text>
            <Text style={styles.modalText}>Please provide a reason for cancelling this pass slip.</Text>
            {selectedReason !== 'Other' &&
              ['Change of plans', 'Emergency', 'Incorrect details', 'Other'].map(reason => (
                <TouchableOpacity key={reason} style={[styles.reasonOption, selectedReason === reason && styles.reasonOptionSelected]} onPress={() => setSelectedReason(reason)}>
                  <Text style={[styles.reasonOptionText, selectedReason === reason && styles.reasonOptionTextSelected]}>{reason}</Text>
                </TouchableOpacity>
              ))
            }
            {selectedReason === 'Other' && (
              <TextInput
                style={styles.reasonInput}
                placeholder="Please specify your reason"
                value={cancellationReason}
                onChangeText={setCancellationReason}
                multiline
              />
            )}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => {
                  if (selectedReason === 'Other') {
                    setSelectedReason('');
                    setCancellationReason('');
                  } else {
                    setCancelModalVisible(false);
                    setSelectedReason('');
                    setCancellationReason('');
                  }
                }}
              >
                <Text style={styles.cancelButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitModalButton]}
                onPress={submitCancellation}
              >
                <Text style={styles.submitButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isViewModalVisible}
        onRequestClose={() => setViewModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Submission Details</Text>
            {selectedSubmission && (
              <ScrollView
                horizontal
                nestedScrollEnabled
                directionalLockEnabled
                showsHorizontalScrollIndicator
                keyboardShouldPersistTaps="handled"
                style={styles.modalContentHorizontalScroll}
                contentContainerStyle={styles.modalContentHorizontalScrollContent}
              >
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  style={[
                    styles.modalContentBodyVerticalScroll,
                    { minWidth: '100%' },
                  ]}
                  contentContainerStyle={styles.modalContentBodyVerticalScrollContent}
                >
                {selectedSubmission.type === 'Pass Slip' && (
                  <>
                    <View style={styles.docHeader}>
                      <View>
                        <View style={styles.blueLine} />
                        <Text style={styles.docUniversityName}>DAVAO ORIENTAL</Text>
                        <Text style={styles.docUniversityName}>STATE UNIVERSITY</Text>
                        <Text style={styles.docMotto}>"A university of excellence, innovation, and inclusion"</Text>
                        <View style={styles.blueLine} />
                        <Text style={styles.docPassSlipHeader}>{selectedSubmission.type.toUpperCase()}</Text>
                      </View>
                      <Image source={require('../../assets/images/dorsulogo-removebg-preview (1).png')} style={styles.docLogo} />
                    </View>
                    <View style={styles.docMetaRow}>
                      {selectedSubmission.trackingNo && (
                        <Text style={styles.docField}>Tracking No.: <Text style={styles.docValue}>{selectedSubmission.trackingNo}</Text></Text>
                      )}
                      <Text style={styles.docField}>Date: <Text style={styles.docValue}>{selectedSubmission.date ? new Date(selectedSubmission.date).toLocaleDateString() : 'No Date'}</Text></Text>
                    </View>
                    <View style={styles.docMainTitleContainer}>
                      <Text style={styles.docMainTitle}>PASS SLIP</Text>
                      <Text style={styles.docSubTitle}>(Within Mati City)</Text>
                    </View>
                    <View style={styles.docRow}><Text style={styles.docField}>Name of Employee: <Text style={styles.docValue}>{selectedSubmission.employee?.name}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Time Out: <Text style={styles.docValue}>{selectedSubmission.timeOut}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Estimated Time to be Back: <Text style={styles.docValue}>{selectedSubmission.estimatedTimeBack}</Text></Text></View>
                    {selectedSubmission.arrivalTime && (
                      <View style={styles.docRow}><Text style={styles.docField}>Actual Time Back: <Text style={styles.docValue}>{new Date(selectedSubmission.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text></Text></View>
                    )}
                    {typeof selectedSubmission.overdueMinutes === 'number' && selectedSubmission.overdueMinutes > 0 && (
                      <View style={styles.docRow}><Text style={styles.docField}>Overdue: <Text style={[styles.docValue, styles.overdueValue]}>{Math.round(selectedSubmission.overdueMinutes)} min</Text></Text></View>
                    )}
                    <View style={styles.docRow}><Text style={styles.docField}>Additional Information: <Text style={styles.docValue}>{selectedSubmission.additionalInfo}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Purpose/s: <Text style={styles.docValue}>{selectedSubmission.purpose}</Text></Text></View>

                    {(selectedSubmission.status === 'Approved' || selectedSubmission.status === 'Completed' || selectedSubmission.status === 'Verified') && (
                      <View style={styles.approvedStampContainer}>
                        <Text style={styles.approvedStamp}>APPROVED</Text>
                      </View>
                    )}
                    {selectedSubmission.status === 'Rejected' && (
                      <>
                        <View style={styles.rejectedStampContainer}>
                          <Text style={styles.rejectedStamp}>REJECTED</Text>
                        </View>
                        {(selectedSubmission.rejectionReason != null && String(selectedSubmission.rejectionReason).trim() !== '') && (
                          <View style={styles.rejectionReasonBlock}>
                            <Text style={styles.rejectionReasonLabel}>Reason: </Text>
                            <Text style={styles.rejectionReasonContent}>{String(selectedSubmission.rejectionReason).trim()}</Text>
                          </View>
                        )}
                      </>
                    )}
                    <View style={styles.docSignatureContainer}>
                      <View style={styles.docSignatureBox}>
                        <Text style={styles.docField}>Requested by:</Text>
                        <View style={styles.docSignatureDisplay}>
                          {selectedSubmission.signature && <Image source={{ uri: selectedSubmission.signature }} style={styles.docSignatureImage} />}
                          <Text style={styles.docSignatureName}>{selectedSubmission.employee?.name}</Text>
                        </View>
                                                <Text style={styles.docSignatureUnderline}>{user?.role === 'Program Head' ? 'Program Head' : user?.role === 'Faculty Dean' ? 'Faculty Dean' : 'Faculty Staff'}</Text>
                      </View>
                      <View style={styles.docSignatureBox}>
                        <Text style={styles.docField}>Approved by:</Text>
                        <View style={styles.docSignatureDisplay}>
                          {selectedSubmission.approverSignature && <Image source={{ uri: selectedSubmission.approverSignature }} style={styles.docSignatureImage} />}
                          <Text style={styles.docSignatureName}>{selectedSubmission.approvedBy?.name || 'N/A'}</Text>
                        </View>
                                                <Text style={styles.docSignatureUnderline}>{user?.role === 'Program Head' ? 'Faculty Dean' : user?.role === 'Faculty Dean' ? 'President' : 'Immediate Head'}</Text>
                        {selectedSubmission.approvedBySignedAsOicFor?.name && (
                          <Text style={styles.docOicNote}>(OIC for {selectedSubmission.approvedBySignedAsOicFor.name})</Text>
                        )}
                      </View>
                    </View>
                  </>
                )}

                {selectedSubmission.type === 'Travel Order' && (
                  <>
                    <View style={styles.travelOrderFormWrapper}>
                      <TravelOrderForm
                        order={selectedSubmission as any}
                        presidentName={selectedSubmission.presidentApprovedBy?.name || presidentName}
                        currentUserId={user?._id}
                        approverSignature={selectedSubmission.approverSignature || null}
                        onRedoApproverSignature={() => {}}
                        onChooseSignature={() => {}}
                      />
                    </View>

                {selectedSubmission.status === 'Rejected' && (
                  <>
                    <View style={styles.rejectedStampContainer}>
                      <Text style={styles.rejectedStamp}>REJECTED</Text>
                    </View>
                    {(selectedSubmission.rejectionReason != null && String(selectedSubmission.rejectionReason).trim() !== '') && (
                      <View style={styles.rejectionReasonBlock}>
                        <Text style={styles.rejectionReasonLabel}>Reason: </Text>
                        <Text style={styles.rejectionReasonContent}>{String(selectedSubmission.rejectionReason).trim()}</Text>
                      </View>
                    )}
                  </>
                )}
                  </>
                )}
                </ScrollView>
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setViewModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isQrModalVisible}
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.qrModalContent}>
            <Text style={styles.modalTitle}>Scan for Verification</Text>
            {selectedSubmission?.qrCode && (
              <Image source={{ uri: selectedSubmission.qrCode }} style={styles.qrCodeImage} />
            )}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
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


      <Modal
        visible={isScannerVisible}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setScannerVisible(false)}
      >
        <View style={styles.scannerContainer}>
          <CameraView
            onBarcodeScanned={isScannerVisible ? handleArrivalScan : undefined}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.overlayTop} />
            <View style={styles.overlayMiddle}>
              <View style={styles.overlaySide} />
              <View style={styles.scanBox}>
                <RNAnimated.View
                  style={[
                    styles.scanLine,
                    {
                      transform: [
                        {
                          translateY: scanLineAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 248],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </View>
              <View style={styles.overlaySide} />
            </View>
            <View style={styles.overlayBottom}>
              <Text style={styles.scannerText}>Place QR code within the frame</Text>
            </View>
          </View>
          <Pressable style={styles.scannerCloseButton} onPress={() => setScannerVisible(false)}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  universityNameContainer: {
    flex: 1,
  },
  headerLine: {
    height: 2,
    backgroundColor: theme.primary,
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
    color: theme.primary,
  },
  universityMotto: {
    fontSize: 8,
    fontStyle: 'italic',
  },
  docHeaderRight: {
    borderWidth: 1,
    borderColor: theme.primary,
    maxWidth: '45%',
  },
  docInfoBoxHeader: {
    backgroundColor: theme.primary,
    padding: 4,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#34495e',
  },
  docInfoBoxContent: {
    backgroundColor: theme.surface,
    padding: 4,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: theme.primary,
  },
  docInfoTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  docInfoContent: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.text,
  },
  docInfoColumnsContainer: {
    flexDirection: 'row',
    backgroundColor: theme.border,
  },
  docInfoColumnHeader: {
    flex: 1,
    padding: 4,
    textAlign: 'center',
    borderRightWidth: 1,
    borderColor: theme.border,
    fontSize: 8,
    color: theme.textMuted,
    backgroundColor: theme.border,
  },
  docInfoColumnValue: {
    flex: 1,
    padding: 4,
    textAlign: 'center',
    borderRightWidth: 1,
    borderColor: theme.border,
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: theme.surface,
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
  signatureBlock: {
    marginBottom: 20,
  },
  recommenderChiefBlock: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  chiefSignatureDisplay: {
    position: 'relative',
    alignSelf: 'flex-start',
    alignItems: 'center',
    marginBottom: 2,
  },
  chiefSignatureImageContainer: {
    position: 'absolute',
    top: -5,
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chiefSignatureNameContainer: {
    alignSelf: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#000',
    paddingBottom: 2,
    marginTop: 14,
  },
  chiefSignatureLabel: {
    marginTop: 2,
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
  signatureTitle: {
    fontSize: 14,
    color: '#333',
  },
  mainContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  screenHeaderBg: {
    width: '100%',
    minHeight: 120,
  },
  screenHeaderImageStyle: {
    resizeMode: 'cover',
  },
  screenHeaderOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 4,
    borderBottomColor: theme.accent,
    backgroundColor: 'rgba(1,26,107,0.82)',
    minHeight: 120,
  },
  screenHeaderLogo: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  screenHeaderInner: {
    flex: 1,
  },
  screenHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  welcomeLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  handIcon: {
    marginLeft: 6,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  bellTouchable: {
    padding: 8,
  },
  contentContainer: {
    flex: 1,
    padding: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.surface,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 12,
    overflow: 'hidden',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsContainer: {
    marginBottom: 30,
  },
  actionButton: {
    backgroundColor: '#003366',
    padding: 25,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 15,
  },
  actionText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  recentActivityContainer: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  createButton: {
    position: 'absolute',
    right: 20,
    backgroundColor: theme.accent,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    textAlign: 'center',
  },
  placeholderSubText: {
    fontSize: 14,
    color: theme.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    marginVertical: 10,
    marginHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#011a6b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTopBar: {
    height: 4,
    width: '100%',
  },
  cardTopBarSlip: {
    backgroundColor: theme.accent,
  },
  cardTopBarOrder: {
    backgroundColor: theme.primaryDark,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  cardHeaderSlip: {
    backgroundColor: 'rgba(254,206,0,0.1)',
  },
  cardHeaderOrder: {
    backgroundColor: 'rgba(1,26,107,0.08)',
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardIconWrapSlip: {
    backgroundColor: theme.primary,
  },
  cardIconWrapOrder: {
    backgroundColor: theme.primaryDark,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cardTitleSlip: {
    color: theme.primaryDark,
  },
  cardTitleOrder: {
    color: theme.primary,
  },
  cardDate: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 3,
  },
  statusPill: {
    fontSize: 11,
    fontWeight: '600',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardBody: {
    padding: 18,
    backgroundColor: theme.surface,
  },
  cardDetailsToggle: {
    marginBottom: 10,
  },
  cardDetailsToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardDetailsChevron: {
    marginRight: 6,
  },
  cardDetailsToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  cardDetailsExpanded: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  cardDetailsPreview: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardRowIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  cardDestination: {
    flex: 1,
    fontSize: 14,
    color: theme.text,
    fontWeight: '500',
  },
  cardPurpose: {
    flex: 1,
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 20,
  },
  timerContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  timerLabel: {
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: 5,
  },
  overdueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220,53,69,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220,53,69,0.35)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  overdueText: {
    flex: 1,
    color: theme.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  overdueValue: {
    color: theme.danger,
    fontWeight: '700',
  },
  historyWrapper: {
    width: '100%',
    alignItems: 'center',
    marginTop: 14,
  },
  historyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: 280,
  },
  historyNodeBlock: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  historyDotWrap: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyDotOuterRing: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(254,206,0,0.35)',
  },
  historyDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyDotCompleted: {
    backgroundColor: theme.success,
  },
  historyDotPending: {
    backgroundColor: theme.accent,
  },
  historyDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  historyLabel: {
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
  },
  historyLabelActive: {
    color: theme.primary,
    fontWeight: '600',
  },
  historySegmentLineWrap: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
    marginHorizontal: -22,
    minWidth: 8,
  },
  historySegmentLine: {
    height: 2,
    width: '100%',
    backgroundColor: theme.border,
  },
  historySegmentLineCompleted: {
    backgroundColor: theme.success,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: 14,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  cardFooterSlip: {
    backgroundColor: 'rgba(254,206,0,0.06)',
  },
  cardFooterOrder: {
    backgroundColor: 'rgba(1,26,107,0.04)',
  },
  rightButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  statusApproved: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusCompleted: {
    backgroundColor: 'rgba(1,26,107,0.12)',
    color: theme.primary,
  },
  statusRejected: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  viewButton: {
    backgroundColor: theme.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginRight: 8,
  },
  viewButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButtonSmall: {
    backgroundColor: theme.danger,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 4,
  },
  cancelButtonTextSmall: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  deleteButtonSmall: {
    backgroundColor: theme.textMuted,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 4,
  },
  deleteButtonTextSmall: {
    color: '#fff',
    fontWeight: '600',
  },
  scanArrivalButton: {
    backgroundColor: theme.success,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 4,
  },
  scanArrivalButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: theme.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  qrButton: {
    backgroundColor: theme.primaryDark,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddle: {
    height: 250,
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: theme.accent,
    borderRadius: 10,
    overflow: 'hidden',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanLine: {
    width: '100%',
    height: 2,
    backgroundColor: '#00ff00',
    shadowColor: '#00ff00',
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  scannerText: {
    color: 'white',
    fontSize: 16,
    marginTop: 20,
  },
  scannerCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 20,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  statusPending: {
    backgroundColor: 'rgba(254,206,0,0.25)',
    color: theme.primaryDark,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '94%',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    minHeight: 0,
  },
  modalContentHorizontalScroll: {
    width: '100%',
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  modalContentHorizontalScrollContent: {
    flexGrow: 1,
  },
  modalContentBodyVerticalScroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  modalContentBodyVerticalScrollContent: {
    paddingBottom: 28,
  },
  travelOrderFormWrapper: {
    minWidth: 420,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 25,
    color: theme.primary,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalOptionText: {
    fontSize: 18,
    marginLeft: 20,
    color: theme.text,
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: 25,
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 25,
    alignSelf: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  modalText: {
    fontSize: 16,
    marginBottom: 15,
    textAlign: 'center',
    color: theme.textMuted,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 10,
    width: '100%',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    alignItems: 'center',
  },
  cancelModalButton: {
    backgroundColor: theme.textMuted,
    marginRight: 10,
  },
  submitModalButton: {
    backgroundColor: theme.primary,
  },
  submitButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  reasonOption: {
    width: '100%',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  reasonOptionSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  reasonOptionText: {
    textAlign: 'center',
    fontSize: 16,
    color: theme.text,
  },
  reasonOptionTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  // Document Preview Styles
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
  docMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  sectionText: {
    fontSize: 16,
    color: theme.text,
    marginVertical: 15,
  },
  staticText: {
    fontSize: 14,
    color: theme.textMuted,
    marginVertical: 10,
    fontStyle: 'italic',
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
  },
  docSignatureDisplay: {
    height: 60,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 5,
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
  disabledCreateButton: {
    backgroundColor: theme.textMuted,
    opacity: 0.8,
  },
  docOicNote: {
    fontSize: 11,
    fontStyle: 'italic',
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  docSignatureUnderline: {
    borderTopWidth: 1,
    borderColor: theme.primary,
    textAlign: 'center',
    paddingTop: 2,
    fontSize: 12,
    color: theme.textMuted,
  },
  qrModalContent: {
    width: '80%',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 25,
    alignItems: 'center',
    borderTopWidth: 4,
    borderTopColor: theme.accent,
  },
  qrCodeImage: {
    width: 250,
    height: 250,
    marginBottom: 20,
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
  approvedStampContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -100 }, { translateY: -50 }, { rotate: '-30deg' }],
    zIndex: 1000,
  },
  approvedStamp: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'rgba(0, 128, 0, 0.7)', // Green color
    borderWidth: 4,
    borderColor: 'rgba(0, 128, 0, 0.7)', // Green border
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  rejectionReasonText: {
    fontSize: 13,
    color: '#721c24',
    flex: 1,
  },
  rejectionReasonBlock: {
    marginTop: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: 'rgba(220,53,69,0.1)',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: theme.danger,
  },
  rejectionReasonLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#721c24',
    marginBottom: 4,
  },
  rejectionReasonContent: {
    fontSize: 14,
    color: '#721c24',
  },
  rejectedStampContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -100 }, { translateY: -50 }, { rotate: '-30deg' }],
    zIndex: 1000,
  },
  rejectedStamp: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'rgba(255, 0, 0, 0.7)', // Red color
    borderWidth: 4,
    borderColor: 'rgba(255, 0, 0, 0.7)', // Red border
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
