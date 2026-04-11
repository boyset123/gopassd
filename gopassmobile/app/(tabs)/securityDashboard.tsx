import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Modal, Alert, Image, ImageBackground, Animated, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Timer from '../../components/Timer';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { CameraView, Camera } from 'expo-camera';
import { FontAwesome } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { API_URL } from '../../config/api';
import { useSocket } from '../../config/SocketContext';

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
};

// --- Type Definitions ---
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
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed' | 'Verified' | 'Returned';
  date: string;
  timeOut: string;
  estimatedTimeBack?: string;
  signature: string;
  approverSignature?: string;
  hrApproverSignature?: string;
  approvedBy?: Employee;
  hrApprovedBy?: Employee;
  departureTime?: string;
  trackingNo?: string;
}

interface TravelOrder {
  _id: string;
  employee: Employee;
  purpose: string;
  to: string;
  status: 'Pending' | 'Recommended' | 'For President Approval' | 'President Approved' | 'Approved' | 'Rejected' | 'Completed' | 'Verified' | 'Returned';
  date: string;
  departureDate?: string;
  arrivalDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  timeOut?: string;
  travelOrderNo?: string;
  signature?: string;
  approverSignature?: string;
  approvedBy?: Employee;
  presidentApprovedBy?: Employee;
}

type ItemType = 'slip' | 'order';
type SecurityItem = (PassSlip & { type: 'PassSlip' }) | (TravelOrder & { type: 'TravelOrder' });

const formatDate = (dateString: string) => {
  if (!dateString) return 'No Date';
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleDateString();
};

