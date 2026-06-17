import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, SafeAreaView, Platform, Image, TextInput } from 'react-native';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Modal } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import SignatureCanvas from 'react-signature-canvas';
import { FontAwesome } from '@expo/vector-icons';
import { MapContainer, TileLayer, Marker, Polyline as LeafletPolyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import polyline from '@mapbox/polyline';
import { API_URL, API_BASE_URL } from '../config/api';
import { FEATURE_CTC_ENABLED } from '../config/featureFlags';
import { useServerEvents } from '../hooks/useServerEvents';
import { getTravelOrderPrintHtml } from '../utils/travelOrderPrintHtml';
import { getPassSlipPrintHtml } from '../utils/passSlipPrintHtml';
import { stripArrivalStatusDisplaySuffix } from '../utils/arrivalStatusDisplay';
import { formatRoleLabel } from '../utils/roleLabels';
import TravelOrderFormWeb from '../components/TravelOrderFormWeb';
import MonitoringApprovedTravelOrdersCard, { ApprovedTravelOrder } from '../components/MonitoringApprovedTravelOrdersCard';
import MonitoringActivePassSlipsCard from '../components/MonitoringActivePassSlipsCard';
import HrpReportsAnalytics from '../components/HrpReportsAnalytics';
import PassSlipTrackerScreen from './PassSlipTrackerScreen';
import PassSlipCalendarScreen from './PassSlipCalendarScreen';
import HrpUserApprovals from '../components/HrpUserApprovals';
import { styles } from './HrpDashboardScreen.styles';
import { profilePictureUri } from '../utils/profilePictureUri';
import { hasScheduledDeparturePassed } from '../utils/manilaDate';

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
  passSlipSeconds?: number;
  passSlipMinutes?: number;
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
  /** Populated when the first-line approver slot was signed by an OIC standing in for this user. */
  approvedBySignedAsOicFor?: { _id: string; name?: string; role?: string } | null;
  hrApprovedBy?: Employee;
  signature?: string;
  approverSignature?: string;
  hrApproverSignature?: string;
  departureTime?: string;
  arrivalTime?: string;
  actualMinutesUsed?: number;
  latitude?: number;
  longitude?: number;
  originLatitude?: number;
  originLongitude?: number;
  routePolyline?: string;
  trackingNo?: string;
  /** Next tracking number preview from server (before HR records the slip). */
  trackingNoPreview?: string;
  arrivalStatus?: string;
  overdueMinutes?: number;
  rejectionReason?: string;
  closureReason?: string;
}

interface TravelOrder {
  _id: string;
  employee: Employee;
  /** Submitter role snapshot from server */
  employeeRole?: string;
  travelOrderNo: string;
  /** Next travel order number preview from server (before HR final approval). */
  travelOrderNoPreview?: string;
  date: string;
  address: string;
  salary: string;
  to: string;
  purpose: string;
  departureDate: string;
  arrivalDate: string;
  additionalInfo: string;
  travelType?: 'OB' | 'OT';
  timeOut?: string;
  officialBusinessNote?: string;
  chargeableAgainstHigherEd?: boolean;
  chargeableAgainstNote?: string;
  timeOut?: string;
  status: string;
  recommendedBy: Employee[];
  approvedBy?: Employee;
  hrApprovedBy?: Employee; // Added for type consistency, though travel orders use approvedBy for HR approval
  presidentApprovedBy?: Employee;
  /** Populated when the President's slot was signed by an OIC standing in for them. */
  presidentSignedAsOicFor?: { _id: string; name?: string; role?: string } | null;
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
  recommenderSignatures?: { user?: string | { _id?: string; name?: string }; signature?: string; signedAsOicFor?: { _id?: string; name?: string } | null }[];
  recommendersWhoApproved?: string[];
  document?: { name?: string; contentType?: string } | null;
  documents?: { name?: string; contentType?: string }[] | null;
  rejectionReason?: string;
}

type MonitoringPassSlip = PassSlip & { type: 'slip' };
type MonitoringItem = MonitoringPassSlip;

type ItemType = 'slip' | 'order';
type DashboardView = 'dashboard' | 'records' | 'reports' | 'monitoring' | 'calendar' | 'passSlipTracker' | 'userApprovals';

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data?.message) {
    return String(err.response.data.message);
  }
  return fallback;
}

type ReviewActionKind = 'record' | 'sendToPresident' | 'close';

type ReviewActionFeedback = {
  variant: 'success' | 'error';
  message: string;
  action: ReviewActionKind;
};

function reviewActionFeedbackTitle(feedback: ReviewActionFeedback): string {
  if (feedback.variant === 'error') {
    if (feedback.action === 'record') return 'Could not record';
    if (feedback.action === 'sendToPresident') return 'Could not send';
    if (feedback.action === 'close') return 'Could not close';
    return 'Could not complete action';
  }
  if (feedback.action === 'record') return 'Recorded';
  if (feedback.action === 'sendToPresident') return 'Sent to President';
  if (feedback.action === 'close') return 'Closed';
  return 'Done';
}

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

const printHtmlInHiddenFrame = async (html: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const frameWin = iframe.contentWindow;
      if (!frameWin) {
        document.body.removeChild(iframe);
        reject(new Error('Print frame not available.'));
        return;
      }

      const cleanup = () => {
        try {
          document.body.removeChild(iframe);
        } catch {
          // no-op
        }
      };

      const waitForFrameImages = async (frameWin: Window, timeoutMs = 3000): Promise<void> => {
        const startedAt = Date.now();
        await new Promise<void>((imagesReadyResolve) => {
          const check = () => {
            const imgs = Array.from(frameWin.document.images || []);
            const done = imgs.every((img) => img.complete);
            if (done || Date.now() - startedAt >= timeoutMs) {
              imagesReadyResolve();
              return;
            }
            setTimeout(check, 80);
          };
          check();
        });
      };

      const startPrint = async () => {
        try {
          await waitForFrameImages(frameWin);
          frameWin.focus();
          frameWin.print();
          cleanup();
          resolve();
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error('Failed to print frame.'));
        }
      };

      frameWin.document.open();
      frameWin.document.write(html);
      frameWin.document.close();
      void startPrint();
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to initialize print frame.'));
    }
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
  employeeRole: o.employeeRole,
  purpose: o.purpose,
  to: o.to,
  date: o.date,
  travelOrderNo: o.travelOrderNo,
  employeeAddress: o.employeeAddress,
  salary: o.salary || '',
  departureDate: o.departureDate,
  arrivalDate: o.arrivalDate,
  additionalInfo: o.additionalInfo || '',
  travelType: o.travelType === 'OT' ? 'OT' : 'OB',
  timeOut: o.timeOut || '',
  officialBusinessNote: o.officialBusinessNote || '',
  chargeableAgainstHigherEd: !!o.chargeableAgainstHigherEd,
  chargeableAgainstNote: o.chargeableAgainstNote || '',
  recommendedBy: o.recommendedBy?.map((e) => ({ _id: e._id, id: e._id, name: e.name || '' })),
  recommenderSignatures: o.recommenderSignatures,
  recommendersWhoApproved: o.recommendersWhoApproved,
  approverSignature: o.approverSignature,
  participants: o.participants,
  presidentSignature: o.presidentSignature,
  presidentApprovedBy: o.presidentApprovedBy ? { name: o.presidentApprovedBy.name } : undefined,
  presidentSignedAsOicFor: o.presidentSignedAsOicFor || undefined,
  approvedBy: o.approvedBy ? { _id: o.approvedBy._id, name: o.approvedBy.name } : undefined,
  latitude: o.latitude,
  longitude: o.longitude,
  document: o.document,
  documents: o.documents,
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

