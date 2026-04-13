import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, SafeAreaView, Platform, Image, TextInput } from 'react-native';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Timer from '../components/Timer';
import { Modal } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import SignatureCanvas from 'react-signature-canvas';
import { FontAwesome } from '@expo/vector-icons';
import { MapContainer, TileLayer, Marker, Polyline as LeafletPolyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import polyline from '@mapbox/polyline';
import { API_URL, API_BASE_URL } from '../config/api';
import { FEATURE_CTC_ENABLED } from '../config/featureFlags';
import { useSocket } from '../config/SocketContext';
import { getTravelOrderPrintHtml } from '../utils/travelOrderPrintHtml';
import TravelOrderFormWeb from '../components/TravelOrderFormWeb';
import MonitoringApprovedTravelOrdersCard, { ApprovedTravelOrder } from '../components/MonitoringApprovedTravelOrdersCard';
import HrpReportsAnalytics from '../components/HrpReportsAnalytics';
import { styles } from './HrpDashboardScreen.styles';
import { profilePictureUri } from '../utils/profilePictureUri';

// --- Type Definitions ---
interface Employee {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  campus?: string;
  faculty?: string;
  department?: string;
  role?: string;
}

interface PassSlip {
  _id: string;
  employee: Employee;
  date: string;
  timeOut: string;
  estimatedTimeBack: string;
  destination: string;
  purpose: string;
  status: string;
  approvedBy: Employee;
  hrApprovedBy?: Employee;
  signature?: string;
  approverSignature?: string;
  hrApproverSignature?: string;
  departureTime?: string;
  arrivalTime?: string;
  latitude?: number;
  longitude?: number;
  routePolyline?: string;
  trackingNo?: string;
  arrivalStatus?: string;
}

interface TravelOrder {
  _id: string;
  employee: Employee;
  travelOrderNo: string;
  date: string;
  address: string;
  salary: string;
  to: string;
  purpose: string;
  departureDate: string;
  arrivalDate: string;
  additionalInfo: string;
  timeOut?: string;
  status: string;
  recommendedBy: Employee[];
  approvedBy?: Employee;
  hrApprovedBy?: Employee; // Added for type consistency, though travel orders use approvedBy for HR approval
  presidentApprovedBy?: Employee;
  signature?: string;
  approverSignature?: string;
  presidentSignature?: string;
  departureTime?: string;
  arrivalTime?: string;
  estimatedTimeBack?: string; // Added for type consistency, though travel orders don't use this field
  latitude?: number;
  longitude?: number;
  routePolyline?: string;
  arrivalStatus?: string;
  employeeAddress?: string;
  participants?: string[];
  recommenderSignatures?: { user?: string; signature?: string }[];
  recommendersWhoApproved?: string[];
}

type MonitoringPassSlip = PassSlip & { type: 'slip' };
type MonitoringItem = MonitoringPassSlip;

type ItemType = 'slip' | 'order';

type RootStackParamList = {
  Login: undefined;
  HrpDashboard: undefined;
  Profile: undefined;
};

type HrpDashboardNavigationProp = StackNavigationProp<RootStackParamList, 'HrpDashboard'>;

const formatDate = (dateString: string, includeTime: boolean = false) => {
  if (!dateString) return 'No Date';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  if (includeTime) {
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  }
  return date.toLocaleDateString();
};

const formatDateLong = (dateString?: string) => {
  if (!dateString) return '________________';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '________________';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

/** Coordinator / first recommender signature (CTC modal; unused while FEATURE_CTC_ENABLED is false). */
const getCoordinatorSignature = (order: ApprovedTravelOrder | null): string | undefined => {
  if (!order) return undefined;
  const first = order.recommendedBy?.[0];
  const firstId = first?._id ? String(first._id) : '';
  if (firstId && order.recommenderSignatures?.length) {
    const found = order.recommenderSignatures.find((rs) => String(rs.user) === firstId);
    if (found?.signature) return found.signature;
  }
  if (order.recommenderSignatures?.length === 1 && order.recommenderSignatures[0]?.signature) {
    return order.recommenderSignatures[0].signature;
  }
  return order.approverSignature;
};

const buildTravelOrderWebView = (o: TravelOrder) => ({
  _id: o._id,
  employee: o.employee,
  purpose: o.purpose,
  to: o.to,
  date: o.date,
  travelOrderNo: o.travelOrderNo,
  employeeAddress: o.employeeAddress,
  salary: o.salary || '',
  departureDate: o.departureDate,
  arrivalDate: o.arrivalDate,
  additionalInfo: o.additionalInfo || '',
  recommendedBy: o.recommendedBy?.map((e) => ({ _id: e._id, id: e._id, name: e.name || '' })),
  recommenderSignatures: o.recommenderSignatures,
  recommendersWhoApproved: o.recommendersWhoApproved,
  approverSignature: o.approverSignature,
  participants: o.participants,
  presidentSignature: o.presidentSignature,
  presidentApprovedBy: o.presidentApprovedBy ? { name: o.presidentApprovedBy.name } : undefined,
  approvedBy: o.approvedBy ? { _id: o.approvedBy._id, name: o.approvedBy.name } : undefined,
  latitude: o.latitude,
  longitude: o.longitude,
});

// --- Main Component ---
const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const webStyles = {
  filterSelect: {
    marginRight: 10,
    padding: 8,
    borderRadius: 5,
    border: '1px solid #ccc',
  },
  recordsFilterSelect: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    fontSize: 14,
    color: '#334155',
    minWidth: 160,
    cursor: 'pointer',
  },
};

const campuses = ['All Campuses', 'Main Campus', 'Baganga Campus', 'Banaybanay Campus', 'Cateel Campus', 'San Isidro Campus', 'Tarragona Campus'];
const faculties = ['All Faculties', 'Faculty of Agriculture and Life Sciences', 'Faculty of Computing, Engineering, and Technology', 'Faculty of Criminal Justice Education', 'Faculty of Nursing and Allied Health Sciences', 'Faculty of Humanities, Social Science, and Communication', 'Faculty of Teacher Education', 'Faculty of Business Management'];

const destIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const SidebarScroll = ({ narrow, children }: { narrow: boolean; children: React.ReactNode }) => {
  if (!narrow) {
    return <>{children}</>;
  }
  return (
    <ScrollView
      style={styles.sidebarDrawerScroll}
      contentContainerStyle={styles.sidebarDrawerScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
};

const HrpDashboardScreen = () => {
  const { isNarrow, isCompact } = useResponsiveLayout();

  const [forReviewItems, setForReviewItems] = useState<(PassSlip | TravelOrder)[]>([]);
  const [verifiedSlips, setVerifiedSlips] = useState<PassSlip[]>([]);
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([]);
  const [monitoringApprovedTravelOrders, setMonitoringApprovedTravelOrders] = useState<ApprovedTravelOrder[]>([]);
  const [records, setRecords] = useState<(PassSlip | TravelOrder)[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<(PassSlip | TravelOrder)[]>([]);
  const [campusFilter, setCampusFilter] = useState('All Campuses');
  const [facultyFilter, setFacultyFilter] = useState('All Faculties');
  const [fileTypeFilter, setFileTypeFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigation = useNavigation<HrpDashboardNavigationProp>();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PassSlip | TravelOrder | MonitoringItem | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ItemType | null>(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [monitoringSubView, setMonitoringSubView] = useState<'slip' | 'order'>('slip');
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [travelOrderNoSignature, setTravelOrderNoSignature] = useState<string | null>(null);
  const [departureSignature, setDepartureSignature] = useState<string | null>(null);
  const [arrivalSignature, setArrivalSignature] = useState<string | null>(null);
  const [activeSignatureField, setActiveSignatureField] = useState<'travelOrderNo' | 'departure' | 'arrival' | null>(null);
  const [travelOrderNoInput, setTravelOrderNoInput] = useState('');
  const [trackingNoInput, setTrackingNoInput] = useState('');
  let sigPad = React.useRef<any>({});
  const [isSignatureModalVisible, setIsSignatureModalVisible] = useState(false);
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [mapData, setMapData] = useState<{ lat: number; lon: number; polyline: Array<[number, number]> | null, startLat: number | null, startLon: number | null, startName: string | null, destName: string | null } | null>(null);
  const socket = useSocket();
  const [activeTab, setActiveTab] = useState<'slips' | 'orders'>('slips');
  const [presidentName, setPresidentName] = useState('');
  const [hrSignatureForPresident, setHrSignatureForPresident] = useState<string | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [isCtcModalVisible, setIsCtcModalVisible] = useState(false);
  const [selectedCtcOrder, setSelectedCtcOrder] = useState<ApprovedTravelOrder | null>(null);
  /** Set when Travel Complete is pressed so the certificate date reflects that moment */
  const [ctcIssueDateIso, setCtcIssueDateIso] = useState('');
  const [completingTravelOrderId, setCompletingTravelOrderId] = useState<string | null>(null);
  const [markCompleteModalVisible, setMarkCompleteModalVisible] = useState(false);
  const [orderPendingComplete, setOrderPendingComplete] = useState<ApprovedTravelOrder | null>(null);
  /** Result after mark-complete API (replaces browser alert on web) */
  const [markCompleteFeedback, setMarkCompleteFeedback] = useState<{ variant: 'success' | 'error'; message: string } | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const dismissMobileSidebar = useCallback(() => {
    if (isNarrow) setMobileSidebarOpen(false);
  }, [isNarrow]);

  useEffect(() => {
    if (!isNarrow) setMobileSidebarOpen(false);
  }, [isNarrow]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!isNarrow || !mobileSidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isNarrow, mobileSidebarOpen]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!isNarrow || !mobileSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isNarrow, mobileSidebarOpen]);

  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };

      const [slipsResponse, ordersResponse, presidentApprovedOrdersResponse, verifiedSlipsResponse, approvedOrdersResponse] = await Promise.all([
        axios.get<PassSlip[]>(`${API_URL}/pass-slips/recommended`, { headers }),
        axios.get<TravelOrder[]>(`${API_URL}/travel-orders/recommended`, { headers }),
        axios.get<TravelOrder[]>(`${API_URL}/travel-orders/hr-approved`, { headers }), // Fetches President Approved orders
        axios.get<PassSlip[]>(`${API_URL}/pass-slips/verified-hr`, { headers }),
        axios.get<ApprovedTravelOrder[]>(`${API_URL}/travel-orders/approved`, { headers }),
      ]);

      const allSlips = slipsResponse.data;
      const allOrders = [...ordersResponse.data, ...presidentApprovedOrdersResponse.data];

      // Items needing HR review/approval
      setForReviewItems([...allSlips, ...allOrders]);

      // Items for monitoring
      const verifiedSlips = verifiedSlipsResponse.data.map(item => ({ ...item, type: 'slip' as const }));
      setMonitoringItems([...verifiedSlips]);

      // Active (Approved) travel orders for monitoring
      setMonitoringApprovedTravelOrders(
        (approvedOrdersResponse.data || []).filter((o) => o.status === 'Approved')
      );

      const recordsResponse = await axios.get(`${API_URL}/records`, { headers });
      setRecords(recordsResponse.data);
      setFilteredRecords(recordsResponse.data);

    } catch (err) {
      setError('Failed to fetch requests. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      fetchUserData();
    }, [])
  );

  useEffect(() => {
    if (!socket) return;

    const handleDataUpdate = () => {
      fetchData();
    };

    socket.on('passSlipStatusUpdate', handleDataUpdate);
    socket.on('passSlipVerified', handleDataUpdate);
    socket.on('passSlipReturned', handleDataUpdate);
    socket.on('travelOrderDataChanged', handleDataUpdate);
    socket.on('passSlipDeleted', handleDataUpdate);
    socket.on('travelOrderDeleted', handleDataUpdate);

    return () => {
      socket.off('passSlipStatusUpdate', handleDataUpdate);
      socket.off('passSlipVerified', handleDataUpdate);
      socket.off('passSlipReturned', handleDataUpdate);
      socket.off('travelOrderDataChanged', handleDataUpdate);
      socket.off('passSlipDeleted', handleDataUpdate);
      socket.off('travelOrderDeleted', handleDataUpdate);
    };
  }, [socket]);

  useEffect(() => {
    let tempRecords = records;

    if (campusFilter && campusFilter !== 'All Campuses') {
      tempRecords = tempRecords.filter(r => r.employee.campus === campusFilter);
    }
    if (facultyFilter && facultyFilter !== 'All Faculties') {
      tempRecords = tempRecords.filter(r => r.employee.faculty === facultyFilter);
    }
    if (fileTypeFilter !== 'All') {
      tempRecords = tempRecords.filter(r => ('destination' in r ? 'Pass Slip' : 'Travel Order') === fileTypeFilter);
    }

    setFilteredRecords(tempRecords);
  }, [campusFilter, facultyFilter, fileTypeFilter, records]);

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

  const fetchUserData = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const headers = { 'x-auth-token': token };
    try {
      const response = await axios.get(`${API_URL}/users/me`, { headers });
      setName(response.data.name);
    } catch (error) {
      console.error('Failed to fetch user data', error);
    }
  };

  const handleUpdateName = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      await axios.put(`${API_URL}/users/me/name`, { name }, { headers });
      Alert.alert('Success', 'Your name has been updated.');
    } catch (error) {
      Alert.alert('Error', 'Failed to update your name.');
      console.error(error);
    }
  };

  const handleChangePassword = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      await axios.put(`${API_URL}/users/me/password`, { currentPassword, newPassword }, { headers });
      Alert.alert('Success', 'Your password has been changed.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      Alert.alert('Error', 'Failed to change your password. Please check your current password.');
      console.error(error);
    }
  };

  const handleUpdateStatus = async (type: ItemType, id: string, status: 'Approved' | 'Completed' | 'Rejected' | 'Recommended' | 'For President Approval', rejectionReason?: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const url = type === 'slip' ? `${API_URL}/pass-slips/${id}/status` : `${API_URL}/travel-orders/${id}/status`;
      let data: { status: string; approverSignature?: string; travelOrderNo?: string; travelOrderNoSignature?: string | null; departureSignature?: string | null; arrivalSignature?: string | null; trackingNo?: string; rejectionReason?: string; } = { status };
      if (status === 'Rejected' && rejectionReason != null && rejectionReason.trim() !== '') {
        data.rejectionReason = rejectionReason.trim();
      }

      if (type === 'slip' && status === 'Approved') {
        data.trackingNo = trackingNoInput;
      }
      if (type === 'order' && status === 'Approved') {
        data.travelOrderNo = travelOrderNoInput;
        data.travelOrderNoSignature = travelOrderNoSignature;
        data.departureSignature = departureSignature;
        data.arrivalSignature = arrivalSignature;
      }
      if (type === 'order' && status === 'For President Approval') {
        data.approverSignature = hrSignatureForPresident ?? '';
      }

      await axios.put(url, data, { headers });

      if (status === 'Approved') {
        if (selectedItem && type === 'slip') {
          setSelectedItem({ ...selectedItem, status: 'Approved', trackingNo: trackingNoInput });
        }
        setIsApproved(true);
        setTimeout(() => {
          setIsModalVisible(false);
          setIsApproved(false);
          setTrackingNoInput('');
          setHrSignatureForPresident(null);
          fetchData();
        }, 2000);
      } else {
        Alert.alert('Success', status === 'For President Approval' ? 'Sent to President for approval.' : status === 'Rejected' ? 'Request has been rejected.' : `Request has been ${status.toLowerCase()}.`);
        setHrSignatureForPresident(null);
        setRejectModalVisible(false);
        setRejectComment('');
        fetchData();
        setIsModalVisible(false);
        setSelectedItem(null);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to update the request status.');
      console.error(err);
    }
  };

  const handleLogout = async () => {
    dismissMobileSidebar();
    await AsyncStorage.multiRemove(['userToken', 'userRole']);
    navigation.replace('Login');
  };

  const handlePrint = () => {
    window.print();
  };

  /** Print travel order in a new window with full-detail HTML (matches slips display) */
  const handlePrintTravelOrder = (item: TravelOrder) => {
    const html = getTravelOrderPrintHtml(item, presidentName);
    const win = window.open('', '_blank');
    if (!win) {
      Alert.alert('Error', 'Please allow pop-ups to print the travel order.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 350);
  };

  const openReviewModal = (item: PassSlip | TravelOrder | MonitoringItem, type: ItemType) => {
    setSelectedItem(item);
    setSelectedItemType(type);
    setIsModalVisible(true);
    if (type === 'order') {
      setTravelOrderNoInput((item as TravelOrder).travelOrderNo || '');
    }
  };

  const openCtcModal = (order: ApprovedTravelOrder) => {
    if (!FEATURE_CTC_ENABLED) return;
    setCtcIssueDateIso(new Date().toISOString());
    setSelectedCtcOrder(order);
    setIsCtcModalVisible(true);
  };

  const commitMarkTravelOrderComplete = async (orderId: string) => {
    const id = String(orderId);
    setCompletingTravelOrderId(id);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(
        `${API_URL}/travel-orders/${id}/status`,
        { status: 'Completed' },
        { headers: { 'x-auth-token': token } }
      );
      await fetchData();
      setMarkCompleteFeedback({
        variant: 'success',
        message: 'Travel order has been marked as completed.',
      });
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to mark the travel order as completed.';
      setMarkCompleteFeedback({ variant: 'error', message: msg });
    } finally {
      setCompletingTravelOrderId(null);
    }
  };

  const promptMarkTravelOrderComplete = (order: ApprovedTravelOrder) => {
    if (completingTravelOrderId || markCompleteModalVisible) return;
    if (order.status && order.status !== 'Approved') return;
    setOrderPendingComplete(order);
    setMarkCompleteModalVisible(true);
  };

  const cancelMarkTravelOrderComplete = () => {
    setMarkCompleteModalVisible(false);
    setOrderPendingComplete(null);
  };

  const confirmMarkTravelOrderComplete = () => {
    if (!orderPendingComplete) return;
    const id = String(orderPendingComplete._id);
    setMarkCompleteModalVisible(false);
    setOrderPendingComplete(null);
    void commitMarkTravelOrderComplete(id);
  };

  const openMapModal = (item: PassSlip | TravelOrder) => {
    console.log('Opening map for item:', item._id);
    if (item.latitude && item.longitude) {
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
        iconUrl: require('leaflet/dist/images/marker-icon.png'),
        shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
      });

      let decodedPolyline: Array<[number, number]> | null = null;
      let startLat = null;
      let startLon = null;

      // @ts-ignore
      if (item.routePolyline) {
        console.log('Route polyline found:', item.routePolyline);
        try {
          // @ts-ignore
          const decoded = polyline.decode(item.routePolyline);
          if (decoded && decoded.length > 0) {
            startLat = decoded[0][0];
            startLon = decoded[0][1];
            decodedPolyline = decoded.map(p => [p[0], p[1]]);
            console.log('Decoded polyline with', decoded.length, 'points. Start:', [startLat, startLon]);
          } else {
            console.warn('Polyline decoded to an empty array.');
          }
        } catch (e) {
          console.error('Failed to decode polyline:', e);
        }
      } else {
        console.warn('No routePolyline found for this item.');
      }

      setMapData({
        lat: item.latitude,
        lon: item.longitude,
        polyline: decodedPolyline,
        startLat: startLat,
        startLon: startLon,
        startName: item.employee.name,
        // @ts-ignore
        destName: item.destination || item.to
      });
      setIsMapModalVisible(true);
    } else {
      console.error('No latitude/longitude found for this item.');
      Alert.alert('Map Error', 'Location data is not available for this item.');
    }
  };

  const renderItem = (item: PassSlip | TravelOrder, type: ItemType) => (
    <Pressable 
      key={item._id} 
      style={[styles.itemContainer, isCompact && styles.itemContainerCompact, hoveredRow === item._id && styles.itemContainerHover]} 
      onPress={() => openReviewModal(item, type)}
      onHoverIn={() => setHoveredRow(item._id)}
      onHoverOut={() => setHoveredRow(null)}
    >
      <Image 
        source={{
          uri: profilePictureUri(item.employee?.profilePicture, API_BASE_URL, 'https://via.placeholder.com/150'),
        }} 
        style={styles.profilePicture} 
      />
      <View style={styles.itemHeaderText}>
        <Text style={styles.itemTitle}>{item.employee?.name || 'N/A'}</Text>
        <Text style={styles.itemSubtitle}>{type === 'slip' ? 'Pass Slip' : 'Travel Order'}</Text>
      </View>
      <Text style={styles.itemDate}>{formatDate(item.date)}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      {isNarrow && mobileSidebarOpen ? (
        <Pressable
          style={styles.mobileDrawerBackdrop}
          onPress={dismissMobileSidebar}
          accessibilityLabel="Close menu"
        />
      ) : null}
      {/* Sidebar: fixed column on desktop; off-canvas drawer on narrow */}
      <View
        style={[
          styles.sidebar,
          isNarrow && styles.sidebarNarrowDrawer,
          isNarrow && (mobileSidebarOpen ? styles.sidebarNarrowDrawerOpen : styles.sidebarNarrowDrawerClosed),
        ]}
      >
        <SidebarScroll narrow={isNarrow}>
        <View style={styles.sidebarInner}>
          <View style={styles.sidebarBrand}>
            <Image source={require('../../assets/dorsulogo-removebg-preview (1).png')} style={styles.logoImage} />
            <Text style={styles.logo}>GoPass DOrSU</Text>
          </View>
          <View style={styles.nav}>
            <Pressable
              style={[styles.navItem, activeView === 'dashboard' && styles.activeNavItem]}
              onPress={() => {
                setActiveView('dashboard');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="th-large" size={20} color={activeView === 'dashboard' ? '#fff' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'dashboard' && styles.activeNavText]}>Dashboard</Text>
            </Pressable>
            <Pressable
              style={[styles.navItem, activeView === 'records' && styles.activeNavItem]}
              onPress={() => {
                setActiveView('records');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="folder-open-o" size={20} color={activeView === 'records' ? '#fff' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'records' && styles.activeNavText]}>Records</Text>
            </Pressable>
            <Pressable
              style={[styles.navItem, activeView === 'reports' && styles.activeNavItem]}
              onPress={() => {
                setActiveView('reports');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="bar-chart" size={20} color={activeView === 'reports' ? '#fff' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'reports' && styles.activeNavText]}>Reports</Text>
            </Pressable>
            <Pressable
              style={[styles.navItem, activeView === 'monitoring' && styles.activeNavItem]}
              onPress={() => {
                setActiveView('monitoring');
                // default sub-view
                if (!monitoringSubView) setMonitoringSubView('slip');
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="map-marker" size={20} color={activeView === 'monitoring' ? '#fff' : 'rgba(255,255,255,0.75)'} />
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.navText, activeView === 'monitoring' && styles.activeNavText]}>Monitoring</Text>
                <FontAwesome
                  name={activeView === 'monitoring' ? 'chevron-down' : 'chevron-right'}
                  size={14}
                  color={activeView === 'monitoring' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)'}
                />
              </View>
            </Pressable>
            {activeView === 'monitoring' && (
              <View style={styles.subNav}>
                <Pressable
                  style={[styles.subNavItem, monitoringSubView === 'slip' && styles.subNavItemActive]}
                  onPress={() => {
                    setActiveView('monitoring');
                    setMonitoringSubView('slip');
                    dismissMobileSidebar();
                  }}
                >
                  <View style={styles.subNavRow}>
                    <View style={[styles.subNavDot, monitoringSubView === 'slip' && styles.subNavDotActive]} />
                    <Text style={[styles.subNavText, monitoringSubView === 'slip' && styles.subNavTextActive]}>Pass Slip</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.subNavItem, monitoringSubView === 'order' && styles.subNavItemActive]}
                  onPress={() => {
                    setActiveView('monitoring');
                    setMonitoringSubView('order');
                    dismissMobileSidebar();
                  }}
                >
                  <View style={styles.subNavRow}>
                    <View style={[styles.subNavDot, monitoringSubView === 'order' && styles.subNavDotActive]} />
                    <Text style={[styles.subNavText, monitoringSubView === 'order' && styles.subNavTextActive]}>Travel Order</Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>
          <View style={styles.sidebarBottom}>
            <Pressable
              style={styles.profileSidebarButton}
              onPress={() => {
                setProfileModalVisible(true);
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="user-circle" size={20} color="rgba(255,255,255,0.9)" />
              </View>
              <View style={styles.profileSidebarButtonTextWrap}>
                <Text style={styles.navText} numberOfLines={1}>{name || 'Profile'}</Text>
              </View>
            </Pressable>
            <Pressable style={styles.logoutButton} onPress={handleLogout}>
              <View style={styles.navIcon}>
                <FontAwesome name="sign-out" size={20} color="rgba(255,255,255,0.9)" />
              </View>
              <Text style={styles.navText}>Logout</Text>
            </Pressable>
          </View>
        </View>
        </SidebarScroll>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={[styles.header, isNarrow && styles.headerMobile]}>
          {isNarrow ? (
            <Pressable
              onPress={() => setMobileSidebarOpen((open) => !open)}
              style={({ pressed }) => [styles.headerMenuButton, pressed && styles.headerMenuButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              <FontAwesome name={mobileSidebarOpen ? 'times' : 'bars'} size={22} color="#011a6b" />
            </Pressable>
          ) : null}
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>
              {activeView === 'dashboard' && 'HR Dashboard'}
              {activeView === 'records' && 'Records'}
              {activeView === 'reports' && 'Reports & Analytics'}
              {activeView === 'monitoring' && 'Monitoring'}
            </Text>
          </View>
        </View>
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={[styles.mainScrollContent, isNarrow && styles.mainScrollContentNarrow]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
              {activeView === 'dashboard' && (
              <>
                {isLoading ? (
                  <ActivityIndicator size="large" color="#011a6b" />
                ) : error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : (
                  <>
                    <View style={[styles.statsRow, isCompact && styles.statsRowCompact]}>
                      <View style={[styles.statCard, isCompact && styles.statCardStacked]}>
                        <Text style={styles.statValue}>{forReviewItems.filter(item => 'destination' in item).length}</Text>
                        <Text style={styles.statLabel}>Pending Pass Slips</Text>
                      </View>
                      <View style={[styles.statCard, styles.statCardLast, isCompact && styles.statCardStacked, isCompact && styles.statCardLastStacked]}>
                        <Text style={styles.statValue}>{forReviewItems.filter(item => !('destination' in item)).length}</Text>
                        <Text style={styles.statLabel}>Pending Travel Orders</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionTitle}>For Approval</Text>
                    <View style={styles.tabContainer}>
                      <Pressable
                        style={[styles.tab, activeTab === 'slips' && styles.activeTab]}
                        onPress={() => setActiveTab('slips')}
                      >
                        <Text style={[styles.tabText, activeTab === 'slips' && styles.activeTabText]}>Pass Slips ({forReviewItems.filter(item => 'destination' in item).length})</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.tab, activeTab === 'orders' && styles.activeTab]}
                        onPress={() => setActiveTab('orders')}
                      >
                        <Text style={[styles.tabText, activeTab === 'orders' && styles.activeTabText]}>Travel Orders ({forReviewItems.filter(item => !('destination' in item)).length})</Text>
                      </Pressable>
                    </View>

                    <View style={styles.itemsGridContainer}>
                      {activeTab === 'slips' && (
                        forReviewItems.filter(item => 'destination' in item).length > 0 ? (
                          forReviewItems.filter(item => 'destination' in item).map(item => renderItem(item, 'slip'))
                        ) : (
                          <Text style={styles.emptyText}>No pending pass slips.</Text>
                        )
                      )}

                      {activeTab === 'orders' && (
                        forReviewItems.filter(item => !('destination' in item)).length > 0 ? (
                          forReviewItems.filter(item => !('destination' in item)).map(item => renderItem(item, 'order'))
                        ) : (
                          <Text style={styles.emptyText}>No pending travel orders.</Text>
                        )
                      )}
                    </View>
                  </>
                )}
              </>
              )}

            {activeView === 'records' && (
              <View>
                <View style={styles.recordsHeader}>
                  <View>
                    <Text style={styles.recordsTitle}>Completed Records</Text>
                    <Text style={styles.recordsSubtitle}>{filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
                <View style={styles.recordsFiltersCard}>
                  <Text style={styles.recordsFiltersLabel}>Filters</Text>
                  <View style={styles.recordsFiltersRow}>
                    <View style={styles.recordsFilterGroup}>
                      <Text style={styles.recordsFilterLabel}>Campus</Text>
                      <select value={campusFilter} onChange={e => setCampusFilter(e.target.value)} style={webStyles.recordsFilterSelect as any}>
                        {campuses.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </View>
                    <View style={styles.recordsFilterGroup}>
                      <Text style={styles.recordsFilterLabel}>Faculty</Text>
                      <select value={facultyFilter} onChange={e => setFacultyFilter(e.target.value)} style={webStyles.recordsFilterSelect as any}>
                        {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </View>
                    <View style={styles.recordsFilterGroup}>
                      <Text style={styles.recordsFilterLabel}>Type</Text>
                      <select value={fileTypeFilter} onChange={e => setFileTypeFilter(e.target.value)} style={webStyles.recordsFilterSelect as any}>
                        <option value="All">All</option>
                        <option value="Pass Slip">Pass Slip</option>
                        <option value="Travel Order">Travel Order</option>
                      </select>
                    </View>
                    <Pressable style={styles.recordsClearButton} onPress={() => {
                      setCampusFilter('All Campuses');
                      setFacultyFilter('All Faculties');
                      setFileTypeFilter('All');
                    }}>
                      <Text style={styles.recordsClearButtonText}>Clear</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.recordsTableCard}>
                  {filteredRecords.length > 0 ? (
                    <View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={(styles as any).recordsTableHorizontalScroll}>
                        <View style={[(styles as any).recordsTableInner, styles.recordsTableHeader]}>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColEmployee]}>Employee</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColType]}>Type</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColDate]}>Date</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColStatus]}>Arrival</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColCampus]}>Campus</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColFaculty]}>Faculty</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColActions]}>Actions</Text>
                        </View>
                      </ScrollView>

                      {filteredRecords.map((item, index) => (
                        <ScrollView
                          key={item._id}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={(styles as any).recordsTableHorizontalScroll}
                        >
                          <View style={[(styles as any).recordsTableInner, styles.recordsTableRow, index % 2 === 1 && styles.recordsTableRowAlt]}>
                            <Text style={[styles.recordsTableCell, styles.recordsColEmployee]} numberOfLines={1}>
                              {item.employee?.name || 'N/A'}
                            </Text>
                            <View style={[styles.recordsColType]}>
                              <View style={['destination' in item ? styles.recordsBadgeSlip : styles.recordsBadgeOrder]}>
                                <Text style={'destination' in item ? styles.recordsBadgeSlipText : styles.recordsBadgeOrderText}>
                                  {'destination' in item ? 'Pass Slip' : 'Travel Order'}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.recordsTableCell, styles.recordsColDate]}>{formatDate(item.date)}</Text>
                            <Text style={[styles.recordsTableCell, styles.recordsColStatus]} numberOfLines={1}>
                              {('arrivalStatus' in item && item.arrivalStatus) ? item.arrivalStatus : '—'}
                            </Text>
                            <Text style={[styles.recordsTableCell, styles.recordsColCampus]} numberOfLines={1}>
                              {item.employee?.campus || '—'}
                            </Text>
                            <Text style={[styles.recordsTableCell, styles.recordsColFaculty]} numberOfLines={1}>
                              {item.employee?.faculty || '—'}
                            </Text>
                            <View style={[styles.recordsColActions, styles.recordsActionsCell]}>
                              <Pressable
                                style={styles.recordsViewBtn}
                                onPress={() => openReviewModal(item, 'destination' in item ? 'slip' : 'order')}
                              >
                                <Text style={styles.recordsViewBtnText}>View</Text>
                              </Pressable>
                              <Pressable style={styles.recordsPrintBtn} onPress={() => {
                                if ('destination' in item) {
                                  setSelectedItem(item);
                                  setSelectedItemType('slip');
                                  setIsModalVisible(true);
                                  setTimeout(() => handlePrint(), 500);
                                } else {
                                  handlePrintTravelOrder(item as TravelOrder);
                                }
                              }}>
                                <Text style={styles.recordsPrintBtnText}>Print</Text>
                              </Pressable>
                            </View>
                          </View>
                        </ScrollView>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.recordsEmpty}>
                      <FontAwesome name="folder-open-o" size={48} color="#cbd5e1" />
                      <Text style={styles.recordsEmptyTitle}>No records found</Text>
                      <Text style={styles.recordsEmptyText}>Try adjusting filters or check back later.</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {activeView === 'reports' && (
              <View>
                <HrpReportsAnalytics records={records as any} />
              </View>
            )}

            {activeView === 'monitoring' && (
              <View style={styles.itemsGridContainer}>
                {monitoringSubView === 'slip' ? (
                  // Pass Slips
                  <View style={styles.monitoringCard}>
                    <Text style={styles.sectionTitle}>Active Pass Slips ({monitoringItems.filter(item => item.type === 'slip').length})</Text>
                    <View style={(styles as any).monitoringTableCard}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={(styles as any).monitoringTableHorizontalScroll}
                        contentContainerStyle={{ flexGrow: 1 }}
                      >
                        <View style={(styles as any).monitoringTableInner}>
                          <View style={(styles as any).monitoringTableHeader}>
                            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColEmployee]}>Employee</Text>
                            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColDestination]}>Destination</Text>
                            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColTimeOut]}>Time Out</Text>
                            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColTimer]}>Timer</Text>
                            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColActions]}>Actions</Text>
                          </View>

                          {monitoringItems.filter(item => item.type === 'slip').map((item, index) => (
                            <View
                              key={item._id}
                              style={[(styles as any).monitoringTableRow, index % 2 === 1 && (styles as any).monitoringTableRowAlt]}
                            >
                              <Text style={[(styles as any).monitoringRowText, (styles as any).monitoringColEmployee]} numberOfLines={1}>
                                {item.employee?.name || 'N/A'}
                              </Text>
                              <Text style={[(styles as any).monitoringRowText, (styles as any).monitoringColDestination]} numberOfLines={1}>
                                {item.destination}
                              </Text>
                              <Text style={[(styles as any).monitoringRowText, (styles as any).monitoringColTimeOut]} numberOfLines={1}>
                                {item.timeOut}
                              </Text>
                              <View style={[(styles as any).monitoringColTimer, { justifyContent: 'center', alignItems: 'center' }]}>
                                {item.departureTime && item.estimatedTimeBack && (
                                  <Timer
                                    timeOut={item.timeOut}
                                    estimatedTimeBack={item.estimatedTimeBack}
                                    departureTime={item.departureTime}
                                  />
                                )}
                              </View>
                              <View style={[(styles as any).monitoringColActions, (styles as any).monitoringActionsCell]}>
                                <Pressable style={styles.viewButton} onPress={() => openReviewModal(item, item.type)}>
                                  <Text style={styles.viewButtonText}>View</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  </View>
                ) : (
                  // Travel Orders
                  <MonitoringApprovedTravelOrdersCard
                    styles={styles as any}
                    orders={monitoringApprovedTravelOrders}
                    onView={(order) => openReviewModal(order as any, 'order')}
                    onIssueCtc={FEATURE_CTC_ENABLED ? openCtcModal : undefined}
                    onMarkComplete={promptMarkTravelOrderComplete}
                    completingOrderId={completingTravelOrderId}
                    markCompleteConfirmOpenForId={
                      markCompleteModalVisible && orderPendingComplete ? String(orderPendingComplete._id) : null
                    }
                  />
                )}
              </View>
            )}
            </ScrollView>

        {/* Profile Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={profileModalVisible}
          onRequestClose={() => setProfileModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalView, styles.profileModalView]}>
              <View style={styles.profileModalHeader}>
                <Text style={styles.profileModalTitle}>My Profile</Text>
                <Pressable onPress={() => setProfileModalVisible(false)} style={styles.closeModalButton}>
                  <FontAwesome name="times" size={20} color="#011a6b" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.profileModalContent} showsVerticalScrollIndicator={false}>
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Update Your Name</Text>
                  <View style={styles.profileField}>
                    <Text style={styles.profileLabel}>Full Name</Text>
                    <TextInput
                      style={styles.profileInput}
                      placeholder="Enter your full name"
                      placeholderTextColor="rgba(1,26,107,0.6)"
                      value={name}
                      onChangeText={setName}
                    />
                  </View>
                  <Pressable style={styles.profileButton} onPress={handleUpdateName}>
                    <Text style={styles.profileButtonText}>Update Name</Text>
                  </Pressable>
                </View>
                <View style={[styles.profileSection, styles.profileSectionLast]}>
                  <Text style={styles.profileSectionTitle}>Change Password</Text>
                  <View style={styles.profileField}>
                    <Text style={styles.profileLabel}>Current Password</Text>
                    <TextInput
                      style={styles.profileInput}
                      placeholder="Enter current password"
                      placeholderTextColor="rgba(1,26,107,0.6)"
                      secureTextEntry
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                    />
                  </View>
                  <View style={[styles.profileField, styles.profileFieldLast]}>
                    <Text style={styles.profileLabel}>New Password</Text>
                    <TextInput
                      style={styles.profileInput}
                      placeholder="Enter new password"
                      placeholderTextColor="rgba(1,26,107,0.6)"
                      secureTextEntry
                      value={newPassword}
                      onChangeText={setNewPassword}
                    />
                  </View>
                  <Pressable style={styles.profileButton} onPress={handleChangePassword}>
                    <Text style={styles.profileButtonText}>Change Password</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Review Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isModalVisible}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalView}>
              {isSignatureModalVisible && (
                <View style={styles.signatureModalOverlay}>
                  <View style={styles.signatureModalView}>
                    <Text style={styles.modalTitle}>Provide Signature</Text>
                    <View style={styles.signaturePadContainer}>
                      <SignatureCanvas
                        ref={sigPad}
                        penColor='black'
                        canvasProps={{width: 300, height: 200, className: 'sigCanvas'}}
                      />
                    </View>
                    <View style={styles.signatureButtons}>
                      <Pressable style={styles.clearButton} onPress={() => sigPad.current.clear()}>
                        <Text style={styles.clearButtonText}>Clear</Text>
                      </Pressable>
                      <Pressable style={styles.saveButton} onPress={() => {
                        const signature = sigPad.current.toDataURL();
                        if (activeSignatureField === 'travelOrderNo') {
                          setTravelOrderNoSignature(signature);
                        } else if (activeSignatureField === 'departure') {
                          setDepartureSignature(signature);
                        } else if (activeSignatureField === 'arrival') {
                          setArrivalSignature(signature);
                        }
                        setIsSignatureModalVisible(false);
                      }}>
                        <Text style={styles.saveButtonText}>Save</Text>
                      </Pressable>
                    </View>
                    <Pressable style={[styles.button, styles.cancelButton]} onPress={() => setIsSignatureModalVisible(false)}>
                      <Text style={styles.buttonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              <ScrollView contentContainerStyle={styles.modalContent}>
                {selectedItem && (
                  <>
                    {selectedItemType === 'slip' ? (
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
                          <Image source={require('../../assets/dorsulogo-removebg-preview (1).png')} style={styles.docLogo} />
                        </View>
                        <View style={styles.docTitleContainer}>
                          <View style={styles.trackingNoContainer}>
                            <Text style={styles.docField}>Tracking No.: </Text>
                            {forReviewItems.includes(selectedItem) && selectedItem.status !== 'Approved' ? (
                              <TextInput
                                style={styles.trackingNoInput}
                                onChangeText={setTrackingNoInput}
                                value={trackingNoInput}
                                placeholder="Enter Tracking No."
                              />
                            ) : (
                              <Text style={styles.docValue}>{(selectedItem as PassSlip).trackingNo || 'N/A'}</Text>
                            )}
                          </View>
                          <Text style={styles.docField}>Date: <Text style={styles.docValue}>{formatDate((selectedItem as PassSlip).date)}</Text></Text>
                        </View>
                        <View style={styles.docMainTitleContainer}>
                          <Text style={styles.docMainTitle}>PASS SLIP</Text>
                          <Text style={styles.docSubTitle}>(Within Mati City)</Text>
                        </View>
                        <View style={styles.docRow}>
                          <Text style={styles.docField}>Name of Employee: <Text style={styles.docValue}>{selectedItem.employee?.name}</Text></Text>
                        </View>
                        <View style={styles.docRow}>
                          <Text style={styles.docField}>Time Out: <Text style={styles.docValue}>{(selectedItem as PassSlip).timeOut}</Text></Text>
                        </View>
                        <View style={styles.docRow}>
                          <Text style={styles.docField}>Estimated Time to be Back: <Text style={styles.docValue}>{(selectedItem as PassSlip).estimatedTimeBack}</Text></Text>
                        </View>
                        <View style={styles.docRow}>
                          <Text style={styles.docField}>Destination: <Text style={styles.docValue}>{(selectedItem as PassSlip).destination}</Text></Text>
                        </View>
                        <View style={styles.docRow}>
                          <Text style={styles.docField}>Purpose/s: <Text style={styles.docValue}>{selectedItem.purpose}</Text></Text>
                        </View>

                        {(selectedItem as PassSlip).latitude && (selectedItem as PassSlip).longitude && (
                          <Pressable style={styles.viewMapButton} onPress={() => openMapModal(selectedItem as PassSlip)}>
                            <Text style={styles.viewMapButtonText}>View on Map</Text>
                          </Pressable>
                        )}

                        {selectedItem.arrivalStatus === 'On Time' && (
                          <View style={styles.onTimeContainer}>
                            <Text style={styles.onTimeText}>ON TIME</Text>
                          </View>
                        )}
                        {selectedItem.arrivalStatus && selectedItem.arrivalStatus.includes('Overdue') && (
                          <View style={styles.overdueContainer}>
                            <Text style={styles.overdueStampText}>OVERDUE</Text>
                          </View>
                        )}
                        {selectedItem.arrivalStatus && selectedItem.arrivalStatus.includes('On Time') && (
                          <View style={styles.onTimeContainer}>
                            <Text style={styles.onTimeText}>ON TIME</Text>
                          </View>
                        )}

                        {(isApproved || selectedItem.status === 'Approved') && (
                          <View style={styles.approvedStampContainer}>
                            <Text style={styles.approvedStamp}>APPROVED</Text>
                          </View>
                        )}
                        {selectedItem.status === 'Rejected' && (
                          <View style={styles.rejectedStampContainer}>
                            <Text style={styles.rejectedStamp}>REJECTED</Text>
                          </View>
                        )}
                        <View style={styles.docSignatureContainer}>
                          <View style={styles.docSignatureBox}>
                            <Text style={styles.docField}>Requested by:</Text>
                            <View style={styles.docSignatureDisplay}>
                              {selectedItem.signature && <Image source={{ uri: selectedItem.signature }} style={styles.docSignatureImage} />}
                              <Text style={styles.docSignatureName}>{selectedItem.employee?.name}</Text>
                            </View>
                            <Text style={styles.docSignatureUnderline}>{(selectedItem as PassSlip).employee?.role === 'Faculty Dean' ? 'Faculty Dean' : 'Faculty Staff'}</Text>
                          </View>
                          <View style={styles.docSignatureBox}>
                            <Text style={styles.docField}>Approved by:</Text>
                            <View style={styles.docSignatureDisplay}>
                              {selectedItem.approverSignature && <Image source={{ uri: selectedItem.approverSignature }} style={styles.docSignatureImage} />}
                              <Text style={styles.docSignatureName}>{(selectedItem as PassSlip).approvedBy?.name}</Text>
                            </View>
                            <Text style={styles.docSignatureUnderline}>{(selectedItem as PassSlip).employee?.role === 'Faculty Dean' ? 'President' : (selectedItem as PassSlip).employee?.role === 'Program Head' ? 'Faculty Dean' : 'Immediate Head'}</Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <>
                        {forReviewItems.includes(selectedItem) &&
                          (selectedItem as TravelOrder).status !== 'Recommended' && (
                          <View style={{ marginBottom: 12, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
                            <Text style={styles.formLabel}>Travel Order No. (required to approve)</Text>
                            <TextInput
                              style={styles.formInput}
                              onChangeText={setTravelOrderNoInput}
                              value={travelOrderNoInput}
                              placeholder="Enter Travel Order No."
                            />
                          </View>
                        )}
                        <TravelOrderFormWeb
                          order={buildTravelOrderWebView(selectedItem as TravelOrder)}
                          presidentName={presidentName}
                          viewOnly
                          travelOrderNoDraft={
                            forReviewItems.includes(selectedItem) &&
                            (selectedItem as TravelOrder).status !== 'Recommended'
                              ? travelOrderNoInput
                              : undefined
                          }
                          onViewMap={
                            (selectedItem as TravelOrder).latitude && (selectedItem as TravelOrder).longitude
                              ? () => openMapModal(selectedItem as TravelOrder)
                              : undefined
                          }
                        />
                      </>
                    )}
                  </>
                )}
              </ScrollView>
              {selectedItem && (
                <View style={styles.modalButtonContainer}>
                  {forReviewItems.includes(selectedItem) ? (
                    <>
                      <Pressable
                        style={[styles.button, styles.approveButton, styles.modalButton]}
                        onPress={() => {
                          const isTravelOrderRecommended = selectedItemType === 'order' && (selectedItem as TravelOrder).status === 'Recommended';
                          const statusToSend = isTravelOrderRecommended ? 'For President Approval' : 'Approved';
                          handleUpdateStatus(selectedItemType!, selectedItem._id, statusToSend);
                        }}
                      >
                        <Text style={styles.buttonText}>
                          {selectedItemType === 'order' && (selectedItem as TravelOrder).status === 'Recommended'
                            ? 'Send to President'
                            : 'Approve'}
                        </Text>
                      </Pressable>
                      <Pressable style={[styles.button, styles.rejectButton, styles.modalButton]} onPress={() => { setRejectComment(''); setRejectModalVisible(true); }}>
                        <Text style={styles.buttonText}>Reject</Text>
                      </Pressable>
                    </>
                  ) : null}
                  {selectedItemType === 'order' && !forReviewItems.includes(selectedItem) && (
                    <Pressable style={[styles.button, styles.printButton, styles.modalButton]} onPress={() => handlePrintTravelOrder(selectedItem as TravelOrder)}>
                      <Text style={styles.buttonText}>Print</Text>
                    </Pressable>
                  )}
                  <Pressable style={[styles.button, styles.cancelButton, styles.modalButton]} onPress={() => setIsModalVisible(false)}>
                    <Text style={styles.buttonText}>{forReviewItems.includes(selectedItem) ? 'Cancel' : 'Close'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* CTC Modal — enable via FEATURE_CTC_ENABLED in src/config/featureFlags.ts */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={FEATURE_CTC_ENABLED && isCtcModalVisible}
          onRequestClose={() => setIsCtcModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalView, styles.ctcModalView]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Certificate of Travel Completed</Text>
                <Pressable onPress={() => setIsCtcModalVisible(false)} style={styles.closeModalButton}>
                  <FontAwesome name="close" size={20} color="#011a6b" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={styles.ctcPaper}>
                  {(() => {
                    const supervisor = selectedCtcOrder?.employee?.immediateSupervisor;
                    const immediateSupervisorName =
                      (typeof supervisor === 'string' ? supervisor : supervisor?.name) ||
                      selectedCtcOrder?.recommendedBy?.[0]?.name ||
                      selectedCtcOrder?.approvedBy?.name ||
                      ' ';
                    const employeeSignature = selectedCtcOrder?.signature;
                    const coordinatorSignature = getCoordinatorSignature(selectedCtcOrder);
                    return (
                      <>
                  <View style={styles.ctcHeaderRow}>
                    <View style={styles.ctcUniversityBlock}>
                      <View style={styles.ctcTopRule} />
                      <Text style={styles.ctcUniversityName}>DAVAO ORIENTAL</Text>
                      <Text style={styles.ctcUniversityName}>STATE UNIVERSITY</Text>
                      <Text style={styles.ctcMotto}>"A university of excellence, innovation, and inclusion"</Text>
                      <View style={styles.ctcTopRule} />
                      <Text style={styles.ctcTitle}>CERTIFICATE OF TRAVEL COMPLETED</Text>
                    </View>
                    <Image source={require('../../assets/dorsulogo-removebg-preview (1).png')} style={styles.ctcLogo} />
                  </View>

                  <View style={styles.ctcDateRow}>
                    <Text style={styles.ctcDateText}>{formatDateLong(ctcIssueDateIso)}</Text>
                    <Text style={styles.ctcDateLabel}>Date</Text>
                  </View>

                  <View style={styles.ctcLineGroup}>
                    <Text style={styles.ctcLineText}>{presidentName || ' '}</Text>
                    <Text style={styles.ctcLineLabel}>Agency Head</Text>
                    <Text style={styles.ctcLineLabel}>SUC President III</Text>
                  </View>

                  <Text style={styles.ctcBodyText}>I HEREBY CERTIFY that I have completed the travel authorized in itinerary of Travel No.
                    <Text style={styles.ctcInlineValue}> {selectedCtcOrder?.travelOrderNo || '______________'} </Text>
                  </Text>
                  <Text style={styles.ctcBodyText}>dated
                    <Text style={styles.ctcInlineValue}> {formatDateLong(selectedCtcOrder?.departureDate || selectedCtcOrder?.date)} </Text>
                    under condition indicated below:
                  </Text>

                  <View style={styles.ctcChecklistBlock}>
                    <View style={styles.ctcChecklistRow}>
                      <View style={styles.ctcCheckbox} />
                      <Text style={styles.ctcChecklistItem}>Strictly in accordance with approved itinerary.</Text>
                    </View>
                    <View style={styles.ctcChecklistRow}>
                      <View style={styles.ctcCheckbox} />
                      <Text style={styles.ctcChecklistItem}>Cut short as explain below excess payment in the amount of</Text>
                      <View style={styles.ctcInlineBlank} />
                      <Text style={styles.ctcChecklistItem}>was refunded on O.R. No.</Text>
                      <View style={styles.ctcInlineBlankShort} />
                    </View>
                    <View style={styles.ctcChecklistRowIndent}>
                      <Text style={styles.ctcChecklistItem}>dated</Text>
                      <View style={styles.ctcInlineBlankShort} />
                    </View>
                    <View style={styles.ctcChecklistRow}>
                      <View style={styles.ctcCheckbox} />
                      <Text style={styles.ctcChecklistItem}>Extended as explain below.</Text>
                    </View>
                    <View style={styles.ctcChecklistRow}>
                      <View style={styles.ctcCheckbox} />
                      <Text style={styles.ctcChecklistItem}>Other deviations as explained below.</Text>
                    </View>
                    <View style={styles.ctcChecklistRow}>
                      <View style={styles.ctcCheckbox} />
                      <Text style={styles.ctcChecklistItem}>Explanation or justification</Text>
                      <View style={styles.ctcInlineBlankShort} />
                    </View>
                  </View>

                  <View style={styles.ctcSignatureBlockTop}>
                    <Text style={styles.ctcBodyText}>Respectfully submitted:</Text>
                    <View style={styles.ctcSignatureNameCluster}>
                      <View style={styles.ctcSignatureNameWithSig}>
                        {employeeSignature ? (
                          <Image source={{ uri: employeeSignature }} style={styles.ctcSignatureImage} />
                        ) : null}
                        <Text style={styles.ctcSignatureNameDynamic}>{selectedCtcOrder?.employee?.name || ' '}</Text>
                      </View>
                      <Text style={styles.ctcSignatureRole}>Official Employee</Text>
                    </View>
                  </View>

                  <Text style={styles.ctcBodyText}>
                    On evidence and information of which I have knowledge the travel was actually undertaken.
                  </Text>

                  <View style={styles.ctcSignatureBlockBottom}>
                    <View style={styles.ctcSignatureNameCluster}>
                      <View style={styles.ctcSignatureNameWithSig}>
                        {coordinatorSignature ? (
                          <Image source={{ uri: coordinatorSignature }} style={styles.ctcSignatureImage} />
                        ) : null}
                        <Text style={styles.ctcSignatureNameDynamic}>{immediateSupervisorName}</Text>
                      </View>
                      <Text style={styles.ctcSignatureRole}>Coordinator</Text>
                    </View>
                  </View>
                      </>
                    );
                  })()}
                </View>
              </ScrollView>
              <View style={styles.modalButtonContainer}>
                <Pressable style={[styles.button, styles.cancelButton, styles.modalButton]} onPress={() => setIsCtcModalVisible(false)}>
                  <Text style={styles.buttonText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Mark travel order complete — Modal works on web; Alert.alert does not reliably show there */}
        <Modal
          animationType="fade"
          transparent
          visible={markCompleteModalVisible}
          onRequestClose={cancelMarkTravelOrderComplete}
        >
          <View style={styles.rejectModalOverlay}>
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>Complete travel order?</Text>
              <Text style={styles.rejectModalSubtitle}>
                Are you sure you want to mark this travel order as Completed for{' '}
                {orderPendingComplete?.employee?.name || 'this employee'}? It will leave the active list. This action is
                final for this step.
              </Text>
              <View style={styles.rejectModalButtons}>
                <Pressable style={[styles.rejectModalButton, styles.rejectModalCancel]} onPress={cancelMarkTravelOrderComplete}>
                  <Text style={styles.rejectModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.rejectModalButton, styles.markCompleteModalPrimaryButton]}
                  onPress={confirmMarkTravelOrderComplete}
                  disabled={!!completingTravelOrderId}
                >
                  <Text style={styles.markCompleteModalPrimaryButtonText}>Mark completed</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Mark complete result (success / error) — no window.alert */}
        <Modal
          animationType="fade"
          transparent
          visible={!!markCompleteFeedback}
          onRequestClose={() => setMarkCompleteFeedback(null)}
        >
          <View style={styles.rejectModalOverlay}>
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>
                {markCompleteFeedback?.variant === 'success' ? 'Success' : 'Could not complete'}
              </Text>
              <Text style={styles.rejectModalSubtitle}>{markCompleteFeedback?.message}</Text>
              <View style={styles.rejectModalButtons}>
                <Pressable
                  style={[styles.rejectModalButton, styles.markCompleteModalPrimaryButton]}
                  onPress={() => setMarkCompleteFeedback(null)}
                >
                  <Text style={styles.markCompleteModalPrimaryButtonText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Reject confirmation modal with optional comment */}
        <Modal animationType="fade" transparent visible={rejectModalVisible} onRequestClose={() => setRejectModalVisible(false)}>
          <View style={styles.rejectModalOverlay}>
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>Reject request</Text>
              <Text style={styles.rejectModalSubtitle}>Add an optional comment for the employee (e.g. reason for rejection).</Text>
              <TextInput
                style={styles.rejectCommentInput}
                placeholder="Comment (optional)"
                placeholderTextColor="#999"
                value={rejectComment}
                onChangeText={setRejectComment}
                multiline
                numberOfLines={3}
              />
              <View style={styles.rejectModalButtons}>
                <Pressable style={[styles.rejectModalButton, styles.rejectModalCancel]} onPress={() => { setRejectModalVisible(false); setRejectComment(''); }}>
                  <Text style={styles.rejectModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.rejectModalButton, styles.rejectModalConfirm]} onPress={() => selectedItem && selectedItemType && handleUpdateStatus(selectedItemType, selectedItem._id, 'Rejected', rejectComment)}>
                  <Text style={styles.rejectModalConfirmText}>Confirm Rejection</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Map Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isMapModalVisible}
          onRequestClose={() => setIsMapModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalView, styles.mapModalView]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Route Map</Text>
                <Pressable onPress={() => setIsMapModalVisible(false)} style={styles.closeModalButton}>
                  <FontAwesome name="close" size={24} color="#333" />
                </Pressable>
              </View>
              {mapData && (
                <MapContainer center={[mapData.lat, mapData.lon]} zoom={13} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution='&copy; Esri &mdash; source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  />
                  {mapData.startLat && mapData.startLon && (
                    <Marker position={[mapData.startLat, mapData.startLon]} icon={startIcon}>
                      <Tooltip permanent>{mapData.startName}</Tooltip>
                    </Marker>
                  )}
                  <Marker position={[mapData.lat, mapData.lon]} icon={destIcon}>
                    <Tooltip permanent>{mapData.destName}</Tooltip>
                  </Marker>
                  {mapData.polyline && (
                    <LeafletPolyline positions={mapData.polyline} color="red" />
                  )}
                </MapContainer>
              )}
            </View>
          </View>
        </Modal>

      </View>
    </SafeAreaView>
  );
};



export default HrpDashboardScreen;