const formatDateTime = (dateString: string) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid';
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${dateStr} ${timeStr}`;
};

const formatSalary = (salary: string | undefined) =>
  !salary ? '' : salary.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Parse time string (e.g. "2:30 PM") with a date to get a single Date for comparison. */
function parseTimeToDate(timeStr: string | undefined, dateInput: string | Date): Date | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** Get the scheduled departure moment for a scanned pass slip or travel order. */
function getDepartureMoment(item: SecurityItem): Date | null {
  if (item.type === 'PassSlip') {
    return parseTimeToDate(item.timeOut, item.date);
  }
  if (item.timeOut) {
    return parseTimeToDate(item.timeOut, item.departureDate || item.date);
  }
  const departure = new Date(item.departureDate || item.date);
  return isNaN(departure.getTime()) ? null : departure;
}

export default function SecurityDashboard() {
  const insets = useSafeAreaInsets();
  const [currentlyOut, setCurrentlyOut] = useState<SecurityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isScannerVisible, setScannerVisible] = useState(false);
  const [scannedData, setScannedData] = useState<SecurityItem | null>(null);
  const [returnQrCode, setReturnQrCode] = useState<{ data: string; employeeName: string; } | null>(null);
  const [scanLineAnimation] = useState(new Animated.Value(0));
  const [searchQuery, setSearchQuery] = useState('');
  const [presidentName, setPresidentName] = useState('');
  const socket = useSocket();

  useEffect(() => {
    const fetchPresident = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const response = await axios.get(`${API_URL}/users/president`, { headers: { 'x-auth-token': token } });
        if (response.data?.name) setPresidentName(response.data.name);
      } catch (e) {
        console.error('Failed to fetch President name:', e);
      }
    };
    fetchPresident();
  }, []);

  const handleReturn = async (type: ItemType, id: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const url = type === 'slip' ? `${API_URL}/pass-slips/${id}/return` : `${API_URL}/travel-orders/${id}/return`;
      await axios.put(url, {}, { headers });
      Alert.alert('Success', 'Request has been marked as returned.');
      fetchData();
    } catch (err) {
      Alert.alert('Error', 'Failed to mark the request as returned.');
      console.error(err);
    }
  };
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getCameraPermissions();
  }, []);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isScannerVisible) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnimation, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnimation, {
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

  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };

      const [verifiedSlipsResponse, verifiedOrdersResponse] = await Promise.all([
        axios.get<PassSlip[]>(`${API_URL}/pass-slips/verified`, { headers }),
        axios.get<TravelOrder[]>(`${API_URL}/travel-orders/verified`, { headers }),
      ]);
      setCurrentlyOut([
        ...verifiedSlipsResponse.data.map((item) => ({ ...item, type: 'PassSlip' as const })),
        ...verifiedOrdersResponse.data.map((item) => ({ ...item, type: 'TravelOrder' as const })),
      ]);
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
    }, [])
  );

  useEffect(() => {
    if (!socket) return;

    const handleDataRefresh = () => {
      fetchData();
    };

    socket.on('passSlipVerified', handleDataRefresh);
    socket.on('passSlipReturned', handleDataRefresh);
    socket.on('travelOrderDataChanged', handleDataRefresh);

    return () => {
      socket.off('passSlipVerified', handleDataRefresh);
      socket.off('passSlipReturned', handleDataRefresh);
      socket.off('travelOrderDataChanged', handleDataRefresh);
    };
  }, [socket]);

  const handleVerify = async (type: ItemType, id: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const url = type === 'slip' ? `${API_URL}/pass-slips/${id}/verify` : `${API_URL}/travel-orders/${id}/verify`;
      await axios.put(url, {}, { headers });
      Alert.alert('Success', 'Request has been verified.');
      fetchData();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to verify the request.';
      Alert.alert('Error', message);
      console.error(err);
    }
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    try {
      const parsedData = JSON.parse(data);
      if (!parsedData.id || !parsedData.type) {
        Alert.alert('Invalid QR Code', 'The scanned QR code is missing required information.');
        return;
      }

      const validStatuses = ['Approved', 'Verified'];
      const isFullPayload = parsedData.employee && typeof parsedData.employee === 'object' && parsedData.employee.name;
      if (!['PassSlip', 'TravelOrder'].includes(parsedData.type)) {
        Alert.alert('Invalid QR Code', 'This QR code is not for a supported document.');
        return;
      }

      if (isFullPayload) {
        // QR contains full details – use them so guard sees complete info without API
        if (!validStatuses.includes(parsedData.status)) {
          Alert.alert('Invalid Status', `This document has a status of '${parsedData.status}' and cannot be scanned for departure or arrival.`);
          return;
        }
        setScannedData({ ...parsedData, type: parsedData.type });
        setScannerVisible(false);
        return;
      }

      // Legacy QR (id + type only): fetch full document from API
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const url = parsedData.type === 'PassSlip'
        ? `${API_URL}/pass-slips/${parsedData.id}`
        : `${API_URL}/travel-orders/${parsedData.id}`;

      const response = await axios.get(url, { headers });
      const item = { ...response.data, type: parsedData.type };

      if (item.status === 'Approved' || item.status === 'Verified') {
        setScannedData(item);
        setScannerVisible(false);
      } else {
        Alert.alert('Invalid Status', `This document has a status of '${item.status}' and cannot be scanned for departure or arrival.`);
      }
    } catch (error) {
      console.error('QR Code Scan Error:', error);
      Alert.alert('Error', 'An unexpected error occurred while scanning the QR code.');
    }
  };

  const filteredCurrentlyOut = currentlyOut.filter(item => {
    const query = searchQuery.toLowerCase();
    const employeeName = item.employee?.name.toLowerCase() || '';
    const purpose = item.purpose.toLowerCase();
    const destination = (item.type === 'PassSlip' ? item.destination : item.to)?.toLowerCase?.() || '';

    return (
      employeeName.includes(query) ||
      purpose.includes(query) ||
      destination.includes(query)
    );
  });

  const renderItem = (item: SecurityItem) => {
    const destination = item.type === 'PassSlip' ? item.destination : item.to;
    return (
      <View key={item._id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconWrap, item.type === 'PassSlip' ? styles.cardIconWrapSlip : styles.cardIconWrapOrder]}>
            <FontAwesome name={item.type === 'PassSlip' ? 'file-text-o' : 'plane'} size={20} color="#fff" />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.employeeName}>{item.employee?.name || 'N/A'}</Text>
            <Text style={styles.cardSubtitle}>{item.type === 'PassSlip' ? 'Pass Slip' : 'Travel Order'} · {formatDate(item.date)}</Text>
          </View>
          <View style={styles.statusPillVerified}>
            <Text style={styles.statusPillText}>Out</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          {destination ? (
            <View style={styles.cardRow}>
              <FontAwesome name="map-marker" size={14} color="#64748b" style={styles.cardRowIcon} />
              <Text style={styles.cardRowText} numberOfLines={2}>{destination}</Text>
            </View>
          ) : null}
          <View style={styles.cardRow}>
            <FontAwesome name="info-circle" size={14} color="#64748b" style={styles.cardRowIcon} />
            <Text style={styles.cardRowText} numberOfLines={2}>{item.purpose}</Text>
          </View>
          {item.type === 'PassSlip' && item.status === 'Verified' && item.departureTime && item.estimatedTimeBack && (
            <View style={styles.timerWrapper}>
              <Timer timeOut={item.timeOut} departureTime={item.departureTime} estimatedTimeBack={item.estimatedTimeBack} />
            </View>
          )}
        </View>
        <View style={styles.cardFooter}>
          {item.type === 'PassSlip' ? (
            <Pressable
              style={styles.qrButton}
              onPress={() => {
                const qrCodeData = JSON.stringify({ id: item._id, type: 'ReturnPassSlip' });
                setReturnQrCode({ data: qrCodeData, employeeName: item.employee?.name || 'Unknown' });
              }}
            >
              <FontAwesome name="qrcode" size={20} color="#fff" />
              <Text style={styles.qrButtonLabel}>Show return QR</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar
        style={isScannerVisible ? 'light' : scannedData ? 'dark' : 'light'}
        backgroundColor={
          isScannerVisible
            ? '#000000'
            : scannedData
            ? '#f0f4f8'
            : theme.primaryDark
        }
      />
      <ImageBackground source={headerBgImage} style={styles.screenHeaderBg} imageStyle={styles.screenHeaderImageStyle}>
        <View style={[styles.screenHeaderOverlay, { paddingTop: insets.top + 12 }]}>
          <Image source={headerLogo} style={styles.screenHeaderLogo} />
          <View style={styles.screenHeaderInner}>
            <Text style={styles.screenHeaderTitle}>Security Dashboard</Text>
            <Text style={styles.screenHeaderSubtitle}>Scan and manage departures & arrivals</Text>
          </View>
        </View>
      </ImageBackground>

      <ScrollView contentContainerStyle={[styles.scrollContainer, { paddingBottom: (insets.bottom || 20) + 96 }]}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#003366" />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Currently Out</Text>
            <View style={styles.searchContainer}>
              <FontAwesome name="search" size={18} color="#6c757d" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, destination, or purpose..."
                placeholderTextColor="#6c757d"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            {filteredCurrentlyOut.length > 0 ? (
              filteredCurrentlyOut.map(item => renderItem(item))
            ) : (
              <Text style={styles.noRequestsText}>No results found.</Text>
            )}
          </>
        )}
      </ScrollView>

      <Pressable style={[styles.scanFab, { bottom: Platform.OS === 'ios' ? 20 : 20 + (insets.bottom || 0) }]} onPress={() => setScannerVisible(true)}>
        <FontAwesome name="qrcode" size={28} color={theme.primary} />
      </Pressable>

      {isScannerVisible && (
        <Modal
          visible={isScannerVisible}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setScannerVisible(false)}
        >
          <View style={styles.scannerContainer}>
            {Platform.OS === 'ios' && (
              <View style={[styles.iosScannerHeader, { top: insets.top + 12 }]}>
                <Pressable
                  style={styles.iosBackButton}
                  onPress={() => setScannerVisible(false)}
                >
                  <FontAwesome name="chevron-left" size={18} color="#fff" />
                  <Text style={styles.iosBackButtonText}>Back</Text>
                </Pressable>
              </View>
            )}
            <CameraView
              onBarcodeScanned={scannedData ? undefined : handleBarCodeScanned}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.scannerOverlay}>
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.scanBox}>
                  <Animated.View
                    style={[
                      styles.scanLine,
                      {
                        transform: [
                          {
                            translateY: scanLineAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 248], // scanBox height - scanLine height
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
            {Platform.OS !== 'ios' && (
              <Pressable style={styles.closeButton} onPress={() => setScannerVisible(false)}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            )}
          </View>
        </Modal>
      )}

      {returnQrCode && (
        <Modal
          visible={!!returnQrCode}
          transparent={true}
          onRequestClose={() => setReturnQrCode(null)}
        >
          <View style={styles.qrModalContainer}>
            <View style={styles.qrModalContent}>
              <Text style={styles.modalTitle}>Employee Return</Text>
              <Text style={styles.qrEmployeeName}>{returnQrCode.employeeName}</Text>
              <View style={styles.qrCodeWrapper}>
                <QRCode value={returnQrCode.data} size={250} />
              </View>
              <Text style={styles.qrInstruction}>Present this code to the employee to scan for their arrival.</Text>
              <Pressable style={styles.closeModalButton} onPress={() => setReturnQrCode(null)}>
                <Text style={styles.buttonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {scannedData && (
        <Modal
          visible={!!scannedData}
          animationType="fade"
          onRequestClose={() => setScannedData(null)}
        >
          <View
            style={[
              styles.modalContainer,
              Platform.OS === 'ios' ? { paddingTop: insets.top } : null,
            ]}
          >
            <View style={styles.verificationHeader}>
              {Platform.OS === 'ios' && (
                <Pressable
                  style={styles.iosBackButtonLight}
                  onPress={() => {
                    setScannedData(null);
                  }}
                >
                  <FontAwesome name="chevron-left" size={18} color={theme.primary} />
                  <Text style={styles.iosBackButtonLightText}>Back</Text>
                </Pressable>
              )}
              <Text style={styles.verificationTitle}>Pass Slip Verification</Text>
              {Platform.OS !== 'ios' && (
                <Pressable
                  onPress={() => {
                    setScannedData(null);
                  }}
                >
                  <Text style={styles.closeButtonLightText}>Close</Text>
                </Pressable>
              )}
            </View>
            <ScrollView>
              <View style={styles.modalContent}>
                <View style={styles.docHeader}>
                  <View>
                    <View style={styles.blueLine} />
                    <Text style={styles.docUniversityName}>DAVAO ORIENTAL</Text>
                    <Text style={styles.docUniversityName}>STATE UNIVERSITY</Text>
                    <Text style={styles.docMotto}>"A university of excellence, innovation, and inclusion"</Text>
                    <View style={styles.blueLine} />
                    <Text style={styles.docPassSlipHeader}>{scannedData.type === 'PassSlip' ? 'PASS SLIP' : 'TRAVEL ORDER'}</Text>
                  </View>
                  <Image source={require('../../assets/images/dorsulogo-removebg-preview (1).png')} style={styles.docLogo} />
                </View>

                {scannedData.type === 'PassSlip' ? (
                  <>
                    <View style={styles.docMetaRow}>
                      {scannedData.trackingNo && (
                        <Text style={styles.docField}>Tracking No.: <Text style={styles.docValue}>{scannedData.trackingNo}</Text></Text>
                      )}
                      <Text style={styles.docField}>Date: <Text style={styles.docValue}>{formatDate(scannedData.date)}</Text></Text>
                    </View>
                    <View style={styles.docMainTitleContainer}>
                      <Text style={styles.docMainTitle}>PASS SLIP</Text>
                      <Text style={styles.docSubTitle}>(Within Mati City)</Text>
                    </View>
                    <View style={styles.docRow}><Text style={styles.docField}>Name of Employee: <Text style={styles.docValue}>{scannedData.employee?.name}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Time Out: <Text style={styles.docValue}>{scannedData.timeOut}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Estimated Time to be Back: <Text style={styles.docValue}>{scannedData.estimatedTimeBack}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Destination: <Text style={styles.docValue}>{scannedData.destination}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Purpose/s: <Text style={styles.docValue}>{scannedData.purpose}</Text></Text></View>
                    {scannedData.departureTime && (
                      <View style={styles.docRow}><Text style={styles.docField}>Departure: <Text style={styles.docValue}>{formatDateTime(scannedData.departureTime)}</Text></Text></View>
                    )}
                    {(scannedData as any).arrivalTime && (
                      <View style={styles.docRow}><Text style={styles.docField}>Arrival: <Text style={styles.docValue}>{formatDateTime((scannedData as any).arrivalTime)}</Text></Text></View>
                    )}

                    {scannedData.departureTime && scannedData.estimatedTimeBack && (
                      <View style={styles.timerContainer}>
                        <Text style={styles.timerLabel}>Time Remaining:</Text>
                        <Timer timeOut={scannedData.timeOut} departureTime={scannedData.departureTime} estimatedTimeBack={scannedData.estimatedTimeBack} />
                      </View>
                    )}

                    {(scannedData.status === 'Approved' || scannedData.status === 'Completed') && scannedData.hrApprovedBy && (
                      <View style={styles.approvedStampContainer}>
                        <Text style={styles.approvedStamp}>APPROVED</Text>
                      </View>
                    )}
                    {scannedData.status === 'Rejected' && (
                      <View style={styles.rejectedStampContainer}>
                        <Text style={styles.rejectedStamp}>REJECTED</Text>
                      </View>
                    )}
                    <View style={styles.signatureSection}>
                      <View style={styles.signatureBlock}>
                        <Text style={styles.signatureHeader}>REQUESTED BY:</Text>
                        <View style={styles.chiefSignatureDisplay}>
                          {scannedData.signature && (
                            <View style={styles.chiefSignatureImageContainer}>
                              <Image source={{ uri: scannedData.signature }} style={styles.docSignatureImage} />
                            </View>
                          )}
                          <View style={styles.chiefSignatureNameContainer}>
                            <Text style={styles.docSignatureName}>{scannedData.employee?.name}</Text>
                          </View>
                        </View>
                        <Text style={[styles.signatureTitle, styles.chiefSignatureLabel]}>{scannedData.employee?.role === 'Faculty Dean' ? 'Faculty Dean' : 'Faculty Staff'}</Text>
                      </View>
                      <View style={styles.signatureBlock}>
                        <Text style={styles.signatureHeader}>APPROVED BY:</Text>
                        <View style={styles.chiefSignatureDisplay}>
                          {scannedData.approverSignature && (
                            <View style={styles.chiefSignatureImageContainer}>
                              <Image source={{ uri: scannedData.approverSignature }} style={styles.docSignatureImage} />
                            </View>
                          )}
                          <View style={styles.chiefSignatureNameContainer}>
                            <Text style={styles.docSignatureName}>{scannedData.approvedBy?.name || '—'}</Text>
                          </View>
                        </View>
                        <Text style={[styles.signatureTitle, styles.chiefSignatureLabel]}>{scannedData.employee?.role === 'Faculty Dean' ? 'President' : 'Immediate Head'}</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.docTitleContainer}>
                      <Text style={styles.docField}>Date: <Text style={styles.docValue}>{formatDate(scannedData.date)}</Text></Text>
                    </View>
                    <View style={styles.docMainTitleContainer}>
                      <Text style={styles.docMainTitle}>TRAVEL ORDER</Text>
                    </View>
                    <View style={styles.docRow}><Text style={styles.docField}>Travel Order No: <Text style={styles.docValue}>{(scannedData as any).travelOrderNo}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Name of Employee: <Text style={styles.docValue}>{scannedData.employee?.name}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Address: <Text style={styles.docValue}>{(scannedData as any).address}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Salary: <Text style={styles.docValue}>{formatSalary((scannedData as any).salary)}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Destination: <Text style={styles.docValue}>{(scannedData as any).to}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Purpose/s: <Text style={styles.docValue}>{scannedData.purpose}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Departure: <Text style={styles.docValue}>{formatDateTime((scannedData as any).departureDate)}</Text></Text></View>
                    <View style={styles.docRow}><Text style={styles.docField}>Arrival: <Text style={styles.docValue}>{formatDateTime((scannedData as any).arrivalDate)}</Text></Text></View>

                    {(scannedData.status === 'Approved' || scannedData.status === 'Completed') && (
                      <View style={styles.approvedStampContainer}>
                        <Text style={styles.approvedStamp}>APPROVED</Text>
                      </View>
                    )}
                    {scannedData.status === 'Rejected' && (
                      <View style={styles.rejectedStampContainer}>
                        <Text style={styles.rejectedStamp}>REJECTED</Text>
                      </View>
                    )}
                    <View style={styles.signatureSection}>
                      <View style={styles.signatureBlock}>
                        <Text style={styles.signatureHeader}>REQUESTED BY:</Text>
                        <View style={styles.chiefSignatureDisplay}>
                          {scannedData.signature && (
                            <View style={styles.chiefSignatureImageContainer}>
                              <Image source={{ uri: scannedData.signature }} style={styles.docSignatureImage} />
                            </View>
                          )}
                          <View style={styles.chiefSignatureNameContainer}>
                            <Text style={styles.docSignatureName}>{scannedData.employee?.name}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.signatureBlock}>
                        <Text style={styles.signatureHeader}>RECOMMENDED BY:</Text>
                        {(((scannedData as any).recommendedBy && Array.isArray((scannedData as any).recommendedBy)) ? (scannedData as any).recommendedBy : (scannedData as any).recommendedBy ? [(scannedData as any).recommendedBy].flat() : []).map((recommender: any, index: number) => {
                          const currentRecId = String(recommender?._id ?? recommender?.id ?? index);
                          const hasSigned = ((scannedData as any).recommendersWhoApproved || []).some((id: any) => String(id) === currentRecId);
                          const sig = ((scannedData as any).recommenderSignatures || []).find((rs: any) => String(rs.user) === currentRecId)?.signature || (index === 0 ? scannedData.approverSignature : null);
                          return (
                            <View key={recommender?._id ?? index} style={styles.recommenderChiefBlock}>
                              <View style={styles.chiefSignatureDisplay}>
                                {(hasSigned && (sig || scannedData.approverSignature)) ? (
                                  <View style={styles.chiefSignatureImageContainer}>
                                    <Image source={{ uri: sig || scannedData.approverSignature }} style={styles.docSignatureImage} />
                                  </View>
                                ) : null}
                                <View style={styles.chiefSignatureNameContainer}>
                                  <Text style={styles.docSignatureName}>{recommender?.name || '—'}</Text>
                                </View>
                              </View>
                              <Text style={[styles.signatureTitle, styles.chiefSignatureLabel]}>Immediate Chief</Text>
                            </View>
                          );
                        })}
                      </View>
                      {((scannedData as any).presidentApprovedBy || (scannedData as any).presidentSignature) && (
                        <View style={styles.signatureBlock}>
                          <Text style={styles.signatureHeader}>APPROVED BY (PRESIDENT):</Text>
                          <View style={styles.chiefSignatureDisplay}>
                            {(scannedData as any).presidentSignature && (
                              <View style={styles.chiefSignatureImageContainer}>
                                <Image source={{ uri: (scannedData as any).presidentSignature }} style={styles.docSignatureImage} />
                              </View>
                            )}
                            <View style={styles.chiefSignatureNameContainer}>
                              <Text style={styles.docSignatureName}>
                                {(scannedData as any).presidentApprovedBy?.name ?? presidentName ?? '—'}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.signatureTitle, styles.chiefSignatureLabel]}>President</Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
              </View>
            </ScrollView>
            <View style={styles.modalButtonContainer}>
              {scannedData.status === 'Approved' && (() => {
                const depMoment = getDepartureMoment(scannedData);
                const canVerifyDeparture = depMoment != null && new Date() >= depMoment;
                const depFormatted = depMoment ? formatDateTime(depMoment.toISOString()) : '—';
                return (
                  <>
                    {!canVerifyDeparture && depMoment && (
                      <View style={styles.departureRestrictionBox}>
                        <View style={styles.departureRestrictionIconWrap}>
                          <FontAwesome name="clock-o" size={20} color="#B91C1C" />
                        </View>
                        <View style={styles.departureRestrictionTextWrap}>
                          <Text style={styles.departureRestrictionTitle}>Too early to verify</Text>
                          <Text style={styles.departureRestrictionText}>
                            Departure can be verified only at or after the scheduled time.
                          </Text>
                          <View style={styles.departureRestrictionTimeWrap}>
                            <Text style={styles.departureRestrictionTimeLabel}>Available from</Text>
                            <Text style={styles.departureRestrictionTime}>{depFormatted}</Text>
                          </View>
                        </View>
                      </View>
                    )}
                    <Pressable
                      style={[
                        styles.vModalButton,
                        canVerifyDeparture ? styles.vModalButtonPrimary : styles.vModalButtonDisabled,
                      ]}
                      onPress={() => {
                        if (!canVerifyDeparture) return;
                        handleVerify(scannedData.type === 'PassSlip' ? 'slip' : 'order', scannedData._id || (scannedData as any).id);
                        setScannedData(null);
                        setScannerVisible(false);
                      }}
                      disabled={!canVerifyDeparture}
                    >
                      <FontAwesome
                        name={canVerifyDeparture ? 'check-circle' : 'clock-o'}
                        size={18}
                        color="#fff"
                        style={styles.vModalButtonIcon}
                      />
                      <Text style={styles.vModalButtonText}>
                        {canVerifyDeparture ? 'Verify departure' : 'Not yet available'}
                      </Text>
                    </Pressable>
                  </>
                );
              })()}
              {scannedData.status === 'Verified' && (
                <Pressable
                  style={[styles.vModalButton, styles.vModalButtonSuccess]}
                  onPress={() => {
                    handleReturn(scannedData.type === 'PassSlip' ? 'slip' : 'order', scannedData._id || (scannedData as any).id);
                    setScannedData(null);
                    setScannerVisible(false);
                  }}
                >
                  <FontAwesome name="sign-in" size={18} color="#fff" style={styles.vModalButtonIcon} />
                  <Text style={styles.vModalButtonText}>Verify arrival</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.vModalButton, styles.vModalButtonSecondary]}
                onPress={() => {
                  setScannedData(null);
                  setScannerVisible(true);
                }}
              >
                <Text style={styles.vModalButtonSecondaryText}>Back to scanner</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  screenHeaderSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#333',
  },
  scrollContainer: {
    padding: 16,
  },
  noRequestsText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 15,
    color: '#003366',
    paddingBottom: 5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginVertical: 8,
    marginHorizontal: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapSlip: {
    backgroundColor: '#0ea5e9',
  },
  cardIconWrapOrder: {
    backgroundColor: '#003366',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  employeeName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  statusPillVerified: {
    backgroundColor: '#22c55e',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  statusPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  cardBody: {
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardRowIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  cardRowText: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    marginRight: 10,
    width: 20,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#495057',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  timerWrapper: {
    marginBottom: 12,
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  qrButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 12,
    borderColor: '#eee',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  verifyButton: {
    backgroundColor: '#17a2b8',
  },
  verifyButtonDisabled: {
    backgroundColor: '#adb5bd',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  verifiedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
    alignSelf: 'center',
    paddingRight: 10,
  },
  scanFab: {
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
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  iosScannerHeader: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iosBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  iosBackButtonText: {
    color: '#fff',
    fontSize: 15,
    marginLeft: 6,
    fontWeight: '500',
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
    borderColor: '#fff',
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
  closeButton: {
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
  verificationHeader: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verificationTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: theme.primary,
  },
  iosBackButtonLight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    paddingVertical: 4,
  },
  iosBackButtonLightText: {
    marginLeft: 4,
    fontSize: 15,
    color: theme.primary,
    fontWeight: '500',
  },
  closeButtonLightText: {
    fontSize: 14,
    color: '#64748b',
  },
  modalContent: {
    padding: 20,
    backgroundColor: '#fff',
    maxWidth: 400,
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalButtonContainer: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 10,
  },
  // Verification modal — message (too early)
  departureRestrictionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  departureRestrictionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  departureRestrictionTextWrap: {
    flex: 1,
  },
  departureRestrictionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 4,
  },
  departureRestrictionText: {
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
    marginBottom: 8,
  },
  departureRestrictionTimeWrap: {
    backgroundColor: '#FECACA',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  departureRestrictionTimeLabel: {
    fontSize: 11,
    color: '#991B1B',
    marginBottom: 2,
    fontWeight: '600',
  },
  departureRestrictionTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B91C1C',
  },
  // Verification modal — buttons
  vModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    minHeight: 48,
  },
  vModalButtonPrimary: {
    backgroundColor: theme.primary,
  },
  vModalButtonDisabled: {
    backgroundColor: '#64748b',
    opacity: 0.9,
  },
  vModalButtonSuccess: {
    backgroundColor: '#059669',
  },
  vModalButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
  },
  vModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  vModalButtonIcon: {
    marginRight: 10,
  },
  vModalButtonSecondaryText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  returnButton: {
    backgroundColor: '#28a745',
  },
  timerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc3545',
    marginTop: 10,
  },
  timerContainer: {
    alignItems: 'center',
    marginVertical: 20,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  timerLabel: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 5,
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
  docMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
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
    marginBottom: 12,
  },
  docField: {
    fontSize: 14,
  },
  docValue: {
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  signatureSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  signatureBlock: {
    marginBottom: 20,
  },
  signatureHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
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
    minWidth: 60,
    maxWidth: 180,
  },
  chiefSignatureLabel: {
    marginTop: 2,
  },
  signatureTitle: {
    fontSize: 12,
    color: '#333',
  },
  docSignatureImage: {
    width: 90,
    height: 40,
  },
  docSignatureName: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'left',
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
  qrModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  qrModalContent: {
    backgroundColor: '#fff',
    padding: 25,
    borderRadius: 15,
    alignItems: 'center',
    width: '90%',
  },
  qrEmployeeName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  qrCodeWrapper: {
    marginVertical: 20,
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  qrInstruction: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 20,
  },
  closeModalButton: {
    backgroundColor: '#6c757d',
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 8,
  },
});
