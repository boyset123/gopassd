import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, SafeAreaView, Platform, Image } from 'react-native';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { API_URL } from '../config/api';

// --- Type Definitions ---
interface Employee {
  _id: string;
  name: string;
  email: string;
}

interface PassSlip {
  _id: string;
  employee: Employee;
  destination: string;
  purpose: string;
  status: string;
  approvedBy: Employee;
  departureTime?: string;
  estimatedTimeBack?: string;
}

interface TravelOrder {
  _id: string;
  employee: Employee;
  to: string;
  purpose: string;
  status: string;
  approvedBy?: Employee;
  departureTime?: string;
}

type ItemType = 'slip' | 'order';

type RootStackParamList = {
  Login: undefined;
  SecurityDashboard: undefined;
  Profile: undefined;
};

type SecurityDashboardNavigationProp = StackNavigationProp<RootStackParamList, 'SecurityDashboard'>;

const Timer = ({ departureTime, estimatedTimeBack }: { departureTime: string, estimatedTimeBack: string }) => {
  const calculateRemainingTime = () => {
    if (!departureTime || !estimatedTimeBack) return { hours: 0, minutes: 0, seconds: 0 };

    const departure = new Date(departureTime);
    if (isNaN(departure.getTime())) return { hours: 0, minutes: 0, seconds: 0 };

    // estimatedTimeBack is stored as "h:mm AM/PM" (e.g. "2:30 PM") - same day as departure
    const match = estimatedTimeBack.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return { hours: 0, minutes: 0, seconds: 0 };
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const estimatedReturn = new Date(departure.getTime());
    estimatedReturn.setHours(hours, minutes, 0, 0);
    if (estimatedReturn.getTime() < departure.getTime()) estimatedReturn.setDate(estimatedReturn.getDate() + 1);

    const now = new Date();
    const diff = estimatedReturn.getTime() - now.getTime();

    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0 };

    return {
      hours: Math.floor(diff / (1000 * 60 * 60)),
      minutes: Math.floor((diff / 1000 / 60) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  };

  const [remainingTime, setRemainingTime] = useState(calculateRemainingTime);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingTime(calculateRemainingTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [departureTime, estimatedTimeBack]);

  return (
    <Text style={styles.timerText}>
      {String(remainingTime.hours).padStart(2, '0')}:
      {String(remainingTime.minutes).padStart(2, '0')}:
      {String(remainingTime.seconds).padStart(2, '0')}
    </Text>
  );
};

// --- Main Component ---
const SecurityDashboardScreen = () => {
  const { isNarrow, isCompact } = useResponsiveLayout();
  const [currentlyOut, setCurrentlyOut] = useState<(PassSlip | TravelOrder)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigation = useNavigation<SecurityDashboardNavigationProp>();

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
      setCurrentlyOut([...verifiedSlipsResponse.data, ...verifiedOrdersResponse.data]);
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

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['userToken', 'userRole']);
    navigation.replace('Login');
  };


  const renderItem = (item: PassSlip | TravelOrder, type: ItemType) => (
    <View key={item._id} style={styles.itemContainer}>
      <Text style={styles.itemTitle}>{type === 'slip' ? 'Pass Slip' : 'Travel Order'}</Text>
      <Text style={styles.itemText}><Text style={styles.bold}>Employee:</Text> {item.employee?.name || 'N/A'}</Text>
      <Text style={styles.itemText}><Text style={styles.bold}>Purpose:</Text> {item.purpose}</Text>
      {type === 'slip' && 'destination' in item && <Text style={styles.itemText}><Text style={styles.bold}>Destination:</Text> {item.destination}</Text>}
      {type === 'order' && 'to' in item && <Text style={styles.itemText}><Text style={styles.bold}>Destination:</Text> {item.to}</Text>}
      {item.status === 'Verified' && item.departureTime && 'estimatedTimeBack' in item && item.estimatedTimeBack && (
        <Timer departureTime={item.departureTime} estimatedTimeBack={item.estimatedTimeBack} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, isNarrow && styles.containerMobile]}>
      {/* Sidebar */}
      <View style={[styles.sidebar, isNarrow && styles.sidebarMobile]}>
        <View style={[styles.sidebarTop, isNarrow && styles.sidebarTopMobile]}>
          <Image
            source={require('../../assets/dorsulogo-removebg-preview (1).png')}
            style={[styles.logoImage, isCompact && styles.logoImageCompact]}
          />
          <Text style={[styles.logo, isCompact && styles.logoTextCompact]}>GoPass DOrSU</Text>
        </View>
        <View style={[styles.nav, isNarrow && styles.navMobile]}>
          <Pressable style={[styles.navItem, styles.activeNavItem, isNarrow && styles.navItemMobile]} onPress={() => navigation.navigate('SecurityDashboard')}>
            <Text style={[styles.navText, styles.activeNavText]}>Dashboard</Text>
          </Pressable>
          <Pressable style={[styles.navItem, isNarrow && styles.navItemMobile]} onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.navText}>Profile</Text>
          </Pressable>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={[styles.header, isNarrow && styles.headerMobile]}>
          <Text style={[styles.headerTitle, isNarrow && styles.headerTitleMobile]}>Security Dashboard</Text>
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.contentContainer, isNarrow && styles.contentContainerMobile]}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#003366" />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Currently Out</Text>
              {currentlyOut.length > 0 ? (
                currentlyOut.map(item => renderItem(item, 'destination' in item ? 'slip' : 'order'))
              ) : (
                <Text style={styles.emptyText}>No one is currently out.</Text>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    ...Platform.select({
      web: {
        minHeight: '100vh' as any,
      },
    }),
  },
  containerMobile: {
    flexDirection: 'column',
  },
  sidebar: {
    width: 260,
    backgroundColor: '#003366',
    borderTopWidth: 5,
    borderTopColor: '#FFC107',
    ...Platform.select({ web: { boxShadow: '2px 0 5px rgba(0,0,0,0.05)' } })
  },
  sidebarMobile: {
    width: '100%',
    borderTopWidth: 0,
    borderBottomWidth: 4,
    borderBottomColor: '#FFC107',
    paddingBottom: 8,
    ...Platform.select({ web: { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }),
  },
  sidebarTop: {
    alignItems: 'center',
  },
  sidebarTopMobile: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 12,
    gap: 12 as any,
  },
  logoImage: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginTop: 40,
    marginBottom: 15,
  },
  logoImageCompact: {
    width: 56,
    height: 56,
    marginTop: 0,
    marginBottom: 0,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  logoTextCompact: {
    fontSize: 18,
    textAlign: 'left',
  },
  nav: {
    flex: 1,
    padding: 20,
  },
  navMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    flexGrow: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navItemMobile: {
    marginHorizontal: 4,
    marginBottom: 8,
  },
  navItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    ...Platform.select({ web: { transition: 'background-color 0.2s ease' } })
  },
  activeNavItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderLeftColor: '#FFC107',
  },
  navText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#e9ecef',
  },
  activeNavText: {
    fontWeight: 'bold',
    color: '#ffffff',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFC107',
  },
  headerMobile: {
    padding: 16,
    flexWrap: 'wrap',
    gap: 8 as any,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#003366',
    flexShrink: 1,
  },
  headerTitleMobile: {
    fontSize: 20,
  },
  contentContainer: {
    padding: 24,
  },
  contentContainerMobile: {
    padding: 16,
    paddingBottom: 32,
  },
  logoutButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#003366',
  },
  logoutButtonText: {
    color: '#003366',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#343a40',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
    paddingBottom: 8,
  },
  itemContainer: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 8,
    marginBottom: 16,
    ...Platform.select({ web: { boxShadow: '0 2px 4px rgba(0,0,0,0.05)' } })
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003366',
    marginBottom: 12,
  },
  itemText: {
    fontSize: 15,
    marginBottom: 6,
    color: '#495057',
  },
  bold: {
    fontWeight: '600',
    color: '#343a40',
  },
  errorText: {
    color: '#dc3545',
    textAlign: 'center',
    fontSize: 16,
    marginTop: 20,
  },
  emptyText: {
    color: '#6c757d',
    textAlign: 'center',
    marginTop: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    marginLeft: 10,
  },
  verifyButton: {
    backgroundColor: '#17a2b8',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  verifiedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
  },
  timerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc3545',
    marginTop: 10,
  },
});

export default SecurityDashboardScreen;
