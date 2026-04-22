import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Platform, Alert, Modal, Image, ImageBackground, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import polyline from '@mapbox/polyline';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { FontAwesome } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../../config/api';

const headerBgImage = require('../../assets/images/dorsubg3.jpg');
const headerLogo = require('../../assets/images/dorsulogo-removebg-preview (1).png');
const OFFICE_START_HOUR = 8;
const OFFICE_END_HOUR = 17;

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

interface User {
  name: string;
  role: string;
  faculty?: string;
  passSlipMinutes?: number;
}

interface Suggestion {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

const CreatePassSlipScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const todayStart = useRef(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }).current();

  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const [timeOut, setTimeOut] = useState(new Date());
  const [estimatedTimeBack, setEstimatedTimeBack] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [activeTimePicker, setActiveTimePicker] = useState<'timeOut' | 'estimatedTimeBack' | null>(null);
  const [duration, setDuration] = useState('');

  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureType, setSignatureType] = useState<'draw' | 'upload' | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [immediateHead, setImmediateHead] = useState('');
  const [immediateHeadId, setImmediateHeadId] = useState<string | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const sigCanvas = useRef<SignatureViewRef>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentUserLocation, setCurrentUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [shouldFitRoute, setShouldFitRoute] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSuggestionsVisible, setSuggestionsVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: 7.0731, // Default to a central location in Mati
    longitude: 126.2167,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const now = new Date();
  const currentHour = now.getHours();
  const isWithinOfficeHours = currentHour >= OFFICE_START_HOUR && currentHour < OFFICE_END_HOUR;

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDate(startOfDay(selectedDate).getTime() < todayStart.getTime() ? todayStart : selectedDate);
    }
  };

  const onChangeTime = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      if (activeTimePicker === 'timeOut') {
        setTimeOut(selectedTime);
      } else if (activeTimePicker === 'estimatedTimeBack') {
        setEstimatedTimeBack(selectedTime);
      }
    }
  };

  const showTimepicker = (picker: 'timeOut' | 'estimatedTimeBack') => {
    setActiveTimePicker(picker);
    setShowTimePicker(true);
  };

  const showDatepicker = () => {
    setShowDatePicker(true);
  };

  const handleDrawOK = (sig: string) => {
    setSignature(sig);
    setSignatureType(null);
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
      setSignature(uri);
    }
    setSignatureType(null);
  };

  useFocusEffect(
    useCallback(() => {
      const checkOngoingSubmissions = async () => {
        try {
          const token = await AsyncStorage.getItem('userToken');
          if (!token) {
            router.replace('/');
            return;
          }
          const headers = { 'x-auth-token': token };

          const [slipsResponse, ordersResponse] = await Promise.all([
            axios.get(`${API_URL}/pass-slips/my-slips`, { headers }),
            axios.get(`${API_URL}/travel-orders/my-orders`, { headers }),
          ]);

          const combinedSubmissions = [
            ...slipsResponse.data.map((slip: any) => ({ ...slip, type: 'Pass Slip' })),
            ...ordersResponse.data.map((order: any) => ({ ...order, type: 'Travel Order' })),
          ];

          const ongoingStatuses = ['Pending', 'Recommended', 'Approved', 'Verified', 'For President Approval'];
          const hasOngoing = combinedSubmissions.some(s => ongoingStatuses.includes(s.status));

          if (hasOngoing) {
            Alert.alert(
              'Ongoing Submission',
              'You cannot create a new pass slip while another submission is in progress.',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          }
        } catch (error) {
          console.error('Failed to check ongoing submissions:', error);
        }
      };

      checkOngoingSubmissions();
    }, [router])
  );

  useEffect(() => {
    const fetchUserData = async () => {
      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        try {
          const response = await axios.get(`${API_URL}/users/me`, { headers: { 'x-auth-token': token } });
          setUser(response.data);
        } catch (error) {
          console.error('Failed to fetch user data:', error);
        }
      }
    };
    fetchUserData();
  }, []);

  useEffect(() => {
    const findApprover = async () => {
      if (!user) return;

      // Roles that need an approver assigned automatically
      const rolesThatNeedApprover = ['Faculty Staff', 'Program Head', 'Faculty Dean'];

      if (rolesThatNeedApprover.includes(user.role)) {
        try {
          const token = await AsyncStorage.getItem('userToken');
          const response = await axios.get(`${API_URL}/users/me/approver`, {
            headers: { 'x-auth-token': token },
          });
          if (response.data) {
            setImmediateHead(response.data.name);
            setImmediateHeadId(response.data._id);
          }
        } catch (error: any) {
          let errorMessage = 'Could not automatically find your approver. Please contact an administrator.';
          if (error.response?.status === 404) {
            errorMessage = `Your assigned approver could not be found in the system. Please ensure they are registered.`;
          }
          console.error('Error finding approver:', error);
          Alert.alert('Error', errorMessage);
        }
      }
    };

    findApprover();
  }, [user]);

  useEffect(() => {
    if (signatureType === 'upload') {
      handleUpload();
    }
  }, [signatureType]);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      setSuggestionsVisible(false);
      return;
    }
    try {
      const structuredQuery = `${text}, Mati City, Davao Oriental`;
      const response = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(structuredQuery)}&format=json&addressdetails=1&limit=5&countrycodes=ph`, {
        headers: {
          'User-Agent': 'GOPASSDORSU Mobile App/1.0'
        }
      });
      setSuggestions(response.data);
      setSuggestionsVisible(true);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchSuggestions(destination);
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [destination, fetchSuggestions]);

  useEffect(() => {
    if (estimatedTimeBack.getTime() >= timeOut.getTime()) {
      const diff = estimatedTimeBack.getTime() - timeOut.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      let durationString = '';
      if (hours > 0) {
        durationString += `${hours}hr `;
      }
      if (minutes > 0 || hours === 0) {
        durationString += `${minutes}min`;
      }
      
      setDuration(durationString.trim());
    } else {
      setDuration('');
    }
  }, [timeOut, estimatedTimeBack]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission to access location was denied');
        return;
      }
      // Prefer last known fix (fast); then request a position (needs location services / GPS or network)
      try {
        let currentLocation =
          (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        const { latitude, longitude } = currentLocation.coords;
        setMapRegion({
          latitude,
          longitude,
          latitudeDelta: 0.01, // Zoom in
          longitudeDelta: 0.01,
        });
        setCurrentUserLocation({ latitude, longitude });
      } catch (error) {
        setLocationError(
          'Could not detect your current position. Enable device location or use the map as usual; the map shows a default area.',
        );
        if (__DEV__) {
          console.warn('Map centering: no current location', error);
        }
      }
    })();
  }, []);

  const handlePreview = () => {
    if (!destination || !purpose || !signature || !immediateHead) {
      Alert.alert('Validation Error', 'Please fill out all fields, provide a signature, and enter the approver\'s name.');
      return;
    }

    if (startOfDay(date).getTime() < todayStart.getTime()) {
      Alert.alert('Invalid Date', 'Please select today or a future date.');
      return;
    }

    if (timeOut.getTime() === estimatedTimeBack.getTime()) {
      Alert.alert('Invalid Time', 'Time Out and Estimated Time to be Back cannot be the same.');
      return;
    }

    if (estimatedTimeBack.getTime() < timeOut.getTime()) {
      Alert.alert('Invalid Time', 'Estimated Time to be Back must be after Time Out.');
      return;
    }

    const durationMinutes = (estimatedTimeBack.getTime() - timeOut.getTime()) / 60000;
    if (user?.passSlipMinutes !== undefined && user.passSlipMinutes < durationMinutes) {
      Alert.alert('Insufficient Minutes', `You only have ${user.passSlipMinutes} minutes remaining.`);
      return;
    }

    setIsPreviewVisible(true);
  };

  const getRoute = async (destination: { latitude: number; longitude: number }) => {
    console.log('getRoute called with destination:', destination);
    if (!currentUserLocation) {
      console.error('getRoute failed: currentUserLocation is null.');
      return;
    }
    console.log('currentUserLocation:', currentUserLocation);

    try {
      const url = `http://router.project-osrm.org/route/v1/driving/${currentUserLocation.longitude},${currentUserLocation.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=polyline&alternatives=true&steps=false`;
      console.log('Fetching route from URL:', url);

      const response = await fetch(url);
      const json = await response.json();
      console.log('OSRM response:', JSON.stringify(json, null, 2));

      if (json.routes && json.routes.length > 0) {
        const shortestRoute = [...json.routes].sort(
          (a: { distance: number }, b: { distance: number }) => a.distance - b.distance
        )[0];
        const geometry = shortestRoute.geometry;
        setRoutePolyline(geometry);
        const decoded = polyline.decode(geometry);
        const coords = decoded.map(point => ({ latitude: point[0], longitude: point[1] }));
        console.log('Decoded coordinates count:', coords.length);
        setRouteCoordinates(coords);
      } else {
        console.log('No routes found in OSRM response.');
        setRouteCoordinates([]);
        setRoutePolyline(null);
      }
    } catch (error) {
      console.error('Failed to fetch route from OSRM:', error);
      setRouteCoordinates([]);
    }
  };

  const handleMapPress = async (destinationCoord: { latitude: number; longitude: number }) => {
    setShouldFitRoute(true);
    setSelectedLocation(destinationCoord);
    setRouteCoordinates([]); // Clear previous route
    getRoute(destinationCoord);

    // Reverse geocode to get address for the tapped coordinate using Nominatim
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${destinationCoord.latitude}&lon=${destinationCoord.longitude}&format=json`,
        { headers: { 'User-Agent': 'GOPASSDORSU Mobile App/1.0' } }
      );
      const data = await response.json();
      if (data && data.display_name) {
        setDestination(data.display_name);
      } else {
        setDestination(`${destinationCoord.latitude.toFixed(5)}, ${destinationCoord.longitude.toFixed(5)}`);
      }
    } catch (error) {
      console.error('Reverse geocoding for tapped coordinate failed:', error);
      setDestination(`${destinationCoord.latitude.toFixed(5)}, ${destinationCoord.longitude.toFixed(5)}`);
    }
  };

  const handleConfirmDestination = () => {
    if (selectedLocation) {
      setLocation(selectedLocation);
    }
    setIsMapVisible(false);
  };

  const openMapCenteredOnUser = () => {
    if (currentUserLocation) {
      setMapRegion({
        latitude: currentUserLocation.latitude,
        longitude: currentUserLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    }
    setShouldFitRoute(false);
    setIsMapVisible(true);
  };

  const handleClearSignature = () => {
    sigCanvas.current?.clearSignature();
  };

  const handleConfirmSignature = () => {
    sigCanvas.current?.readSignature();
  };

  const handleSubmit = async () => {
    setIsPreviewVisible(false); // Close preview on submit
    const formattedTimeOut = timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const formattedEstimatedTimeBack = estimatedTimeBack.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    if (!destination || !purpose || !signature || !immediateHead) {
      Alert.alert('Validation Error', 'Please fill out all fields, provide a signature, and enter the approver\'s name.');
      return;
    }

    if (startOfDay(date).getTime() < todayStart.getTime()) {
      Alert.alert('Invalid Date', 'Please select today or a future date.');
      return;
    }

    if (!isWithinOfficeHours) {
      Alert.alert('Office Hours Only', 'Pass slip submission is allowed only during office hours (8:00 AM to 5:00 PM).');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Authentication Error', 'You are not logged in.');
        router.replace('/');
        return;
      }

      const passSlipData: any = {
        date,
        timeOut: formattedTimeOut,
        estimatedTimeBack: formattedEstimatedTimeBack,
        destination,
        purpose,
        signature,
        routePolyline: routePolyline,
      };

      passSlipData.approvedBy = immediateHeadId;

      if (location) {
        passSlipData.latitude = location.latitude;
        passSlipData.longitude = location.longitude;
      }

      await axios.post(`${API_URL}/pass-slips`, passSlipData, {
        headers: { 'x-auth-token': token },
      });

      Alert.alert('Success', 'Pass Slip submitted successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);

    } catch (error) {
      console.error('Pass slip submission error:', error);
      Alert.alert('Submission Failed', 'Could not submit your pass slip. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const leafletState = JSON.stringify({
    center: { latitude: mapRegion.latitude, longitude: mapRegion.longitude },
    currentUserLocation,
    selectedLocation,
    routeCoordinates,
    shouldFitRoute,
  });

  const leafletHtml = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; }
      .leaflet-control-attribution { display: none !important; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const state = ${leafletState};
      const map = L.map('map').setView([state.center.latitude, state.center.longitude], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const points = [];
      if (state.currentUserLocation) {
        const userLatLng = [state.currentUserLocation.latitude, state.currentUserLocation.longitude];
        L.circleMarker(userLatLng, {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#1d4ed8',
          fillOpacity: 1
        }).addTo(map).bindPopup('Your Location');
        points.push(userLatLng);
      }
      if (state.selectedLocation) {
        const destLatLng = [state.selectedLocation.latitude, state.selectedLocation.longitude];
        L.circleMarker(destLatLng, {
          radius: 9,
          color: '#ffffff',
          weight: 2,
          fillColor: '#dc3545',
          fillOpacity: 1
        }).addTo(map).bindPopup('Selected Destination');
        points.push(destLatLng);
      }
      if (state.routeCoordinates && state.routeCoordinates.length > 0) {
        const route = state.routeCoordinates.map(p => [p.latitude, p.longitude]);
        L.polyline(route, { color: '#dc3545', weight: 4 }).addTo(map);
        points.push(...route);
      }
      if (state.shouldFitRoute && points.length > 1) {
        map.fitBounds(points, { padding: [30, 30] });
      }

      map.on('click', function (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'map-press',
          latitude: e.latlng.lat,
          longitude: e.latlng.lng
        }));
      });
    </script>
  </body>
</html>
  `;

  return (
    <>
      {/* Map Modal - Select Destination */}
      <Modal visible={isMapVisible} animationType="slide" onRequestClose={() => setIsMapVisible(false)}>
        <View style={[styles.modalContainer, { paddingTop: insets.top + 8 }]}>
            <View style={styles.mapModalHeader}>
                <View style={styles.mapModalTitleRow}>
                    <View style={styles.mapModalIconWrap}>
                        <FontAwesome name="map-marker" size={22} color={theme.primary} />
                    </View>
                    <View>
                        <Text style={styles.mapModalTitle}>Select Destination</Text>
                        <Text style={styles.mapModalSubtitle}>Tap on the map to choose a location</Text>
                    </View>
                </View>
                <Pressable onPress={() => setIsMapVisible(false)} style={styles.mapModalCloseBtn} hitSlop={12}>
                    <FontAwesome name="times" size={22} color={theme.textMuted} />
                </Pressable>
            </View>
            <View style={styles.mapWrapper}>
                <WebView
                  style={styles.map}
                  originWhitelist={['*']}
                  source={{ html: leafletHtml }}
                  onMessage={(event) => {
                    try {
                      const data = JSON.parse(event.nativeEvent.data);
                      if (data?.type === 'map-press' && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
                        handleMapPress({ latitude: data.latitude, longitude: data.longitude });
                      }
                    } catch (error) {
                      if (__DEV__) {
                        console.warn('Leaflet map message parse failed', error);
                      }
                    }
                  }}
                />
                {!selectedLocation && (
                    <View style={styles.mapHintOverlay} pointerEvents="none">
                        <Text style={styles.mapHintText}>Tap on map to set destination</Text>
                    </View>
                )}
            </View>
            <View style={[styles.confirmButtonContainer, { paddingBottom: insets.bottom + 20 }]}>
              <Pressable
                style={({ pressed }) => [
                  styles.mapConfirmButton,
                  !selectedLocation && styles.disabledButton,
                  pressed && styles.mapConfirmButtonPressed,
                ]}
                onPress={handleConfirmDestination}
                disabled={!selectedLocation}
              >
                <FontAwesome name="check" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.confirmButtonText}>Confirm Destination</Text>
              </Pressable>
            </View>
        </View>
      </Modal>

      {/* Preview Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isPreviewVisible}
        onRequestClose={() => setIsPreviewVisible(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContent}>
            <ScrollView>
              {!isWithinOfficeHours && (
                <View style={styles.officeHoursWarningBox}>
                  <Text style={styles.officeHoursWarningTitle}>Office hours only</Text>
                  <Text style={styles.officeHoursWarningText}>
                    Submission is disabled. You can submit pass slips only from 8:00 AM to 5:00 PM.
                  </Text>
                </View>
              )}
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
                <Text style={styles.docField}>Date: <Text style={styles.docValue}>{date.toLocaleDateString()}</Text></Text>
              </View>

              <View style={styles.docMainTitleContainer}>
                  <Text style={styles.docMainTitle}>PASS SLIP</Text>
                  <Text style={styles.docSubTitle}>(Within Mati City)</Text>
              </View>

              <View style={styles.docRow}>
                <Text style={styles.docField}>Name of Employee: <Text style={styles.docValue}>{user?.name}</Text></Text>
              </View>
              <View style={styles.docRow}>
                <Text style={styles.docField}>Time Out: <Text style={styles.docValue}>{timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text></Text>
              </View>
              <View style={styles.docRow}>
                <Text style={styles.docField}>Estimated Time to be Back: <Text style={styles.docValue}>{estimatedTimeBack.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text></Text>
              </View>
              <View style={styles.docRow}>
                <Text style={styles.docField}>Destination: <Text style={styles.docValue}>{destination}</Text></Text>
              </View>
              <View style={styles.docRow}>
                <Text style={styles.docField}>Purpose/s: <Text style={styles.docValue}>{purpose}</Text></Text>
              </View>

              <View style={styles.docSignatureContainer}>
                <View style={styles.docSignatureBox}>
                  <Text style={styles.docField}>Requested by:</Text>
                  <View style={styles.docChiefSignatureDisplay}>
                    {signature ? (
                      <View style={styles.chiefSignatureImageContainer}>
                        <Image source={{ uri: signature }} style={styles.docSignatureImage} />
                      </View>
                    ) : null}
                    <View style={styles.chiefSignatureNameContainer}>
                      <Text style={styles.docSignatureName}>{user?.name}</Text>
                    </View>
                  </View>
                  <Text style={styles.docSignatureUnderline}>{user?.role === 'Program Head' ? 'Program Head' : user?.role === 'Faculty Dean' ? 'Faculty Dean' : 'Faculty Staff'}</Text>
                </View>
                <View style={styles.docSignatureBox}>
                  <Text style={styles.docField}>Approved by:</Text>
                  <View style={styles.docChiefSignatureDisplay}>
                    <View style={styles.chiefSignatureNameContainer}>
                      <Text style={styles.docSignatureName}>{immediateHead || '—'}</Text>
                    </View>
                  </View>
                  <Text style={styles.docSignatureUnderline}>{user?.role === 'Program Head' ? 'Faculty Dean' : user?.role === 'Faculty Dean' ? 'President' : 'Immediate Head'}</Text>
                </View>
              </View>

              <View style={styles.docFooter}>
                <Text style={styles.docFooterText}>1 copy to security guard on duty</Text>
                <Text style={styles.docFooterText}>1 copy to be attached to DTR/FSR</Text>
              </View>
            </ScrollView>
            <View style={styles.modalButtonContainer}>
              <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsPreviewVisible(false)} disabled={isSubmitting}>
                <Text style={styles.buttonText}>Close</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.submitButton,
                  (!isWithinOfficeHours || isSubmitting) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={isSubmitting || !isWithinOfficeHours}
              >
                {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={signatureType === 'draw'} animationType="fade" transparent={true}>
        <View style={styles.signatureModalOverlay}>
          <View style={styles.signatureModalContent}>
            <View style={[styles.modalHeader, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={styles.modalTitle}>Draw Signature</Text>
              <Pressable onPress={() => setSignatureType(null)}>
                <FontAwesome name="close" size={22} color={theme.primary} />
              </Pressable>
            </View>
            <View style={styles.signatureCanvasContainer}>
              <SignatureScreen
                ref={sigCanvas}
                onOK={handleDrawOK}
                onEmpty={() => console.log('empty')}
                descriptionText=""
                webStyle={`.m-signature-pad { box-shadow: none; border: none; } .m-signature-pad--body { border-radius: 4px; border: 1px solid #ccc; height: 180px; } .m-signature-pad--footer { display: none; }`}
              />
            </View>
            <View style={styles.signatureActionContainer}>
              <Pressable style={[styles.signatureActionButton, styles.clearButton]} onPress={handleClearSignature}>
                <Text style={styles.signatureActionButtonText}>Clear</Text>
              </Pressable>
              <Pressable style={[styles.signatureActionButton, styles.confirmButton]} onPress={handleConfirmSignature}>
                <Text style={styles.signatureActionButtonText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.mainContainer}>
        <StatusBar style="light" />
        <ImageBackground source={headerBgImage} style={styles.screenHeaderBg} imageStyle={styles.screenHeaderImageStyle}>
          <View style={[styles.screenHeaderOverlay, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <FontAwesome name="arrow-left" size={22} color="#fff" />
            </TouchableOpacity>
            <Image source={headerLogo} style={styles.screenHeaderLogo} />
            <View style={styles.screenHeaderInner}>
              <Text style={styles.screenHeaderTitle}>Create Pass Slip</Text>
              <Text style={styles.screenHeaderSubtitle}>Within Mati City</Text>
            </View>
          </View>
        </ImageBackground>
      {showDatePicker && (
        <DateTimePicker
          testID="datePicker"
          value={date}
          mode="date"
          display="default"
          minimumDate={todayStart}
          onChange={onChangeDate}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          testID="timePicker"
          value={activeTimePicker === 'timeOut' ? timeOut : estimatedTimeBack}
          mode="time"
          display="default"
          onChange={onChangeTime}
        />
      )}
      <View style={styles.contentContainer}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.formCard}>
          <View style={styles.formCardTopBar} />
          <View style={styles.formCardHeader}>
            <View style={styles.formCardIconWrap}>
              <FontAwesome name="file-text-o" size={20} color="#fff" />
            </View>
            <View>
              <Text style={styles.formTitle}>Pass Slip</Text>
              <Text style={styles.formSubtitle}>Within Mati City</Text>
            </View>
          </View>
          <View style={styles.formCardBody}>
          <View style={styles.rowContainer}>
            <View style={[styles.fieldContainer, { flex: 1 }]}>
              <Text style={styles.label}>Date:</Text>
              <Pressable onPress={showDatepicker}>
                <View style={styles.input}>
                  <Text style={styles.inputDisplayText}>{date.toLocaleDateString()}</Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Name of Employee:</Text>
            <TextInput
              style={styles.input}
              value={user?.name}
              editable={false}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Time Out:</Text>
            <Pressable onPress={() => showTimepicker('timeOut')}>
              <View style={styles.input}>
                <Text style={styles.inputDisplayText}>{timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Estimated Time to be Back:</Text>
            <Pressable onPress={() => showTimepicker('estimatedTimeBack')}>
              <View style={styles.input}>
                <Text style={styles.inputDisplayText}>{estimatedTimeBack.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
              </View>
            </Pressable>
          </View>

          {duration ? (
            <View style={styles.durationContainer}>
              <Text style={styles.durationText}>Duration: {duration}</Text>
            </View>
          ) : null}

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Destination</Text>
            <Text style={styles.destinationHint}>Enter address or pick on map</Text>
            <View style={styles.destinationContainer}>
              <TextInput
                style={styles.destinationInput}
                value={destination}
                onChangeText={setDestination}
                placeholder="Enter address"
                placeholderTextColor={theme.textMuted}
              />
              <Pressable
                onPress={openMapCenteredOnUser}
                style={({ pressed }) => [styles.mapSelectButton, pressed && styles.mapSelectButtonPressed]}
                accessibilityLabel="Pick destination on map"
              >
                <FontAwesome name="map-marker" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.mapSelectButtonText}>Map</Text>
              </Pressable>
            </View>
            {isSuggestionsVisible && suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {suggestions.map((item: Suggestion) => (
                    <Pressable
                      key={item.place_id}
                      style={({ pressed }) => [styles.suggestionItem, pressed && styles.suggestionItemPressed]}
                      onPress={() => {
                        const newLocation = { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) };
                        setDestination(item.display_name);
                        setSelectedLocation(newLocation);
                        setLocation(newLocation);
                        setSuggestions([]);
                        setSuggestionsVisible(false);
                        setShouldFitRoute(true);
                        if (currentUserLocation) {
                          getRoute(newLocation);
                        }
                      }}
                    >
                      <FontAwesome name="map-pin" size={14} color={theme.primary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionItemText} numberOfLines={2}>{item.display_name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Purpose/s:</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              multiline
              numberOfLines={3}
              value={purpose}
              onChangeText={setPurpose}
              placeholder="Enter purpose of travel"
              placeholderTextColor={theme.textMuted}
            />
          </View>

          {location && (
            <View style={styles.fieldContainer}>
                <Text style={styles.label}>Selected Location:</Text>
                <Text style={styles.locationCoordsText}>Latitude: {location.latitude.toFixed(4)}, Longitude: {location.longitude.toFixed(4)}</Text>
            </View>
          )}
          {locationError && <Text style={styles.errorText}>{locationError}</Text>}

          <View style={styles.signatureContainer}>
            <View style={styles.signatureBox}>
              <Text style={styles.signatureLabel}>Requested by:</Text>
              <View style={styles.chiefSignatureDisplay}>
                {signature ? (
                  <View style={styles.chiefSignatureImageContainer}>
                    <Image source={{ uri: signature }} style={styles.signatureImage} />
                    <Pressable style={styles.redoButton} onPress={() => setSignature(null)}>
                      <FontAwesome name="undo" size={18} color={theme.primary} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.chiefSignaturePlaceholderContainer}>
                    <View style={styles.signatureButtons}>
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
                  <Text style={styles.signatureValue}>{user?.name}</Text>
                </View>
              </View>
              <Text style={styles.signatureUnderline}>{user?.role === 'Program Head' ? 'Program Head' : user?.role === 'Faculty Dean' ? 'Faculty Dean' : 'Faculty Staff'}</Text>
            </View>
            <View style={styles.signatureBox}>
              <Text style={styles.signatureLabel}>Approved by:</Text>
              <View style={styles.chiefSignatureDisplay}>
                <View style={styles.chiefSignatureNameContainer}>
                  <TextInput
                    style={styles.approverInputInBlock}
                    placeholder="Enter approver's name"
                    placeholderTextColor={theme.textMuted}
                    value={immediateHead}
                    onChangeText={setImmediateHead}
                    editable={!['Faculty Staff', 'Program Head', 'Faculty Dean'].includes(user?.role || '')}
                  />
                </View>
              </View>
              <Text style={styles.signatureUnderline}>{user?.role === 'Program Head' ? 'Faculty Dean' : user?.role === 'Faculty Dean' ? 'President' : 'Immediate Head'}</Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <Pressable style={[styles.buttonBase, styles.cancelButton]} onPress={() => router.back()} disabled={isSubmitting}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.buttonBase, styles.submitButton, isSubmitting && styles.submittingButton]} onPress={handlePreview} disabled={isSubmitting}>
              <Text style={styles.buttonText}>{isSubmitting ? 'Generating...' : 'Preview'}</Text>
            </Pressable>
          </View>
          </View>
        </View>
      </ScrollView>
      </View>
    </View>
    </>
  );
};

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
  headerBackBtn: {
    marginRight: 12,
    padding: 4,
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
  contentContainer: {
    flex: 1,
    padding: 8,
  },
  scrollContainer: {
    paddingBottom: 24,
    paddingHorizontal: 8,
  },
  formCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: theme.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  formCardTopBar: {
    height: 4,
    width: '100%',
    backgroundColor: theme.accent,
  },
  formCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: theme.primary,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  formCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(254,206,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  formCardBody: {
    padding: 20,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  formSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: 'rgba(1,26,107,0.04)',
    color: theme.text,
  },
  inputDisplayText: {
    fontSize: 16,
    color: theme.text,
  },
  multilineInput: {
    height: 88,
    textAlignVertical: 'top',
  },
  timePickerContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: 'rgba(1,26,107,0.04)',
    height: 50,
    alignItems: 'center',
  },
  pickerWrapper: {
    flex: 1,
  },
  picker: {
    height: 50,
    backgroundColor: 'transparent',
  },
  signatureContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 20,
  },
  signatureBox: {
    width: '48%',
    alignItems: 'center',
  },
  signatureLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  signatureValue: {
    fontSize: 16,
    marginTop: 5,
    color: theme.text,
  },
   approverPlaceholder: {
    height: 30,
    marginTop: 10,
  },
  approverInput: {
    fontSize: 16,
    textAlign: 'center',
    width: '100%',
    paddingVertical: 5,
    marginTop: 10,
    color: theme.text,
  },
  approverInputInBlock: {
    fontSize: 16,
    textAlign: 'center',
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 0,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: 'rgba(1,26,107,0.04)',
  },
  signatureUnderline: {
    borderTopWidth: 1,
    borderColor: theme.primary,
    width: '100%',
    textAlign: 'center',
    paddingTop: 5,
    marginTop: 4,
    fontSize: 13,
    color: theme.textMuted,
  },
  signatureBoxContent: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  signatureImage: {
    width: 150,
    height: 75,
  },
  signaturePlaceholder: {
    width: 150,
    height: 75,
    backgroundColor: '#f0f0f0',
  },
  signatureContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center', // Re-center the content
    width: '100%',
    marginVertical: 10,
    minHeight: 75, // Match signature image height
  },
  signatureButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around', // Use space-around for balanced spacing
    alignItems: 'center',
    width: '80%', // Increased width for more spacing
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
  },
  signatureImageContainer: {
    position: 'relative',
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
    ...Platform.select({ ios: { shadowOpacity: 0.15, shadowRadius: 6 }, android: { elevation: 3 } }),
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
    gap: 12,
  },
  buttonBase: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: theme.surface,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
  },
  modalCancelButtonText: {
    fontSize: 16,
    color: theme.primary,
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
  signatureCanvasContainer: {
    height: 200,
    marginBottom: 20,
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
    borderRadius: 10,
  },
  signatureActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: theme.textMuted,
  },
  confirmButton: {
    backgroundColor: theme.primary,
  },
  submitButton: {
    backgroundColor: theme.primary,
  },
  cancelButton: {
    backgroundColor: theme.textMuted,
  },
  submittingButton: {
    backgroundColor: theme.primary,
    opacity: 0.85,
  },
  durationContainer: {
    alignItems: 'flex-end',
    marginTop: -8,
    marginBottom: 10,
    paddingRight: 4,
  },
  durationText: {
    fontSize: 14,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  previewOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  previewContent: {
    width: '95%',
    backgroundColor: theme.surface,
    borderRadius: 16,
    paddingTop: 25,
    paddingBottom: 15,
    paddingHorizontal: 25,
    alignItems: 'stretch',
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    ...Platform.select({ ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16 }, android: { elevation: 10 } }),
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingBottom: 10,
  },
  previewLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  previewValue: {
    fontSize: 16,
    color: theme.textMuted,
    flexShrink: 1,
    textAlign: 'right',
  },
  previewSignatureContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  previewSignatureBox: {
    width: '48%',
    alignItems: 'center',
  },
  previewSignatureLabel: {
    fontSize: 14,
    color: theme.text,
    marginBottom: 10,
  },
  previewSignatureImage: {
    width: 120,
    height: 60,
    marginBottom: 10,
  },
  previewSignatureName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
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
    height: 60,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 5,
  },
  chiefSignatureDisplay: {
    position: 'relative',
    width: '100%',
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  docChiefSignatureDisplay: {
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
  docFooter: {
    marginTop: 20,
  },
  docFooterText: {
    fontSize: 10,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  destinationHint: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 8,
  },
  destinationContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: 'rgba(1,26,107,0.04)',
    overflow: 'hidden',
  },
  destinationInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
  },
  mapSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  mapSelectButtonPressed: {
    opacity: 0.85,
  },
  mapSelectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 108,
    left: 0,
    right: 0,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    zIndex: 1000,
    maxHeight: 200,
    ...Platform.select({ ios: { shadowOpacity: 0.12, shadowRadius: 8 }, android: { elevation: 4 } }),
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  suggestionItemPressed: {
    backgroundColor: 'rgba(1,26,107,0.06)',
  },
  suggestionIcon: {
    marginRight: 10,
  },
  suggestionItemText: {
    flex: 1,
    fontSize: 14,
    color: theme.text,
  },
  mapContainer: {
    height: 200,
    marginTop: 15,
    borderRadius: 8,
    overflow: 'hidden',
  },
  mapModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  mapModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  mapModalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(1,26,107,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mapModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
  },
  mapModalSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  mapModalCloseBtn: {
    padding: 8,
  },
  mapWrapper: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }, android: { elevation: 4 } }),
  },
  map: {
    flex: 1,
    borderRadius: 16,
  },
  mapHintOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  mapHintText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  confirmButtonContainer: {
    paddingTop: 16,
    paddingHorizontal: 0,
  },
  mapConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    ...Platform.select({ ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }, android: { elevation: 3 } }),
  },
  mapConfirmButtonPressed: {
    opacity: 0.9,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: theme.textMuted,
    opacity: 0.7,
  },
  errorText: {
    color: theme.danger,
    marginTop: 6,
    fontSize: 14,
  },
  officeHoursWarningBox: {
    backgroundColor: '#fff4e5',
    borderWidth: 1,
    borderColor: '#f0b429',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  officeHoursWarningTitle: {
    color: '#8a4b00',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  officeHoursWarningText: {
    color: '#8a4b00',
    fontSize: 13,
    lineHeight: 18,
  },
  submitButtonDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.75,
  },
  locationCoordsText: {
    fontSize: 14,
    color: theme.textMuted,
  },
});

export default CreatePassSlipScreen;