/** Default origin for Mati-city pass slips when employee GPS / route were not stored. */
const DORSU_MATI_ORIGIN = { lat: 7.0731, lon: 126.2167, name: 'DOrSU (Mati area)' };

function decodeStoredPolyline(encoded: string | undefined | null): Array<[number, number]> | null {
  if (!encoded) return null;
  try {
    const decoded = polyline.decode(encoded);
    if (!decoded?.length) return null;
    return decoded.map((p) => [p[0], p[1]] as [number, number]);
  } catch {
    return null;
  }
}

async function fetchDrivingPolyline(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number,
): Promise<Array<[number, number]> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${destLon},${destLat}?overview=full&geometries=polyline`;
    const response = await fetch(url, { signal: controller.signal });
    const json = await response.json();
    const geometry = json?.routes?.[0]?.geometry;
    if (!geometry) return null;
    return decodeStoredPolyline(geometry);
  } catch (error) {
    console.error('OSRM route fetch failed:', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const destIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapRouteFitBounds({
  destLat,
  destLon,
  startLat,
  startLon,
  polyline,
}: {
  destLat: number;
  destLon: number;
  startLat: number | null;
  startLon: number | null;
  polyline: Array<[number, number]> | null;
}) {
  const map = useMap();

  useEffect(() => {
    const points: L.LatLngExpression[] = [[destLat, destLon]];
    if (startLat != null && startLon != null) {
      points.push([startLat, startLon]);
    }
    if (polyline?.length) {
      for (const point of polyline) {
        points.push(point);
      }
    }
    if (points.length <= 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48] });
  }, [map, destLat, destLon, startLat, startLon, polyline]);

  return null;
}

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
  const { isNarrow, isCompact, width: viewportWidth } = useResponsiveLayout();
  const sigCanvasWidth = Math.max(220, Math.min(300, viewportWidth - 80));
  const sigCanvasHeight = isCompact ? 160 : 200;

  const [forReviewItems, setForReviewItems] = useState<(PassSlip | TravelOrder)[]>([]);
  const [verifiedSlips, setVerifiedSlips] = useState<PassSlip[]>([]);
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([]);
  const [monitoringApprovedTravelOrders, setMonitoringApprovedTravelOrders] = useState<ApprovedTravelOrder[]>([]);
  const [records, setRecords] = useState<(PassSlip | TravelOrder)[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<(PassSlip | TravelOrder)[]>([]);
  const [campusFilter, setCampusFilter] = useState('All Campuses');
  const [facultyFilter, setFacultyFilter] = useState('All Faculties');
  const [fileTypeFilter, setFileTypeFilter] = useState('All');
  const [recordsSearchQuery, setRecordsSearchQuery] = useState('');
  const [recordsPageSize, setRecordsPageSize] = useState(25);
  const [recordsCurrentPage, setRecordsCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigation = useNavigation<HrpDashboardNavigationProp>();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PassSlip | TravelOrder | MonitoringItem | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ItemType | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>('dashboard');
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [monitoringSubView, setMonitoringSubView] = useState<'slip' | 'order'>('slip');
  const [isMonitoringExpanded, setIsMonitoringExpanded] = useState(true);
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [travelOrderNoSignature, setTravelOrderNoSignature] = useState<string | null>(null);
  const [departureSignature, setDepartureSignature] = useState<string | null>(null);
  const [arrivalSignature, setArrivalSignature] = useState<string | null>(null);
  const [activeSignatureField, setActiveSignatureField] = useState<'travelOrderNo' | 'departure' | 'arrival' | null>(null);
  const [trackingNoPreview, setTrackingNoPreview] = useState<string | null>(null);
  const [travelOrderNoPreview, setTravelOrderNoPreview] = useState<string | null>(null);
  let sigPad = React.useRef<any>({});
  const [isSignatureModalVisible, setIsSignatureModalVisible] = useState(false);
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [mapData, setMapData] = useState<{ lat: number; lon: number; polyline: Array<[number, number]> | null, startLat: number | null, startLon: number | null, startName: string | null, destName: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState<'slips' | 'orders'>('slips');
  const [approvedPassSlips, setApprovedPassSlips] = useState<PassSlip[]>([]);
  const [presidentName, setPresidentName] = useState('');
  const [hrSignatureForPresident, setHrSignatureForPresident] = useState<string | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [closeComment, setCloseComment] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [returnFeedback, setReturnFeedback] = useState<{ variant: 'success' | 'error'; message: string } | null>(null);
  const [reviewActionFeedback, setReviewActionFeedback] = useState<ReviewActionFeedback | null>(null);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [isCtcModalVisible, setIsCtcModalVisible] = useState(false);
  const [selectedCtcOrder, setSelectedCtcOrder] = useState<ApprovedTravelOrder | null>(null);
  /** Set when Travel Complete is pressed so the certificate date reflects that moment */
  const [ctcIssueDateIso, setCtcIssueDateIso] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [liveUpdateMessage, setLiveUpdateMessage] = useState<string | null>(null);

  const isSelectedItemInForReview = useMemo(() => {
    if (!selectedItem) return false;
    return forReviewItems.some((item) => item._id === selectedItem._id);
  }, [forReviewItems, selectedItem]);

  const trackerPassSlips = useMemo<PassSlip[]>(() => {
    const recordsPassSlips = records.filter((item): item is PassSlip => 'destination' in item);
    const verifiedPassSlips = monitoringItems.filter((item) => item.type === 'slip');
    const merged = [...approvedPassSlips, ...verifiedPassSlips, ...recordsPassSlips];
    const byId = new Map<string, PassSlip>();
    for (const slip of merged) {
      if (!slip?._id) continue;
      byId.set(String(slip._id), slip);
    }
    return Array.from(byId.values());
  }, [approvedPassSlips, monitoringItems, records]);

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

  const showLiveUpdate = useCallback((message: string) => {
    setLiveUpdateMessage(message);
  }, []);

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsLoading(true);
      setError('');
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };

      const [slipsResponse, ordersResponse, presidentApprovedOrdersResponse, verifiedSlipsResponse, approvedOrdersResponse, approvedPassSlipsResponse] = await Promise.all([
        axios.get<PassSlip[]>(`${API_URL}/pass-slips/recommended`, { headers }),
        axios.get<TravelOrder[]>(`${API_URL}/travel-orders/recommended`, { headers }),
        axios.get<TravelOrder[]>(`${API_URL}/travel-orders/hr-approved`, { headers }), // Fetches President Approved orders
        axios.get<PassSlip[]>(`${API_URL}/pass-slips/verified-hr`, { headers }),
        axios.get<ApprovedTravelOrder[]>(`${API_URL}/travel-orders/approved`, { headers }),
        axios.get<PassSlip[]>(`${API_URL}/pass-slips/hr-approved`, { headers }),
      ]);

      const allSlips = slipsResponse.data;
      const allOrders = [...ordersResponse.data, ...presidentApprovedOrdersResponse.data];

      setForReviewItems([...allSlips, ...allOrders]);

      const verifiedSlips = verifiedSlipsResponse.data.map(item => ({ ...item, type: 'slip' as const }));
      setMonitoringItems([...verifiedSlips]);

      setMonitoringApprovedTravelOrders(
        (approvedOrdersResponse.data || []).filter((o) => o.status === 'Approved')
      );
      setApprovedPassSlips(approvedPassSlipsResponse.data || []);

      const recordsResponse = await axios.get(`${API_URL}/records`, { headers });
      setRecords(recordsResponse.data);
      setFilteredRecords(recordsResponse.data);
      setCalendarRefreshKey((key) => key + 1);

    } catch (err) {
      if (!silent) {
        setError('Failed to fetch requests. Please try again.');
      }
      console.error(err);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  const fetchUserData = useCallback(async () => {
    const token = await AsyncStorage.getItem('userToken');
    const headers = { 'x-auth-token': token };
    try {
      const response = await axios.get(`${API_URL}/users/me`, { headers });
      setName(response.data.name);
      if (response.data._id) {
        setCurrentUserId(String(response.data._id));
      }
    } catch (error) {
      console.error('Failed to fetch user data', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      fetchUserData();
    }, [fetchData, fetchUserData])
  );

  useEffect(() => {
    if (!liveUpdateMessage) return;
    const timer = setTimeout(() => setLiveUpdateMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [liveUpdateMessage]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchData({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchData]);

  useServerEvents({
    enabled: Platform.OS === 'web',
    currentUserId,
    onDataChange: (message) => {
      void fetchData({ silent: true });
      if (message) showLiveUpdate(message);
    },
    onNotification: (payload) => {
      if (!currentUserId || !payload.userId || String(payload.userId) !== String(currentUserId)) {
        return;
      }
      const text = payload.notification?.message?.trim();
      void fetchData({ silent: true });
      showLiveUpdate(text || 'You have a new notification — your dashboard has been updated.');
    },
  });

  useEffect(() => {
    let tempRecords = records;
    const searchTerm = recordsSearchQuery.trim().toLowerCase();

    if (campusFilter && campusFilter !== 'All Campuses') {
      tempRecords = tempRecords.filter(r => r.employee.campus === campusFilter);
    }
    if (facultyFilter && facultyFilter !== 'All Faculties') {
      tempRecords = tempRecords.filter(r => r.employee.faculty === facultyFilter);
    }
    if (fileTypeFilter !== 'All') {
      tempRecords = tempRecords.filter(r => ('destination' in r ? 'Pass Slip' : 'Travel Order') === fileTypeFilter);
    }
    if (searchTerm) {
      tempRecords = tempRecords.filter((r) => {
        const typeLabel = 'destination' in r ? 'pass slip' : 'travel order';
        const searchable = [
          r.employee?.name || '',
          r.employee?.campus || '',
          r.employee?.faculty || '',
          r.arrivalStatus || '',
          r.purpose || '',
          typeLabel,
          'destination' in r ? r.destination || '' : '',
          'trackingNo' in r ? r.trackingNo || '' : '',
          'travelOrderNo' in r ? r.travelOrderNo || '' : '',
        ]
          .join(' ')
          .toLowerCase();
        return searchable.includes(searchTerm);
      });
    }

    setFilteredRecords(tempRecords);
    setRecordsCurrentPage(1);
  }, [campusFilter, facultyFilter, fileTypeFilter, recordsSearchQuery, records]);

  const totalRecordPages = Math.max(1, Math.ceil(filteredRecords.length / recordsPageSize));
  const safeRecordsCurrentPage = Math.min(recordsCurrentPage, totalRecordPages);
  const paginatedRecords = useMemo(() => {
    const start = (safeRecordsCurrentPage - 1) * recordsPageSize;
    return filteredRecords.slice(start, start + recordsPageSize);
  }, [filteredRecords, safeRecordsCurrentPage, recordsPageSize]);

  useEffect(() => {
    if (recordsCurrentPage !== safeRecordsCurrentPage) {
      setRecordsCurrentPage(safeRecordsCurrentPage);
    }
  }, [recordsCurrentPage, safeRecordsCurrentPage]);

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

  const handleExpirePassSlip = async (id: string, closureReason?: string) => {
    if (isSubmittingReview) return;
    setIsSubmittingReview(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const data: { status: string; closureReason?: string } = { status: 'Expired' };
      if (closureReason != null && closureReason.trim() !== '') {
        data.closureReason = closureReason.trim();
      }
      await axios.put(`${API_URL}/pass-slips/${id}/status`, data, { headers });
      setReviewActionFeedback({
        variant: 'success',
        message: 'Pass slip has been closed without deducting minutes.',
        action: 'close',
      });
      setCloseModalVisible(false);
      setCloseComment('');
      setIsModalVisible(false);
      setSelectedItem(null);
      setSelectedItemType(null);
      fetchData({ silent: true });
    } catch (err) {
      const apiMessage = getApiErrorMessage(err, 'Failed to close the pass slip.');
      console.error('Pass slip close failed:', apiMessage, err);
      setReviewActionFeedback({ variant: 'error', message: apiMessage, action: 'close' });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleUpdateStatus = async (type: ItemType, id: string, status: 'Approved' | 'Completed' | 'Rejected' | 'Recommended' | 'For President Approval', rejectionReason?: string) => {
    const isReturn = status === 'Rejected';
    const isRecordPassSlip = type === 'slip' && status === 'Approved';
    const isSendToPresident = type === 'order' && status === 'For President Approval';
    const isRecordTravelOrder = type === 'order' && status === 'Approved';
    const reviewAction: ReviewActionKind | null = isRecordPassSlip || isRecordTravelOrder
      ? 'record'
      : isSendToPresident
        ? 'sendToPresident'
        : null;

    if (isReturn) {
      if (isRejecting) return;
      setIsRejecting(true);
    } else {
      if (isSubmittingReview) return;
      setIsSubmittingReview(true);
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const url = type === 'slip' ? `${API_URL}/pass-slips/${id}/status` : `${API_URL}/travel-orders/${id}/status`;
      let data: { status: string; approverSignature?: string; travelOrderNoSignature?: string | null; departureSignature?: string | null; arrivalSignature?: string | null; rejectionReason?: string; } = { status };
      if (status === 'Rejected' && rejectionReason != null && rejectionReason.trim() !== '') {
        data.rejectionReason = rejectionReason.trim();
      }

      if (type === 'order' && status === 'Approved') {
        data.travelOrderNoSignature = travelOrderNoSignature;
        data.departureSignature = departureSignature;
        data.arrivalSignature = arrivalSignature;
      }
      if (type === 'order' && status === 'For President Approval') {
        data.approverSignature = hrSignatureForPresident ?? '';
      }

      await axios.put(url, data, { headers });

      if (reviewAction) {
        const successMessage =
          reviewAction === 'record'
            ? type === 'slip'
              ? 'Pass slip has been recorded successfully.'
              : 'Travel order has been recorded successfully.'
            : reviewAction === 'sendToPresident'
              ? 'Travel order has been sent to the President for approval.'
              : '';
        setReviewActionFeedback({ variant: 'success', message: successMessage, action: reviewAction });
        setHrSignatureForPresident(null);
        setIsModalVisible(false);
        setSelectedItem(null);
        setSelectedItemType(null);
        fetchData({ silent: true });
      } else if (isReturn) {
        setReturnFeedback({ variant: 'success', message: 'Request has been returned to the employee.' });
        setHrSignatureForPresident(null);
        setRejectModalVisible(false);
        setRejectComment('');
        fetchData({ silent: true });
        setIsModalVisible(false);
        setSelectedItem(null);
      } else {
        setHrSignatureForPresident(null);
        setRejectModalVisible(false);
        setRejectComment('');
        fetchData({ silent: true });
        setIsModalVisible(false);
        setSelectedItem(null);
        setSelectedItemType(null);
      }
    } catch (err) {
      if (isReturn) {
        setReturnFeedback({
          variant: 'error',
          message: getApiErrorMessage(err, 'Failed to return the request.'),
        });
      } else if (reviewAction) {
        const fallback =
          reviewAction === 'record'
            ? type === 'slip'
              ? 'Failed to record the pass slip.'
              : 'Failed to record the travel order.'
            : reviewAction === 'sendToPresident'
              ? 'Failed to send the travel order to the President.'
              : 'Failed to update the request.';
        const apiMessage = getApiErrorMessage(err, fallback);
        console.error('Review action failed:', apiMessage, err);
        setReviewActionFeedback({ variant: 'error', message: apiMessage, action: reviewAction });
      } else {
        const apiMessage = getApiErrorMessage(err, 'Failed to update the request status.');
        console.error('Status update failed:', apiMessage, err);
        Alert.alert('Error', apiMessage);
      }
    } finally {
      if (isReturn) setIsRejecting(false);
      else setIsSubmittingReview(false);
    }
  };

  const doLogout = async () => {
    dismissMobileSidebar();
    await AsyncStorage.multiRemove(['userToken', 'userRole']);
    navigation.replace('Login');
  };

  const handleLogout = () => {
    setLogoutConfirmVisible(true);
  };

  const cancelLogout = () => {
    setLogoutConfirmVisible(false);
  };

  const confirmLogout = () => {
    setLogoutConfirmVisible(false);
    void doLogout();
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

  /** Print pass slip in a dedicated A4 layout with 4 copies (2x2 grid). */
  const handlePrintPassSlip = (item: PassSlip) => {
    void (async () => {
      try {
        const html = getPassSlipPrintHtml(item);
        await printHtmlInHiddenFrame(html);
      } catch (error) {
        try {
          // Fallback print flow without logo if image resolution fails.
          const html = getPassSlipPrintHtml(item);
          await printHtmlInHiddenFrame(html);
          console.error('Pass slip print fallback used:', error);
        } catch (fallbackError) {
          console.error('Pass slip printing failed:', fallbackError);
          Alert.alert('Print Error', 'Unable to open print dialog. Please allow printing/popups and try again.');
        }
      }
    })();
  };

  const fetchDocumentNumberPreview = async (item: PassSlip | TravelOrder | MonitoringItem, type: ItemType) => {
    setTrackingNoPreview(null);
    setTravelOrderNoPreview(null);

    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };

      if (type === 'slip') {
        const slip = item as PassSlip;
        if (slip.trackingNo?.trim()) {
          setTrackingNoPreview(slip.trackingNo.trim());
          return;
        }
        if (slip.trackingNoPreview?.trim()) {
          setTrackingNoPreview(slip.trackingNoPreview.trim());
          return;
        }
        const { data } = await axios.get<{ preview?: string }>(
          `${API_URL}/pass-slips/${slip._id}/preview-tracking-no`,
          { headers },
        );
        setTrackingNoPreview(data.preview?.trim() || '—');
        return;
      }

      const order = item as TravelOrder;
      if (order.travelOrderNo?.trim()) {
        setTravelOrderNoPreview(order.travelOrderNo.trim());
        return;
      }
      if (order.travelOrderNoPreview?.trim()) {
        setTravelOrderNoPreview(order.travelOrderNoPreview.trim());
        return;
      }
      const { data } = await axios.get<{ preview?: string }>(
        `${API_URL}/travel-orders/${order._id}/preview-order-no`,
        { headers },
      );
      setTravelOrderNoPreview(data.preview?.trim() || '—');
    } catch (err) {
      console.error('Failed to load document number preview:', err);
      if (type === 'slip') setTrackingNoPreview('—');
      else setTravelOrderNoPreview('—');
    }
  };

  const openReviewModal = (item: PassSlip | TravelOrder | MonitoringItem, type: ItemType) => {
    setSelectedItem(item);
    setSelectedItemType(type);
    if (type === 'slip') {
      const slip = item as PassSlip;
      setTrackingNoPreview(
        slip.trackingNo?.trim() || slip.trackingNoPreview?.trim() || null,
      );
      setTravelOrderNoPreview(null);
    } else {
      const order = item as TravelOrder;
      setTravelOrderNoPreview(
        order.travelOrderNo?.trim() || order.travelOrderNoPreview?.trim() || null,
      );
      setTrackingNoPreview(null);
    }
    setIsModalVisible(true);
    void fetchDocumentNumberPreview(item, type);
  };

  const handleCalendarSlipSelect = useCallback((slip: { _id: string }) => {
    const fullSlip =
      trackerPassSlips.find((item) => item._id === slip._id) ||
      forReviewItems.find((item): item is PassSlip => 'destination' in item && item._id === slip._id) ||
      records.find((item): item is PassSlip => 'destination' in item && item._id === slip._id) ||
      (slip as PassSlip);
    openReviewModal(fullSlip, 'slip');
  }, [trackerPassSlips, forReviewItems, records]);

  const openCtcModal = (order: ApprovedTravelOrder) => {
    if (!FEATURE_CTC_ENABLED) return;
    setCtcIssueDateIso(new Date().toISOString());
    setSelectedCtcOrder(order);
    setIsCtcModalVisible(true);
  };

  const openMapModal = async (item: PassSlip | TravelOrder) => {
    if (item.latitude == null || item.longitude == null) {
      Alert.alert('Map Error', 'Location data is not available for this item.');
      return;
    }

    setMapData(null);
    setIsMapModalVisible(true);
    setMapLoading(true);

    let destLat = item.latitude;
    let destLon = item.longitude;
    let startLat: number | null = 'originLatitude' in item ? (item.originLatitude ?? null) : null;
    let startLon: number | null = 'originLongitude' in item ? (item.originLongitude ?? null) : null;
    let startName = 'Origin';
    // @ts-ignore
    let destName: string = item.destination || item.to || 'Destination';
    let decodedPolyline: Array<[number, number]> | null = null;

    try {
      if ('destination' in item) {
        const token = await AsyncStorage.getItem('userToken');
        const { data } = await axios.get(`${API_URL}/pass-slips/${item._id}/location`, {
          headers: { 'x-auth-token': token },
        });
        destLat = data.latitude;
        destLon = data.longitude;
        startLat = data.originLatitude;
        startLon = data.originLongitude;
        startName = data.originLabel || 'Origin';
        if (data.destination) destName = data.destination;

        if (data.routePolyline) {
          decodedPolyline = decodeStoredPolyline(data.routePolyline);
        }
        if ((!decodedPolyline || decodedPolyline.length <= 1) && Array.isArray(data.routeCoordinates)) {
          decodedPolyline = data.routeCoordinates.map(
            (p: number[]) => [p[0], p[1]] as [number, number],
          );
        }
        if ((!decodedPolyline || decodedPolyline.length <= 1) && startLat != null && startLon != null) {
          decodedPolyline = [
            [startLat, startLon],
            [destLat, destLon],
          ];
        }
      } else {
        decodedPolyline = decodeStoredPolyline(item.routePolyline);
        if (decodedPolyline?.length && (startLat == null || startLon == null)) {
          startLat = decodedPolyline[0][0];
          startLon = decodedPolyline[0][1];
        }
        if (startLat == null || startLon == null) {
          startLat = DORSU_MATI_ORIGIN.lat;
          startLon = DORSU_MATI_ORIGIN.lon;
          startName = DORSU_MATI_ORIGIN.name;
        }
        if (!decodedPolyline || decodedPolyline.length <= 1) {
          const fetched = await fetchDrivingPolyline(startLat, startLon, destLat, destLon);
          decodedPolyline = fetched?.length
            ? fetched
            : [
                [startLat, startLon],
                [destLat, destLon],
              ];
        }
      }
    } catch (error) {
      console.warn('Could not load map route from server:', error);
      if (startLat == null || startLon == null) {
        startLat = DORSU_MATI_ORIGIN.lat;
        startLon = DORSU_MATI_ORIGIN.lon;
        startName = DORSU_MATI_ORIGIN.name;
      }
      if (!decodedPolyline || decodedPolyline.length <= 1) {
        decodedPolyline = [
          [startLat, startLon],
          [destLat, destLon],
        ];
      }
    }

    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
      iconUrl: require('leaflet/dist/images/marker-icon.png'),
      shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
    });

    setMapData({
      lat: destLat,
      lon: destLon,
      polyline: decodedPolyline,
      startLat,
      startLon,
      startName,
      destName,
    });
    setMapLoading(false);
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

  const getNavItemStyle = (view: DashboardView) => ({ pressed }: { pressed: boolean }) => [
    styles.navItem,
    activeView === view && styles.activeNavItem,
    pressed && styles.navItemPressed,
  ];

  const getSubNavItemStyle = (isActive: boolean) => ({ pressed }: { pressed: boolean }) => [
    styles.subNavItem,
    isActive && styles.subNavItemActive,
    pressed && styles.subNavItemPressed,
  ];

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
            <Text style={styles.navSectionLabel}>Main Menu</Text>
            <Pressable
              style={getNavItemStyle('dashboard')}
              onPress={() => {
                setActiveView('dashboard');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="th-large" size={20} color={activeView === 'dashboard' ? '#011a6b' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'dashboard' && styles.activeNavText]}>Dashboard</Text>
            </Pressable>
            <Pressable
              style={getNavItemStyle('records')}
              onPress={() => {
                setActiveView('records');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="folder-open-o" size={20} color={activeView === 'records' ? '#011a6b' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'records' && styles.activeNavText]}>Records</Text>
            </Pressable>
            <Pressable
              style={getNavItemStyle('reports')}
              onPress={() => {
                setActiveView('reports');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="bar-chart" size={20} color={activeView === 'reports' ? '#011a6b' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'reports' && styles.activeNavText]}>Reports</Text>
            </Pressable>
            <Pressable
              style={getNavItemStyle('monitoring')}
              onPress={() => {
                setActiveView('monitoring');
                setIsMonitoringExpanded(true);
                // default sub-view
                if (!monitoringSubView) setMonitoringSubView('slip');
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="map-marker" size={20} color={activeView === 'monitoring' ? '#011a6b' : 'rgba(255,255,255,0.75)'} />
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.navText, activeView === 'monitoring' && styles.activeNavText]}>Monitoring</Text>
                <Pressable
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    setIsMonitoringExpanded((prev) => !prev);
                  }}
                  hitSlop={8}
                >
                  <FontAwesome
                    name={isMonitoringExpanded ? 'chevron-down' : 'chevron-right'}
                    size={14}
                    color={activeView === 'monitoring' ? '#011a6b' : 'rgba(255,255,255,0.55)'}
                  />
                </Pressable>
              </View>
            </Pressable>
            {activeView === 'monitoring' && isMonitoringExpanded && (
              <View style={styles.subNav}>
                <Pressable
                  style={getSubNavItemStyle(monitoringSubView === 'slip')}
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
                  style={getSubNavItemStyle(monitoringSubView === 'order')}
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
            <Pressable
              style={getNavItemStyle('calendar')}
              onPress={() => {
                setActiveView('calendar');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="calendar" size={20} color={activeView === 'calendar' ? '#011a6b' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'calendar' && styles.activeNavText]}>Calendar</Text>
            </Pressable>
            <Pressable
              style={getNavItemStyle('passSlipTracker')}
              onPress={() => {
                setActiveView('passSlipTracker');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="table" size={20} color={activeView === 'passSlipTracker' ? '#011a6b' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'passSlipTracker' && styles.activeNavText]}>Pass Slip Tracker</Text>
            </Pressable>

            <Pressable
              style={getNavItemStyle('userApprovals')}
              onPress={() => {
                setActiveView('userApprovals');
                dismissMobileSidebar();
              }}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="user-plus" size={20} color={activeView === 'userApprovals' ? '#011a6b' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeView === 'userApprovals' && styles.activeNavText]}>User Approvals</Text>
            </Pressable>
          </View>
          <View style={styles.sidebarBottom}>
            <Pressable
              style={({ pressed }) => [styles.profileSidebarButton, pressed && styles.profileSidebarButtonPressed]}
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
            <Pressable style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]} onPress={handleLogout}>
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
              {activeView === 'calendar' && 'Calendar'}
              {activeView === 'passSlipTracker' && 'Pass Slip Tracker'}
              {activeView === 'userApprovals' && 'User Approvals'}
            </Text>
          </View>
        </View>
        {liveUpdateMessage ? (
          <View style={[styles.liveUpdateBanner, isNarrow && styles.liveUpdateBannerMobile]}>
            <FontAwesome name="bell" size={16} color="#011a6b" />
            <Text style={styles.liveUpdateBannerText}>{liveUpdateMessage}</Text>
            <Pressable
              onPress={() => setLiveUpdateMessage(null)}
              style={styles.liveUpdateBannerDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss update notification"
            >
              <FontAwesome name="times" size={18} color="#011a6b" />
            </Pressable>
          </View>
        ) : null}
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
                  <View style={(styles as any).recordsSearchContainer}>
                    <FontAwesome name="search" size={14} color="#64748b" style={(styles as any).recordsSearchIcon} />
                    <TextInput
                      style={(styles as any).recordsSearchInput}
                      placeholder="Search employee, destination, purpose, campus, faculty, status, tracking no..."
                      placeholderTextColor="#94a3b8"
                      value={recordsSearchQuery}
                      onChangeText={setRecordsSearchQuery}
                    />
                  </View>
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
                    <View style={styles.recordsFilterGroup}>
                      <Text style={styles.recordsFilterLabel}>Rows per page</Text>
                      <select
                        value={String(recordsPageSize)}
                        onChange={e => setRecordsPageSize(Number(e.target.value))}
                        style={webStyles.recordsFilterSelect as any}
                      >
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </select>
                    </View>
                    <Pressable style={styles.recordsClearButton} onPress={() => {
                      setCampusFilter('All Campuses');
                      setFacultyFilter('All Faculties');
                      setFileTypeFilter('All');
                      setRecordsSearchQuery('');
                      setRecordsPageSize(25);
                      setRecordsCurrentPage(1);
                    }}>
                      <Text style={styles.recordsClearButtonText}>Clear</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.recordsTableCard}>
                  {filteredRecords.length > 0 ? (
                    <View>
                      <View style={(styles as any).recordsTableMeta}>
                        <Text style={(styles as any).recordsTableMetaText}>
                          Showing {Math.min((safeRecordsCurrentPage - 1) * recordsPageSize + 1, filteredRecords.length)}-
                          {Math.min(safeRecordsCurrentPage * recordsPageSize, filteredRecords.length)} of {filteredRecords.length}
                        </Text>
                        <View style={(styles as any).recordsTableMetaBadge}>
                          <Text style={(styles as any).recordsTableMetaBadgeText}>
                            {filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'}
                          </Text>
                        </View>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={(styles as any).recordsTableHorizontalScroll}
                        contentContainerStyle={{ flexGrow: 1 }}
                      >
                        <View style={[(styles as any).recordsTableInner, styles.recordsTableHeader]}>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColEmployee]}>Employee</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColTracking]}>Tracking No.</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColType]}>Type</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColDate]}>Date</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColStatus]}>Arrival</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColCampus]}>Campus</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColFaculty]}>Faculty</Text>
                          <Text style={[styles.recordsTableHeaderCell, styles.recordsColActions]}>Actions</Text>
                        </View>
                      </ScrollView>

                      {paginatedRecords.map((item, index) => {
                        const arrivalRaw =
                          'arrivalStatus' in item && item.arrivalStatus ? String(item.arrivalStatus) : '';
                        const arrivalLabel = arrivalRaw ? stripArrivalStatusDisplaySuffix(arrivalRaw) : '';
                        const isPositiveArrival =
                          arrivalLabel === 'Returned' ||
                          arrivalLabel === 'On Time' ||
                          arrivalLabel === 'Completed';

                        return (
                        <ScrollView
                          key={item._id}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={(styles as any).recordsTableHorizontalScroll}
                          contentContainerStyle={{ flexGrow: 1 }}
                        >
                          <View style={[(styles as any).recordsTableInner, styles.recordsTableRow, index % 2 === 1 && styles.recordsTableRowAlt]}>
                            <Text style={[styles.recordsTableCell, styles.recordsColEmployee]} numberOfLines={1}>
                              {item.employee?.name || 'N/A'}
                            </Text>
                            <Text style={[styles.recordsTableCell, styles.recordsColTracking]} numberOfLines={1}>
                              {'destination' in item
                                ? ((item as PassSlip).trackingNo || '—')
                                : ((item as TravelOrder).travelOrderNo || '—')}
                            </Text>
                            <View style={[styles.recordsColType]}>
                              <View style={['destination' in item ? styles.recordsBadgeSlip : styles.recordsBadgeOrder]}>
                                <View style={'destination' in item ? (styles as any).recordsBadgeSlipDot : (styles as any).recordsBadgeOrderDot} />
                                <Text style={'destination' in item ? styles.recordsBadgeSlipText : styles.recordsBadgeOrderText}>
                                  {'destination' in item ? 'Pass Slip' : 'Travel Order'}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.recordsTableCell, styles.recordsColDate]}>{formatDate(item.date)}</Text>
                            <View style={[styles.recordsColStatus]}>
                              {arrivalRaw ? (
                                <View style={isPositiveArrival ? (styles as any).recordsBadgeSuccess : (styles as any).recordsBadgeNeutral}>
                                  <View style={isPositiveArrival ? (styles as any).recordsBadgeSuccessDot : (styles as any).recordsBadgeNeutralDot} />
                                  <Text style={isPositiveArrival ? (styles as any).recordsBadgeSuccessText : (styles as any).recordsBadgeNeutralText} numberOfLines={1}>
                                    {arrivalLabel}
                                  </Text>
                                </View>
                              ) : (
                                <Text style={[styles.recordsTableCell]} numberOfLines={1}>—</Text>
                              )}
                            </View>
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
                                  void handlePrintPassSlip(item as PassSlip);
                                } else {
                                  handlePrintTravelOrder(item as TravelOrder);
                                }
                              }}>
                                <Text style={styles.recordsPrintBtnText}>Print</Text>
                              </Pressable>
                            </View>
                          </View>
                        </ScrollView>
                        );
                      })}
                      <View style={(styles as any).recordsPaginationRow}>
                        <Pressable
                          style={[(styles as any).recordsPaginationButton, safeRecordsCurrentPage === 1 && (styles as any).recordsPaginationButtonDisabled]}
                          onPress={() => setRecordsCurrentPage((prev) => Math.max(1, prev - 1))}
                          disabled={safeRecordsCurrentPage === 1}
                        >
                          <Text style={[(styles as any).recordsPaginationButtonText, safeRecordsCurrentPage === 1 && (styles as any).recordsPaginationButtonTextDisabled]}>Prev</Text>
                        </Pressable>
                        <Text style={(styles as any).recordsPaginationText}>
                          Page {safeRecordsCurrentPage} of {totalRecordPages}
                        </Text>
                        <Pressable
                          style={[(styles as any).recordsPaginationButton, safeRecordsCurrentPage === totalRecordPages && (styles as any).recordsPaginationButtonDisabled]}
                          onPress={() => setRecordsCurrentPage((prev) => Math.min(totalRecordPages, prev + 1))}
                          disabled={safeRecordsCurrentPage === totalRecordPages}
                        >
                          <Text style={[(styles as any).recordsPaginationButtonText, safeRecordsCurrentPage === totalRecordPages && (styles as any).recordsPaginationButtonTextDisabled]}>Next</Text>
                        </Pressable>
                      </View>
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
                  <MonitoringActivePassSlipsCard
                    styles={styles as any}
                    slips={monitoringItems.filter((item) => item.type === 'slip')}
                    onView={(item) => openReviewModal(item, item.type)}
                  />
                ) : (
                  // Travel Orders
                  <MonitoringApprovedTravelOrdersCard
                    styles={styles as any}
                    orders={monitoringApprovedTravelOrders}
                    onView={(order) => openReviewModal(order as any, 'order')}
                    onIssueCtc={FEATURE_CTC_ENABLED ? openCtcModal : undefined}
                  />
                )}
              </View>
            )}

            {activeView === 'passSlipTracker' && <PassSlipTrackerScreen passSlips={trackerPassSlips} />}
            {activeView === 'calendar' && (
              <PassSlipCalendarScreen
                campuses={campuses}
                faculties={faculties}
                campusFilter={campusFilter}
                facultyFilter={facultyFilter}
                onCampusFilterChange={setCampusFilter}
                onFacultyFilterChange={setFacultyFilter}
                onSelectSlip={handleCalendarSlipSelect}
                refreshKey={calendarRefreshKey}
              />
            )}
            {activeView === 'userApprovals' && <HrpUserApprovals />}
            </ScrollView>

        {/* Profile Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={profileModalVisible}
          onRequestClose={() => setProfileModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[
              styles.modalView,
              styles.profileModalView,
              isNarrow && styles.modalViewNarrow,
              isCompact && (styles as any).profileModalViewNarrow,
            ]}>
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
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => {
                if (!isSignatureModalVisible) setIsModalVisible(false);
              }}
            />
            <View style={[styles.modalView, isNarrow && styles.modalViewNarrow, styles.modalViewRaised]}>
              <View style={styles.reviewModalTopBar}>
                <Pressable
                  onPress={() => setIsModalVisible(false)}
                  style={styles.closeModalButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <FontAwesome name="times" size={20} color="#011a6b" />
                </Pressable>
              </View>
              {isSignatureModalVisible && (
                <View style={[styles.signatureModalOverlay, isNarrow && (styles as any).signatureModalOverlayNarrow]}>
                  <View style={[styles.signatureModalView, isNarrow && (styles as any).signatureModalViewNarrow]}>
                    <Text style={styles.modalTitle}>Provide Signature</Text>
                    <View style={styles.signaturePadContainer}>
                      <SignatureCanvas
                        ref={sigPad}
                        penColor='black'
                        canvasProps={{ width: sigCanvasWidth, height: sigCanvasHeight, className: 'sigCanvas' }}
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
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
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
                            <Text style={styles.docValue}>
                              {(selectedItem as PassSlip).trackingNo ||
                                trackingNoPreview ||
                                'Loading…'}
                            </Text>
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

                        {selectedItem.status === 'Rejected' &&
                          (selectedItem as PassSlip).rejectionReason != null &&
                          String((selectedItem as PassSlip).rejectionReason).trim() !== '' && (
                          <View style={styles.rejectionReasonBlock}>
                            <Text style={styles.rejectionReasonLabel}>Return reason: </Text>
                            <Text style={styles.rejectionReasonContent}>
                              {String((selectedItem as PassSlip).rejectionReason).trim()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.docSignatureContainer}>
                          <View style={styles.docSignatureBox}>
                            <Text style={styles.docField}>Requested by:</Text>
                            <View style={styles.docSignatureDisplay}>
                              {selectedItem.signature && <Image source={{ uri: selectedItem.signature }} style={styles.docSignatureImage} />}
                              <Text style={styles.docSignatureName}>{selectedItem.employee?.name}</Text>
                            </View>
                            <Text style={styles.docSignatureUnderline}>{(selectedItem as PassSlip).employee?.role === 'Faculty Dean' ? 'Faculty Dean' : (selectedItem as PassSlip).employee?.role === 'Program Head' ? 'Program Head' : formatRoleLabel((selectedItem as PassSlip).employee?.role) || 'Faculty'}</Text>
                          </View>
                          <View style={styles.docSignatureBox}>
                            <Text style={styles.docField}>Approved by:</Text>
                            <View style={styles.docSignatureDisplay}>
                              {selectedItem.approverSignature && <Image source={{ uri: selectedItem.approverSignature }} style={styles.docSignatureImage} />}
                              <Text style={styles.docSignatureName}>{(selectedItem as PassSlip).approvedBy?.name}</Text>
                            </View>
                            {(selectedItem as PassSlip).approvedBySignedAsOicFor?.name && (
                              <Text style={styles.docOicNote}>
                                (OIC for {(selectedItem as PassSlip).approvedBySignedAsOicFor?.name})
                              </Text>
                            )}
                            <Text style={styles.docSignatureUnderline}>{(selectedItem as PassSlip).employee?.role === 'Faculty Dean' ? 'President' : (selectedItem as PassSlip).employee?.role === 'Program Head' ? 'Faculty Dean' : 'Immediate Head'}</Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.travelOrderReviewWrap}>
                          <TravelOrderFormWeb
                            order={buildTravelOrderWebView(selectedItem as TravelOrder)}
                            presidentName={presidentName}
                            viewOnly
                            travelOrderNoPreview={travelOrderNoPreview || undefined}
                            onViewMap={
                              (selectedItem as TravelOrder).latitude && (selectedItem as TravelOrder).longitude
                                ? () => openMapModal(selectedItem as TravelOrder)
                                : undefined
                            }
                          />
                          {selectedItem.status === 'Rejected' &&
                            (selectedItem as TravelOrder).rejectionReason != null &&
                            String((selectedItem as TravelOrder).rejectionReason).trim() !== '' && (
                            <View style={styles.rejectionReasonBlock}>
                              <Text style={styles.rejectionReasonLabel}>Return reason: </Text>
                              <Text style={styles.rejectionReasonContent}>
                                {String((selectedItem as TravelOrder).rejectionReason).trim()}
                              </Text>
                            </View>
                          )}
                        </View>
                      </>
                    )}
                  </>
                )}
              </ScrollView>
              {selectedItem && (
                <View style={[styles.modalButtonContainer, isNarrow && (styles as any).modalButtonContainerNarrow]}>
                  {isSelectedItemInForReview ? (
                    <>
                      {(() => {
                        const isPassSlipReview = selectedItemType === 'slip';
                        const passSlipItem = isPassSlipReview ? (selectedItem as PassSlip) : null;
                        const isDeparturePassed =
                          passSlipItem != null &&
                          hasScheduledDeparturePassed(passSlipItem.date, passSlipItem.timeOut);
                        const isTravelOrderRecommended = selectedItemType === 'order' && (selectedItem as TravelOrder).status === 'Recommended';
                        const statusToSend = isTravelOrderRecommended ? 'For President Approval' : 'Approved';
                        const primaryLabel = isSubmittingReview
                          ? isPassSlipReview
                            ? isDeparturePassed
                              ? 'Closing…'
                              : 'Recording…'
                            : isTravelOrderRecommended
                              ? 'Sending…'
                              : 'Recording…'
                          : isTravelOrderRecommended
                            ? 'Send to President'
                            : 'Record';
                        const onPrimaryPress = () => {
                          handleUpdateStatus(selectedItemType!, selectedItem._id, statusToSend);
                        };
                        const onReturnPress = () => {
                          setRejectComment('');
                          setRejectModalVisible(true);
                        };
                        const onClosePress = () => {
                          setCloseComment('');
                          setCloseModalVisible(true);
                        };
                        if (isPassSlipReview && isDeparturePassed) {
                          return (
                            <>
                              <Pressable
                                style={[
                                  styles.button,
                                  styles.approveButton,
                                  styles.modalButton,
                                  styles.modalButtonDisabled,
                                ]}
                                accessibilityRole="button"
                                disabled
                              >
                                <Text style={styles.buttonText}>Record</Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.button,
                                  styles.closeButton,
                                  styles.modalButton,
                                  isSubmittingReview && styles.modalButtonDisabled,
                                ]}
                                accessibilityRole="button"
                                disabled={isSubmittingReview}
                                onPress={onClosePress}
                              >
                                <Text style={styles.buttonText}>
                                  {isSubmittingReview ? 'Closing…' : 'Close'}
                                </Text>
                              </Pressable>
                            </>
                          );
                        }
                        return (
                          <>
                            <Pressable
                              style={[
                                styles.button,
                                styles.approveButton,
                                styles.modalButton,
                                isSubmittingReview && styles.modalButtonDisabled,
                              ]}
                              accessibilityRole="button"
                              disabled={isSubmittingReview}
                              onPress={onPrimaryPress}
                            >
                              <Text style={styles.buttonText}>{primaryLabel}</Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.button,
                                styles.rejectButton,
                                styles.modalButton,
                                isSubmittingReview && styles.modalButtonDisabled,
                              ]}
                              accessibilityRole="button"
                              disabled={isSubmittingReview}
                              onPress={onReturnPress}
                            >
                              <Text style={styles.buttonText}>Return</Text>
                            </Pressable>
                          </>
                        );
                      })()}
                    </>
                  ) : null}
                  {selectedItemType === 'order' && !isSelectedItemInForReview && (
                    <Pressable style={[styles.button, styles.printButton, styles.modalButton]} onPress={() => handlePrintTravelOrder(selectedItem as TravelOrder)}>
                      <Text style={styles.buttonText}>Print</Text>
                    </Pressable>
                  )}
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
            <View style={[
              styles.modalView,
              styles.ctcModalView,
              isNarrow && styles.modalViewNarrow,
              isCompact && (styles as any).ctcModalViewNarrow,
            ]}>
              <View style={[styles.modalHeader, isNarrow && (styles as any).modalHeaderNarrow]}>
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
              <View style={[styles.modalButtonContainer, isNarrow && (styles as any).modalButtonContainerNarrow]}>
                <Pressable style={[styles.button, styles.cancelButton, styles.modalButton]} onPress={() => setIsCtcModalVisible(false)}>
                  <Text style={styles.buttonText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Logout confirmation modal */}
        <Modal
          animationType="fade"
          transparent
          visible={logoutConfirmVisible}
          onRequestClose={cancelLogout}
        >
          <View style={styles.rejectModalOverlay}>
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>Confirm logout</Text>
              <Text style={styles.rejectModalSubtitle}>
                Are you sure you want to logout? You will need to sign in again to continue.
              </Text>
              <View style={styles.rejectModalButtons}>
                <Pressable style={[styles.rejectModalButton, styles.rejectModalCancel]} onPress={cancelLogout}>
                  <Text style={styles.rejectModalCancelText}>Stay logged in</Text>
                </Pressable>
                <Pressable style={[styles.rejectModalButton, (styles as any).logoutModalConfirmButton]} onPress={confirmLogout}>
                  <Text style={(styles as any).logoutModalConfirmText}>Logout</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Return result (success / error) — Modal works on web; Alert.alert does not reliably show there */}
        <Modal
          animationType="fade"
          transparent
          visible={!!returnFeedback}
          onRequestClose={() => setReturnFeedback(null)}
        >
          <View style={styles.rejectModalOverlay}>
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>
                {returnFeedback?.variant === 'success' ? 'Returned' : 'Could not return'}
              </Text>
              <Text style={styles.rejectModalSubtitle}>{returnFeedback?.message}</Text>
              <View style={styles.rejectModalButtons}>
                <Pressable
                  style={[styles.rejectModalButton, styles.markCompleteModalPrimaryButton]}
                  onPress={() => setReturnFeedback(null)}
                >
                  <Text style={styles.markCompleteModalPrimaryButtonText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Review action result (Record / Send to President / Close) — Modal works on web */}
        <Modal
          animationType="fade"
          transparent
          visible={!!reviewActionFeedback}
          onRequestClose={() => setReviewActionFeedback(null)}
        >
          <View style={styles.rejectModalOverlay}>
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>
                {reviewActionFeedback ? reviewActionFeedbackTitle(reviewActionFeedback) : ''}
              </Text>
              <Text style={styles.rejectModalSubtitle}>{reviewActionFeedback?.message}</Text>
              <View style={styles.rejectModalButtons}>
                <Pressable
                  style={[styles.rejectModalButton, styles.markCompleteModalPrimaryButton]}
                  onPress={() => setReviewActionFeedback(null)}
                >
                  <Text style={styles.markCompleteModalPrimaryButtonText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Close expired pass slip confirmation */}
        <Modal
          animationType="fade"
          transparent
          visible={closeModalVisible}
          onRequestClose={() => !isSubmittingReview && setCloseModalVisible(false)}
        >
          <View style={styles.rejectModalOverlay}>
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>Close pass slip</Text>
              <Text style={styles.rejectModalSubtitle}>
                This pass slip can no longer be recorded. Close it without deducting minutes from the employee&apos;s balance.
              </Text>
              <TextInput
                style={styles.rejectCommentInput}
                placeholder="Comment (optional)"
                placeholderTextColor="#999"
                value={closeComment}
                onChangeText={setCloseComment}
                multiline
                numberOfLines={3}
                editable={!isSubmittingReview}
              />
              <View style={styles.rejectModalButtons}>
                <Pressable
                  style={[styles.rejectModalButton, styles.rejectModalCancel]}
                  onPress={() => {
                    if (!isSubmittingReview) {
                      setCloseModalVisible(false);
                      setCloseComment('');
                    }
                  }}
                  disabled={isSubmittingReview}
                >
                  <Text style={styles.rejectModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.rejectModalButton, styles.closeModalConfirm, isSubmittingReview && { opacity: 0.6 }]}
                  onPress={() => selectedItem && handleExpirePassSlip(selectedItem._id, closeComment)}
                  disabled={isSubmittingReview}
                >
                  <Text style={styles.closeModalConfirmText}>
                    {isSubmittingReview ? 'Closing…' : 'Confirm Close'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Return confirmation modal with optional comment */}
        <Modal
          animationType="fade"
          transparent
          visible={rejectModalVisible}
          onRequestClose={() => !isRejecting && setRejectModalVisible(false)}
        >
          <View style={styles.rejectModalOverlay}>
            <View style={styles.rejectModalContent}>
              <Text style={styles.rejectModalTitle}>Return request</Text>
              <Text style={styles.rejectModalSubtitle}>Add an optional comment for the employee (e.g. reason for return).</Text>
              <TextInput
                style={styles.rejectCommentInput}
                placeholder="Comment (optional)"
                placeholderTextColor="#999"
                value={rejectComment}
                onChangeText={setRejectComment}
                multiline
                numberOfLines={3}
                editable={!isRejecting}
              />
              <View style={styles.rejectModalButtons}>
                <Pressable
                  style={[styles.rejectModalButton, styles.rejectModalCancel]}
                  onPress={() => { if (!isRejecting) { setRejectModalVisible(false); setRejectComment(''); } }}
                  disabled={isRejecting}
                >
                  <Text style={styles.rejectModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.rejectModalButton, styles.rejectModalConfirm, isRejecting && { opacity: 0.6 }]}
                  onPress={() => selectedItem && selectedItemType && handleUpdateStatus(selectedItemType, selectedItem._id, 'Rejected', rejectComment)}
                  disabled={isRejecting}
                >
                  <Text style={styles.rejectModalConfirmText}>
                    {isRejecting ? 'Returning…' : 'Confirm Return'}
                  </Text>
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
            <View style={[
              styles.modalView,
              styles.mapModalView,
              isNarrow && styles.modalViewNarrow,
              isNarrow && (styles as any).mapModalViewNarrow,
            ]}>
              <View style={[styles.modalHeader, isNarrow && (styles as any).modalHeaderNarrow]}>
                <Text style={styles.modalTitle}>Route Map</Text>
                <Pressable onPress={() => setIsMapModalVisible(false)} style={styles.closeModalButton}>
                  <FontAwesome name="close" size={24} color="#333" />
                </Pressable>
              </View>
              {mapLoading && (
                <View style={styles.mapLoadingOverlay}>
                  <ActivityIndicator size="large" color="#011a6b" />
                  <Text style={styles.mapLoadingText}>Loading route…</Text>
                </View>
              )}
              {mapData && !mapLoading && (
                <MapContainer
                  key={`${mapData.lat}-${mapData.lon}-${mapData.startLat}-${mapData.startLon}-${mapData.polyline?.length ?? 0}`}
                  center={[mapData.lat, mapData.lon]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution='&copy; Esri &mdash; source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  />
                  <MapRouteFitBounds
                    destLat={mapData.lat}
                    destLon={mapData.lon}
                    startLat={mapData.startLat}
                    startLon={mapData.startLon}
                    polyline={mapData.polyline}
                  />
                  {mapData.startLat != null && mapData.startLon != null && (
                    <Marker
                      key="origin"
                      position={[mapData.startLat, mapData.startLon]}
                      icon={startIcon}
                    >
                      <Tooltip permanent>{mapData.startName || 'Origin'}</Tooltip>
                    </Marker>
                  )}
                  <Marker key="destination" position={[mapData.lat, mapData.lon]} icon={destIcon}>
                    <Tooltip permanent>{mapData.destName}</Tooltip>
                  </Marker>
                  {mapData.polyline && mapData.polyline.length > 1 && (
                    <LeafletPolyline
                      pathOptions={{ color: '#dc2626', weight: 4, opacity: 0.9 }}
                      positions={mapData.polyline}
                    />
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
