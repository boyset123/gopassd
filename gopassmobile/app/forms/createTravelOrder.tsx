import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Platform, Alert, TouchableOpacity, Modal, Image, ImageBackground, FlatList, ActivityIndicator, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';
import polyline from '@mapbox/polyline';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import DateTimePicker from '@react-native-community/datetimepicker';
import { API_URL } from '../../config/api';
import { Picker } from '@react-native-picker/picker';

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
  /** Placeholder / "need an entry" – more visible so hints are readable */
  placeholder: 'rgba(1,26,107,0.58)',
  /** Disabled / read-only field text – clearly not editable */
  disabledText: 'rgba(1,26,107,0.62)',
  /** Disabled / read-only field background */
  disabledBg: 'rgba(1,26,107,0.1)',
  border: 'rgba(1,26,107,0.22)',
  danger: '#dc3545',
};

interface User {
  _id: string;
  name: string;
  role: string; // Position
  faculty?: string;
}

interface Suggestion {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

const faculties = [
  'Faculty of Agriculture and Life Sciences',
  'Faculty of Computing, Engineering, and Technology',
  'Faculty of Criminal Justice Education',
  'Faculty of Nursing and Allied Health Sciences',
  'Faculty of Humanities, Social Science, and Communication',
  'Faculty of Teacher Education',
  'Faculty of Business Management',
];

const campuses = [
  'Main Campus',
  'Baganga Campus',
  'Banaybanay Campus',
  'Cateel Campus',
  'San Isidro Campus',
  'Tarragona Campus',
];

const CreateTravelOrderScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapViewRef = useRef<MapView>(null);
  const [user, setUser] = useState<User | null>(null);
  const [presidentName, setPresidentName] = useState('Roy G. Ponce, Ed.D.');

  // Form States
  const [travelOrderNo, setTravelOrderNo] = useState('');
  const [recommenders, setRecommenders] = useState([{ id: '', name: '' }]);
  const [date, setDate] = useState(new Date());
  const [address, setAddress] = useState('');
  const [employeeAddress, setEmployeeAddress] = useState('DORSU, CITY OF MATI, DAVAO ORIENTAL');
  const [salary, setSalary] = useState('');
  const [purpose, setPurpose] = useState('');
  const [departureDate, setDepartureDate] = useState(new Date());
  const [arrivalDate, setArrivalDate] = useState(new Date());
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSuggestionsVisible, setSuggestionsVisible] = useState(false);
  const [participants, setParticipants] = useState(['']);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);
  const [userList, setUserList] = useState<User[]>([]);
  const [facultyFilter, setFacultyFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');

  // Date Picker States
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDepartureDatePicker, setShowDepartureDatePicker] = useState(false);
  const [showDepartureTimePicker, setShowDepartureTimePicker] = useState(false);
  const [showArrivalDatePicker, setShowArrivalDatePicker] = useState(false);
  const [showArrivalTimePicker, setShowArrivalTimePicker] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentUserLocation, setCurrentUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 7.0731, // Default to a central location in Mati
    longitude: 126.2167,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

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

          const ongoingStatuses = ['Pending', 'Recommended', 'Approved', 'For President Approval'];
          const hasOngoing = combinedSubmissions.some(s => ongoingStatuses.includes(s.status));

          if (hasOngoing) {
            Alert.alert(
              'Ongoing Submission',
              'You cannot create a new travel order while another submission is in progress.',
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
    const fetchPresident = async () => {
      try {
        const response = await axios.get(`${API_URL}/users/president`);
        if (response.data && response.data.name) {
          setPresidentName(response.data.name);
        }
      } catch (error) {
        console.error('Failed to fetch President\'s name:', error);
      }
    };
    fetchUserData();
    fetchPresident();
  }, []);

  // Compute a region that fits both user location and destination (so map doesn't open zoomed only to user)
  const computeRegionForDestination = useCallback((dest: { latitude: number; longitude: number }) => {
    const user = currentUserLocation;
    if (!user) return null;
    const minLat = Math.min(user.latitude, dest.latitude);
    const maxLat = Math.max(user.latitude, dest.latitude);
    const minLon = Math.min(user.longitude, dest.longitude);
    const maxLon = Math.max(user.longitude, dest.longitude);
    const pad = 0.15;
    const latDelta = Math.max((maxLat - minLat) * (1 + pad), 0.02);
    const lonDelta = Math.max((maxLon - minLon) * (1 + pad), 0.02);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lonDelta,
    };
  }, [currentUserLocation]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission to access location was denied');
        return;
      }
      try {
        let currentLocation = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = currentLocation.coords;
        setCurrentUserLocation({ latitude, longitude });
        setMapRegion({
          latitude,
          longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
      } catch (error) {
        console.error('Failed to get current location for map centering:', error);
      }
    })();
  }, []);

  // When selectedLocation changes (e.g. from dropdown or map tap), update map region to show whole destination/route (not zoomed to user only)
  useEffect(() => {
    if (!selectedLocation || !currentUserLocation) return;
    const next = computeRegionForDestination(selectedLocation);
    if (next) setMapRegion(next);
  }, [selectedLocation?.latitude, selectedLocation?.longitude, currentUserLocation, computeRegionForDestination]);

  useEffect(() => {
    const findApprover = async () => {
      if (user && user.faculty) {
        try {
          let response;
          if (user.role === 'Faculty Staff') {
            response = await axios.get(`${API_URL}/users/program-head-by-faculty/${user.faculty}`);
          } else if (user.role === 'Program Head') {
            response = await axios.get(`${API_URL}/users/dean-by-faculty/${user.faculty}`);
          }

          if (response && response.data) {
            setRecommenders([{ id: response.data._id, name: response.data.name }]);
          }
        } catch (error: any) {
          if (error.response?.status === 404) {
            console.log(`No approver found for faculty:`, user.faculty);
          } else {
            console.error('Error finding approver:', error);
            Alert.alert('Info', 'Could not automatically find your approver. Please select their name manually.');
          }
        }
      }
    };

    if (user) {
      findApprover();
    }
  }, [user]);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      setSuggestionsVisible(false);
      return;
    }
    try {
      const query = `${text}, Philippines`;
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=ph`,
        {
          headers: { 'User-Agent': 'GOPASSDORSU Mobile App/1.0' },
        }
      );
      setSuggestions(response.data || []);
      setSuggestionsVisible(true);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchSuggestions(address);
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [address, fetchSuggestions]);

  // When map is visible, fit to show whole route or both origin + destination (not zoomed to user location only)
  useEffect(() => {
    if (!isMapVisible || !mapViewRef.current) return;
    const fit = () => {
      if (!mapViewRef.current) return;
      const padding = { top: 60, right: 60, bottom: 60, left: 60 };
      if (routeCoordinates.length > 0) {
        mapViewRef.current.fitToCoordinates(routeCoordinates, { edgePadding: padding, animated: true });
      } else if (selectedLocation && currentUserLocation) {
        mapViewRef.current.fitToCoordinates([currentUserLocation, selectedLocation], { edgePadding: padding, animated: true });
      }
    };
    const t = setTimeout(fit, 100);
    return () => clearTimeout(t);
  }, [isMapVisible, selectedLocation, currentUserLocation, routeCoordinates]);

  const handleAddParticipant = () => {
    setParticipants([...participants, '']);
  };

  const handleParticipantChange = (text: string, index: number) => {
    const newParticipants = [...participants];
    newParticipants[index] = text;
    setParticipants(newParticipants);
  };

  const handleRemoveParticipant = (index: number) => {
    const newParticipants = [...participants];
    newParticipants.splice(index, 1);
    setParticipants(newParticipants);
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, {
        params: { 
          faculty: facultyFilter, 
          campus: campusFilter,
          role: 'Program Head'
        },
      });
      setUserList(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  useEffect(() => {
    if (isUserModalVisible) {
      fetchUsers();
    }
  }, [isUserModalVisible, facultyFilter, campusFilter]);

  const [selectingRecommenderIndex, setSelectingRecommenderIndex] = useState(0);

  const handleSelectUser = (user: User) => {
    const newRecommenders = [...recommenders];
    newRecommenders[selectingRecommenderIndex] = { id: user._id, name: user.name };
    setRecommenders(newRecommenders);
    setIsUserModalVisible(false);
  };

  const handleAddRecommender = () => {
    setRecommenders([...recommenders, { id: '', name: '' }]);
  };

  const handleRecommenderChange = (text: string, index: number) => {
    const newRecommenders = [...recommenders];
    newRecommenders[index].name = text;
    newRecommenders[index].id = ''; // Reset ID if name is manually changed
    setRecommenders(newRecommenders);
  };

  const handleRemoveRecommender = (index: number) => {
    const newRecommenders = [...recommenders];
    newRecommenders.splice(index, 1);
    setRecommenders(newRecommenders);
  };

  const handlePreview = () => {
    if (!address || !salary || !purpose || !recommenders[0]?.name || !employeeAddress) {
      Alert.alert('Validation Error', 'Please fill out all required fields and ensure at least one recommender is set.');
      return;
    }
    const hasInvalidRecommender = recommenders.some(r => !r.id);
    if (hasInvalidRecommender) {
      Alert.alert('Validation Error', 'Please select recommenders using the search icon. Manual entry is not supported for recommendations.');
      return;
    }
    setIsPreviewVisible(true);
  };

  const getRoute = async (destination: { latitude: number; longitude: number }) => {
    if (!currentUserLocation) return;
    try {
      const response = await fetch(
        `http://router.project-osrm.org/route/v1/driving/${currentUserLocation.longitude},${currentUserLocation.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=polyline`
      );
      const json = await response.json();
      if (json.routes && json.routes.length > 0) {
        const geometry = json.routes[0].geometry;
        setRoutePolyline(geometry);
        const decoded = polyline.decode(geometry);
        const coords = decoded.map(point => ({ latitude: point[0], longitude: point[1] }));
        setRouteCoordinates(coords);
        // Fit map to whole route when map is visible (so we show destination/route, not just user location)
        if (isMapVisible && mapViewRef.current && coords.length > 0) {
          setTimeout(() => {
            mapViewRef.current?.fitToCoordinates(coords, {
              edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
              animated: true,
            });
          }, 150);
        }
      } else {
        setRouteCoordinates([]);
        setRoutePolyline(null);
      }
    } catch (error) {
      console.error('Failed to fetch route from OSRM:', error);
      setRouteCoordinates([]);
    }
  };

  const handleMapPress = async (e: any) => {
    const destinationCoord = e.nativeEvent.coordinate;
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
        setAddress(data.display_name);
      } else {
        setAddress(`${destinationCoord.latitude.toFixed(5)}, ${destinationCoord.longitude.toFixed(5)}`);
      }
    } catch (error) {
      console.error('Reverse geocoding for tapped coordinate failed:', error);
      setAddress(`${destinationCoord.latitude.toFixed(5)}, ${destinationCoord.longitude.toFixed(5)}`);
    }
  };

  const handlePoiClick = (e: any) => {
    const poi = e.nativeEvent;
    setAddress(poi.name);
    setSelectedLocation(poi.coordinate);
    setRouteCoordinates([]); // Clear previous route
    getRoute(poi.coordinate);
  };

  const handleConfirmDestination = () => {
    if (selectedLocation) {
      setLocation(selectedLocation);
    }
    setIsMapVisible(false);
  };

  // Keep the date part from base, apply only hours and minutes from timeValue (avoids time picker overwriting the chosen date)
  const mergeTimeIntoDate = (base: Date, timeValue: Date): Date =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate(), timeValue.getHours(), timeValue.getMinutes(), 0, 0);

  // Normalize to whole minute so stored value matches what user picked (no random seconds/ms)
  const toISOStringAtMinute = (d: Date): string => {
    const normalized = new Date(d);
    normalized.setSeconds(0, 0);
    return normalized.toISOString();
  };

  const handleSubmit = async () => {
    setIsPreviewVisible(false);
    setIsSubmitting(true);

    try {
      if (startOfDay(date).getTime() < todayStart.getTime()) {
        Alert.alert('Invalid Date', 'Please select today or a future date.');
        return;
      }
      if (startOfDay(departureDate).getTime() < todayStart.getTime()) {
        Alert.alert('Invalid Departure Date', 'Departure date cannot be in the past.');
        return;
      }
      if (startOfDay(arrivalDate).getTime() < startOfDay(departureDate).getTime()) {
        Alert.alert('Invalid Arrival Date', 'Arrival date cannot be earlier than departure date.');
        return;
      }

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Authentication Error', 'You are not logged in.');
        router.replace('/');
        return;
      }

      const travelOrderData = {
        employeeAddress,
        travelOrderNo,
        date: toISOStringAtMinute(date),
        address,
        salary,
        to: address, // Use address as the 'to' field for submission
        purpose,
        departureDate: toISOStringAtMinute(departureDate),
        arrivalDate: toISOStringAtMinute(arrivalDate),
        additionalInfo,
        recommendedBy: JSON.stringify(recommenders.map(r => r.id).filter(id => id)),
        latitude: location?.latitude,
        longitude: location?.longitude,
        routePolyline: routePolyline,
        participants: JSON.stringify(participants.filter(p => p.trim() !== '')),
      };

      await axios.post(`${API_URL}/travel-orders`, travelOrderData, {
        headers: { 'x-auth-token': token },
      });

      Alert.alert('Success', 'Travel Order submitted successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);

    } catch (error) {
      console.error('Travel order submission error:', error);
      Alert.alert('Submission Failed', 'Could not submit your travel order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Map Modal */}
      {/* User Selection Modal */}
      <Modal visible={isUserModalVisible} animationType="slide" onRequestClose={() => setIsUserModalVisible(false)}>
        <View style={[styles.userModalContainer, { paddingTop: insets.top + 8 }]}>
          <View style={styles.recommenderModalHeader}>
            <View style={styles.recommenderModalTitleRow}>
              <View style={styles.recommenderModalIconWrap}>
                <FontAwesome name="user-circle" size={22} color={theme.primary} />
              </View>
              <View>
                <Text style={styles.recommenderModalTitle}>Select Recommender</Text>
                <Text style={styles.recommenderModalSubtitle}>Choose a Program Head</Text>
              </View>
            </View>
            <Pressable onPress={() => setIsUserModalVisible(false)} style={styles.recommenderModalCloseBtn} hitSlop={12}>
              <FontAwesome name="times" size={22} color={theme.textMuted} />
            </Pressable>
          </View>

          <View style={styles.recommenderFilterSection}>
            <Text style={styles.recommenderFilterLabel}>Filter by</Text>
            <View style={styles.recommenderFilterRow}>
              <View style={styles.recommenderFilterField}>
                <Text style={styles.recommenderFilterFieldLabel}>Faculty</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={facultyFilter}
                    onValueChange={(itemValue) => setFacultyFilter(itemValue)}
                    style={styles.picker}
                    dropdownIconColor={theme.primary}
                  >
                    <Picker.Item label="All faculties" value="" color={theme.text} />
                    {faculties.map(faculty => (
                      <Picker.Item key={faculty} label={faculty} value={faculty} color={theme.text} />
                    ))}
                  </Picker>
                </View>
              </View>
              <View style={styles.recommenderFilterField}>
                <Text style={styles.recommenderFilterFieldLabel}>Campus</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={campusFilter}
                    onValueChange={(itemValue) => setCampusFilter(itemValue)}
                    style={styles.picker}
                    dropdownIconColor={theme.primary}
                  >
                    <Picker.Item label="All campuses" value="" color={theme.text} />
                    {campuses.map(campus => (
                      <Picker.Item key={campus} label={campus} value={campus} color={theme.text} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>
          </View>

          {userList.length === 0 ? (
            <View style={styles.recommenderEmptyState}>
              <FontAwesome name="users" size={40} color={theme.textMuted} style={{ marginBottom: 12 }} />
              <Text style={styles.recommenderEmptyTitle}>No recommenders found</Text>
              <Text style={styles.recommenderEmptySubtitle}>Try changing faculty or campus filter</Text>
            </View>
          ) : (
            <FlatList
              data={userList}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.recommenderListContent}
              renderItem={({ item }: { item: User }) => (
                <Pressable
                  style={({ pressed }) => [styles.userItem, pressed && styles.userItemPressed]}
                  onPress={() => handleSelectUser(item)}
                >
                  <View style={styles.userItemIconWrap}>
                    <FontAwesome name="user" size={18} color={theme.primary} />
                  </View>
                  <View style={styles.userItemTextWrap}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userDetails}>{item.role}{item.faculty ? ` · ${item.faculty}` : ''}</Text>
                  </View>
                  <FontAwesome name="chevron-right" size={14} color={theme.textMuted} />
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Map Modal - Select Destination */}
      <Modal visible={isMapVisible} animationType="slide" onRequestClose={() => setIsMapVisible(false)}>
        <View style={[styles.mapModalContainer, { paddingTop: insets.top + 8 }]}>
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
                <MapView
                    ref={mapViewRef}
                    style={styles.map}
                    region={mapRegion}
                    onPress={handleMapPress}
                    onPoiClick={handlePoiClick}
                    showsUserLocation
                    mapType="hybrid"
                >
                    {currentUserLocation && <Marker coordinate={currentUserLocation} title="Your Location" pinColor="blue" />}
                    {selectedLocation && <Marker coordinate={selectedLocation} title="Selected Destination" />}
                    {routeCoordinates.length > 0 && (
                      <Polyline
                        coordinates={routeCoordinates}
                        strokeWidth={4}
                        strokeColor={theme.accent}
                      />
                    )}
                </MapView>
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
              <Text style={styles.screenHeaderTitle}>Create Travel Order</Text>
              <Text style={styles.screenHeaderSubtitle}>Official Business Travel</Text>
            </View>
          </View>
        </ImageBackground>
      <View style={styles.contentContainer}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.formCard}>
            <View style={styles.formCardTopBar} />
            <View style={styles.formCardHeader}>
              <View style={styles.formCardIconWrap}>
                <FontAwesome name="plane" size={20} color="#fff" />
              </View>
              <View>
                <Text style={styles.formTitle}>Travel Order</Text>
                <Text style={styles.formSubtitle}>Revised 1996</Text>
              </View>
            </View>
            <View style={styles.formCardBody}>
            <View style={[styles.row, styles.fieldContainerTight]}>
              <View style={[styles.fieldContainer, styles.fieldContainerTight, styles.flexInput]}>
                <Text style={styles.label}>Travel Order No.:</Text>
                <TextInput
                  style={styles.input}
                  value={travelOrderNo}
                  onChangeText={setTravelOrderNo}
                  editable={user?.role === 'Human Resource Personnel'}
                  placeholder={user?.role === 'Human Resource Personnel' ? 'Enter travel order number' : 'Assigned by HR'}
                  placeholderTextColor={theme.placeholder}
                />
              </View>
              <View style={[styles.fieldContainer, styles.fieldContainerTight, styles.flexInput]}>
                <Text style={styles.label}>Date:</Text>
                <Pressable onPress={() => setShowDatePicker(true)}>
                  <View style={[styles.input, styles.inputReadOnly]}>
                    <Text style={styles.inputDisplayTextReadOnly}>{date.toLocaleDateString()}</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            <View style={[styles.fieldContainer, styles.sectionGap]}>
              <Text style={styles.label}>TO:</Text>
              <View style={styles.toContainer}>
                <TextInput style={[styles.toInput, styles.toInputDisabled]} value={user?.name} editable={false} placeholderTextColor={theme.placeholder} />
                <Pressable onPress={handleAddParticipant} style={styles.addButton}>
                  <FontAwesome name="plus" size={20} color={theme.primary} />
                </Pressable>
              </View>
            </View>
            {participants.map((participant, index) => (
              <View key={index} style={styles.participantContainer}>
                <TextInput
                  style={styles.participantInput}
                  value={participant}
                  onChangeText={(text) => handleParticipantChange(text, index)}
                  placeholder={`Participant ${index + 2}`}
                  placeholderTextColor={theme.placeholder}
                />
                <Pressable onPress={() => handleRemoveParticipant(index)} style={styles.removeButton}>
                  <FontAwesome name="minus" size={20} color={theme.danger} />
                </Pressable>
              </View>
            ))}

            <View style={[styles.row, styles.sectionGap, styles.fieldContainerTight]}>
                <View style={[styles.fieldContainer, styles.fieldContainerTight, styles.flexInput]}>
                    <Text style={styles.label}>Position:</Text>
                    <TextInput style={[styles.input, styles.inputDisabled]} value={user?.role} editable={false} />
                </View>
                <View style={[styles.fieldContainer, styles.fieldContainerTight, styles.flexInput]}>
                    <Text style={styles.label}>Salary:</Text>
                    <View style={styles.currencyInputContainer}>
                      <Text style={styles.currencySymbol}>₱</Text>
                      <TextInput
                        style={styles.currencyInput}
                        value={salary ? salary.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                        onChangeText={(text) => setSalary(text.replace(/,/g, '').replace(/\D/g, ''))}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={theme.placeholder}
                      />
                    </View>
                </View>
            </View>

            <View style={[styles.fieldContainer, styles.sectionGap]}>
              <Text style={styles.label}>Address:</Text>
              <TextInput
                style={styles.input}
                value={employeeAddress}
                onChangeText={setEmployeeAddress}
                placeholder="Enter your address"
                placeholderTextColor={theme.placeholder}
              />
            </View>

            <Text style={styles.sectionText}>You are hereby directed to travel on official business:</Text>

            <View style={[styles.fieldContainer, styles.fieldContainerTight]}>
              <Text style={styles.label}>To (Address / Destination)</Text>
              <Text style={styles.destinationHint}>Enter address or pick on map</Text>
              <View style={styles.destinationContainer}>
                <TextInput
                  style={styles.destinationInput}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Enter address"
                  placeholderTextColor={theme.placeholder}
                />
                <Pressable
                  onPress={() => setIsMapVisible(true)}
                  style={({ pressed }) => [styles.mapSelectButton, pressed && styles.mapSelectButtonPressed]}
                  accessibilityLabel="Pick destination on map"
                >
                  <FontAwesome name="map-marker" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.mapSelectButtonText}>Map</Text>
                </Pressable>
              </View>
              {isSuggestionsVisible && suggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {suggestions.map((item: Suggestion) => {
                      const lat = typeof item.lat === 'string' ? parseFloat(item.lat) : Number(item.lat);
                      const lon = typeof item.lon === 'string' ? parseFloat(item.lon) : Number(item.lon);
                      if (isNaN(lat) || isNaN(lon)) return null;
                      const newLocation = { latitude: lat, longitude: lon };
                      return (
                        <TouchableOpacity
                          key={item.place_id}
                          style={styles.suggestionItem}
                          activeOpacity={0.7}
                          onPress={() => {
                            Keyboard.dismiss();
                            setAddress(item.display_name);
                            setSelectedLocation(newLocation);
                            setLocation(newLocation);
                            setSuggestions([]);
                            setSuggestionsVisible(false);
                            if (currentUserLocation) {
                              getRoute(newLocation);
                            }
                            setIsMapVisible(true);
                          }}
                        >
                          <FontAwesome name="map-pin" size={14} color={theme.primary} style={styles.suggestionIcon} />
                          <Text style={styles.suggestionItemText} numberOfLines={2}>{item.display_name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={[styles.fieldContainer, styles.fieldContainerTight]}>
              <Text style={styles.label}>Purpose/s:</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                multiline
                numberOfLines={3}
                value={purpose}
                onChangeText={setPurpose}
                placeholder="Enter purpose of travel"
                placeholderTextColor={theme.placeholder}
              />
            </View>

            <Text style={styles.sectionText}>You will leave and return to your official station</Text>

            <View style={[styles.departureArrivalRow, styles.fieldContainerTight]}>
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Date of Departure:</Text>
                <View style={styles.dateTimePickerContainer}>
                  <Pressable onPress={() => setShowDepartureDatePicker(true)} style={styles.datePickerInput}>
                    <View style={[styles.input, styles.inputReadOnly]}>
                      <Text style={styles.inputDisplayTextReadOnly}>{departureDate.toLocaleDateString()}</Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setShowDepartureTimePicker(true)} style={styles.timePickerInput}>
                    <View style={[styles.input, styles.inputReadOnly]}>
                      <Text style={styles.inputDisplayTextReadOnly}>{departureDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Date of Arrival:</Text>
                <View style={styles.dateTimePickerContainer}>
                  <Pressable onPress={() => setShowArrivalDatePicker(true)} style={styles.datePickerInput}>
                    <View style={[styles.input, styles.inputReadOnly]}>
                      <Text style={styles.inputDisplayTextReadOnly}>{arrivalDate.toLocaleDateString()}</Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setShowArrivalTimePicker(true)} style={styles.timePickerInput}>
                    <View style={[styles.input, styles.inputReadOnly]}>
                      <Text style={styles.inputDisplayTextReadOnly}>{arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>

            <Text style={styles.sectionText}>You shall be guided further by the following additional instruction and information on</Text>
            <View style={[styles.fieldContainer, styles.fieldContainerTight]}>
              <TextInput style={styles.input} value={additionalInfo} onChangeText={setAdditionalInfo} placeholder="Additional instructions" placeholderTextColor={theme.placeholder} />
            </View>

            {location && (
              <View style={[styles.fieldContainer, styles.fieldContainerTight]}>
                <Text style={styles.label}>Selected Location:</Text>
                <Text style={styles.locationCoordsText}>Latitude: {location.latitude.toFixed(4)}, Longitude: {location.longitude.toFixed(4)}</Text>
              </View>
            )}
            {locationError && <Text style={styles.errorText}>{locationError}</Text>}

            <Text style={styles.staticTextFirst}>Your travelling expenses in the field will be authorized or allowed under Official Business.</Text>
            <Text style={styles.staticText}>Chargeable against Higher Education.</Text>
            <Text style={styles.staticText}>Upon completion of your travel, you are required to submit your full report through proper channel; no travel order shall be issued for the succeeding work unless a copy of your accomplishment in the immediate past is herewith attached or presented.</Text>

            <View style={[styles.signatureContainer, styles.sectionGap]}>
              <View style={styles.recommenderHeaderRow}>
                <Text style={styles.signatureLabel}>Recommended by:</Text>
                <Pressable onPress={handleAddRecommender} style={styles.addButton}>
                  <FontAwesome name="plus" size={20} color={theme.primary} />
                </Pressable>
              </View>
              {recommenders[0] && (
                <View style={styles.recommenderRow}>
                  <TextInput
                    style={styles.signatureNameInput}
                    value={recommenders[0].name}
                    onChangeText={(text) => handleRecommenderChange(text, 0)}
                    placeholder="Immediate Chief"
                    placeholderTextColor={theme.placeholder}
                    editable={user?.role !== 'Faculty Staff'}
                  />
                  {user?.role !== 'Faculty Staff' && (
                    <Pressable onPress={() => { setSelectingRecommenderIndex(0); setIsUserModalVisible(true); }} style={styles.selectUserButton}>
                      <FontAwesome name="search" size={20} color={theme.primary} />
                    </Pressable>
                  )}
                </View>
              )}
              <Text style={styles.signatureTitle}>Immediate Chief</Text>

              {recommenders.slice(1).map((recommender, index) => (
                <View key={index + 1}>
                  <View style={styles.recommenderRow}>
                    <TextInput
                      style={styles.signatureNameInput}
                      value={recommender.name}
                      onChangeText={(text) => handleRecommenderChange(text, index + 1)}
                      placeholder={`Recommender ${index + 2}`}
                      placeholderTextColor={theme.placeholder}
                    />
                    <Pressable onPress={() => { setSelectingRecommenderIndex(index + 1); setIsUserModalVisible(true); }} style={styles.selectUserButton}>
                      <FontAwesome name="search" size={20} color={theme.primary} />
                    </Pressable>
                    <Pressable onPress={() => handleRemoveRecommender(index + 1)} style={styles.removeButton}>
                      <FontAwesome name="minus" size={20} color={theme.danger} />
                    </Pressable>
                  </View>
                  <Text style={styles.signatureTitle}>Immediate Chief</Text>
                </View>
              ))}
            </View>

            <View style={styles.signatureContainerSpaced}>
              <Text style={styles.signatureLabel}>Approved by:</Text>
              <TextInput
                style={[styles.signatureNameInput, styles.signatureNameInputDisabled]}
                value={presidentName}
                editable={false}
              />
              <Text style={styles.signatureTitle}>President</Text>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                minimumDate={todayStart}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  const next = selectedDate || date;
                  setDate(startOfDay(next).getTime() < todayStart.getTime() ? todayStart : next);
                }}
              />
            )}
            {showDepartureDatePicker && (
              <DateTimePicker
                value={departureDate}
                mode="date"
                display="default"
                minimumDate={todayStart}
                onChange={(event, selectedDate) => {
                  setShowDepartureDatePicker(false);
                  const next = selectedDate || departureDate;
                  const clamped = startOfDay(next).getTime() < todayStart.getTime() ? todayStart : next;
                  setDepartureDate(clamped);
                  // Keep arrival on/after departure (date-wise)
                  if (startOfDay(arrivalDate).getTime() < startOfDay(clamped).getTime()) {
                    setArrivalDate(clamped);
                  }
                }}
              />
            )}
            {showDepartureTimePicker && (
              <DateTimePicker value={departureDate} mode="time" display="default" onChange={(event, selectedDate) => { setShowDepartureTimePicker(false); if (selectedDate) setDepartureDate(mergeTimeIntoDate(departureDate, selectedDate)); }} />
            )}
            {showArrivalDatePicker && (
              <DateTimePicker
                value={arrivalDate}
                mode="date"
                display="default"
                minimumDate={startOfDay(departureDate).getTime() > todayStart.getTime() ? startOfDay(departureDate) : todayStart}
                onChange={(event, selectedDate) => {
                  setShowArrivalDatePicker(false);
                  const next = selectedDate || arrivalDate;
                  const minArrival =
                    startOfDay(departureDate).getTime() > todayStart.getTime() ? startOfDay(departureDate) : todayStart;
                  setArrivalDate(startOfDay(next).getTime() < minArrival.getTime() ? minArrival : next);
                }}
              />
            )}
            {showArrivalTimePicker && (
              <DateTimePicker value={arrivalDate} mode="time" display="default" onChange={(event, selectedDate) => { setShowArrivalTimePicker(false); if (selectedDate) setArrivalDate(mergeTimeIntoDate(arrivalDate, selectedDate)); }} />
            )}

            <View style={[styles.buttonContainer, styles.sectionGap]}>
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

        <Modal
          animationType="fade"
          transparent={true}
          visible={isPreviewVisible}
          onRequestClose={() => setIsPreviewVisible(false)}
        >
          <View style={styles.previewOverlay}>
            <View style={styles.previewContent}>
              <ScrollView>
                <View style={styles.docHeader}>
                  <View style={styles.universityNameContainer}>
                    <View style={styles.headerLine} />
                    <Text style={styles.universityName}>DAVAO ORIENTAL STATE UNIVERSITY</Text>
                    <Text style={styles.universityMotto}>"A University of excellence, innovation, and inclusion"</Text>
                    <View style={styles.headerLine} />
                  </View>

                  <Image source={require('../../assets/images/dorsulogo.png')} style={styles.logo} />

                  <View style={styles.docHeaderRight}>
                    <View style={styles.docInfoBoxHeader}>
                      <Text style={styles.docInfoTitle}>Document Code No.</Text>
                    </View>
                    <View style={styles.docInfoBoxContent}>
                      <Text style={styles.docInfoContent}>FM-DOrSU-HRMO-01</Text>
                    </View>
                    <View style={styles.docInfoColumnsContainer}>
                      <Text style={styles.docInfoColumnHeader}>Issue Status</Text>
                      <Text style={styles.docInfoColumnHeader}>Rev No.</Text>
                      <Text style={styles.docInfoColumnHeader}>Effective Date</Text>
                      <Text style={[styles.docInfoColumnHeader, { borderRightWidth: 0 }]}>Page No.</Text>
                    </View>
                    <View style={styles.docInfoColumnsContainer}>
                      <Text style={styles.docInfoColumnValue}>01</Text>
                      <Text style={styles.docInfoColumnValue}>00</Text>
                      <Text style={styles.docInfoColumnValue}>07.22.2022</Text>
                      <Text style={[styles.docInfoColumnValue, { borderRightWidth: 0 }]}>1 of 1</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.docTitle}>TRAVEL ORDER FORM</Text>
                <Text style={styles.revisedText}>Revised 1996</Text>

                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Travel Order No.</Text>
                  <Text style={styles.formValue}>{travelOrderNo}</Text>
                  <Text style={styles.formLabelRight}>Date</Text>
                  <Text style={styles.formValue}>{date.toLocaleDateString()}</Text>
                </View>

                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>TO:</Text>
                  <Text style={styles.formValue}>{user?.name}</Text>
                </View>
                {participants.filter(p => p.trim() !== '').map((participant, index) => (
                  <View key={index} style={styles.formRow}>
                    <Text style={styles.formLabel}></Text> 
                    <Text style={styles.formValue}>{participant}</Text>
                  </View>
                ))}
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>POSITION:</Text>
                  <Text style={styles.formValue}>{user?.role}</Text>
                </View>
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>ADDRESS:</Text>
                  <Text style={styles.formValue}>{employeeAddress}</Text>
                </View>
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>SALARY:</Text>
                  <Text style={styles.formValue}>₱{salary ? salary.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}</Text>
                </View>

                <Text style={styles.directiveText}>You are hereby directed to travel on official business:</Text>

                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>TO:</Text>
                  <Text style={styles.formValue}>{address}</Text>
                </View>
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>PURPOSE/S:</Text>
                  <Text style={styles.formValue}>{purpose}</Text>
                </View>

                <Text style={styles.directiveText}>You will leave and return to your official station</Text>

                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Date of Departure:</Text>
                  <Text style={styles.formValue}>{`${departureDate.toLocaleDateString()} ${departureDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`}</Text>
                </View>
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Date of Arrival:</Text>
                  <Text style={styles.formValue}>{`${arrivalDate.toLocaleDateString()} ${arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`}</Text>
                </View>

                <Text style={styles.infoText}>You shall be guided further by the following additional instruction and information on <Text style={{ textDecorationLine: 'underline', textDecorationColor: '#000' }}>{additionalInfo}</Text></Text>
                <Text style={styles.infoText}>Your traveling expenses in the field will be authorized or allowed under Official Business.</Text>
                <Text style={styles.infoText}>Chargeable against Higher education.</Text>
                <Text style={styles.infoText}>Upon completion of your travel, you are required to submit your full report through proper channel; no travel order shall be issued for the succeeding work unless a copy of your accomplishment in the immediate past is herewith attached or presented.</Text>

                <View style={styles.signatureSection}>
                  <View style={styles.signatureBlock}>
                    <Text style={styles.signatureHeader}>RECOMMENDED BY:</Text>
                    {recommenders.map((recommender, index) => (
                      <View key={index} style={{ marginBottom: 15 }}>
                        <View style={styles.signatureNameContainer}>
                          <Text style={styles.signatureName}>{recommender.name}</Text>
                        </View>
                        <Text style={styles.signatureTitle}>Immediate Chief</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.signatureBlock}>
                    <Text style={styles.signatureHeader}>APPROVED BY:</Text>
                    {/* Static as per image */}
                    <View style={styles.signatureNameContainer}>
                      <Text style={styles.signatureName}>{presidentName}</Text>
                    </View>
                    <Text style={styles.signatureTitle}>President</Text>
                  </View>
                </View>

              </ScrollView>
              <View style={styles.modalButtonContainer}>
                <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsPreviewVisible(false)} disabled={isSubmitting}>
                  <Text style={styles.buttonText}>Close</Text>
                </Pressable>
                <Pressable style={[styles.modalButton, styles.submitButton]} onPress={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

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
  previewOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  previewContent: {
    width: '95%',
    maxHeight: '90%',
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
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
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
  userModalContainer: {
    flex: 1,
    backgroundColor: theme.background,
    paddingHorizontal: 16,
  },
  recommenderModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  recommenderModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  recommenderModalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(1,26,107,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recommenderModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
  },
  recommenderModalSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  recommenderModalCloseBtn: {
    padding: 8,
  },
  recommenderFilterSection: {
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  recommenderFilterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textMuted,
    marginBottom: 10,
  },
  recommenderFilterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  recommenderFilterField: {
    flex: 1,
  },
  recommenderFilterFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 6,
  },
  recommenderEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  recommenderEmptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  recommenderEmptySubtitle: {
    fontSize: 14,
    color: theme.textMuted,
  },
  recommenderListContent: {
    paddingVertical: 12,
    paddingBottom: 24,
  },
  mapModalContainer: {
    flex: 1,
    padding: 20,
    paddingHorizontal: 20,
    backgroundColor: theme.surface,
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
    borderRadius: 12,
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
  mapConfirmButtonContainer: {
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
  fieldContainerTight: {
    marginBottom: 8,
  },
  sectionGap: {
    marginTop: 22,
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
  inputDisabled: {
    backgroundColor: theme.disabledBg,
    color: theme.disabledText,
    borderColor: 'rgba(1,26,107,0.18)',
  },
  inputDisplayText: {
    fontSize: 16,
    color: theme.text,
  },
  inputDisplayTextReadOnly: {
    fontSize: 16,
    color: theme.disabledText,
  },
  inputReadOnly: {
    backgroundColor: theme.disabledBg,
    borderColor: 'rgba(1,26,107,0.18)',
  },
  currencyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: 'rgba(1,26,107,0.04)',
    paddingHorizontal: 14,
  },
  currencySymbol: {
    fontSize: 16,
    marginRight: 5,
    color: theme.text,
  },
  currencyInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    color: theme.text,
  },
  multilineInput: { height: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  flexInput: { flex: 1 },
  departureArrivalRow: {
    flexDirection: 'column',
    gap: 4,
  },
  dateTimePickerContainer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  datePickerInput: {
    flex: 2,
    minWidth: 0,
  },
  timePickerInput: {
    flex: 1,
    minWidth: 80,
    maxWidth: 120,
  },
  destinationHint: {
    fontSize: 13,
    color: theme.placeholder,
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
    paddingVertical: 12,
    paddingHorizontal: 14,
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
  map: {
    flex: 1,
    borderRadius: 16,
  },
  confirmButtonContainer: {
    paddingTop: 16,
    paddingHorizontal: 0,
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
  locationCoordsText: {
    fontSize: 14,
    color: theme.textMuted,
  },
  sectionText: { fontSize: 15, color: theme.text, marginTop: 18, marginBottom: 6 },
  staticText: { fontSize: 14, color: theme.textMuted, marginTop: 10, marginBottom: 4, fontStyle: 'italic' },
  staticTextFirst: { fontSize: 14, color: theme.textMuted, marginTop: 20, marginBottom: 4, fontStyle: 'italic' },
  signatureContainer: { marginTop: 20, marginBottom: 12, alignItems: 'flex-start' },
  signatureContainerSpaced: { marginTop: 24, marginBottom: 12, alignItems: 'flex-start' },
  recommenderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  signatureLabel: { fontSize: 14, fontWeight: '600', color: theme.text },
  signatureTitle: { fontSize: 13, color: theme.textMuted, marginTop: 4 },
  signatureNameInput: {
    fontSize: 16,
    color: theme.text,
    textAlign: 'left',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    alignSelf: 'flex-start',
    width: 180,
    minWidth: 120,
    maxWidth: 200,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(1,26,107,0.04)',
  },
  signatureNameInputDisabled: {
    backgroundColor: theme.disabledBg,
    color: theme.disabledText,
    borderColor: 'rgba(1,26,107,0.18)',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  buttonBase: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButton: { backgroundColor: theme.primary },
  cancelButton: { backgroundColor: theme.textMuted },
  submittingButton: { backgroundColor: theme.primary, opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: 'rgba(1,26,107,0.04)',
  },
  toInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    backgroundColor: 'transparent',
    color: theme.text,
  },
  toInputDisabled: {
    color: theme.disabledText,
  },
  recommenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  selectUserButton: {
    padding: 10,
  },
  addButton: {
    padding: 10,
  },
  participantContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  participantInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: 'rgba(1,26,107,0.04)',
    color: theme.text,
  },
  removeButton: {
    marginLeft: 10,
    padding: 5,
  },
  filterContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  filterButton: {
    backgroundColor: theme.primary,
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  filterButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  pickerContainer: {
    height: 48,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(1,26,107,0.04)',
    overflow: 'hidden',
  },
  picker: {
    height: '100%',
    width: '100%',
    color: theme.text,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    ...Platform.select({ ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }, android: { elevation: 2 } }),
  },
  userItemPressed: {
    backgroundColor: 'rgba(1,26,107,0.06)',
    opacity: 0.95,
  },
  userItemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(1,26,107,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userItemTextWrap: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  userDetails: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
});

export default CreateTravelOrderScreen;
