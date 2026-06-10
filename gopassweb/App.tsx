import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, StyleSheet, Platform, Text, TextInput, Pressable, ImageBackground } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import AdminScreen from './src/screens/AdminScreen';
import HrpDashboardScreen from './src/screens/HrpDashboardScreen';
import SecurityDashboardScreen from './src/screens/SecurityDashboardScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { getWebInitialRouteForRole, isWebAllowedRole } from './src/config/webAuth';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServerTimeProvider } from './src/hooks/useServerTime';

const Stack = createStackNavigator();

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');

      document.documentElement.style.height = '100%';
      document.body.style.height = '100%';
      document.body.style.margin = '0';
      const root = document.getElementById('root');
      if (root) {
        root.style.height = '100%';
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
      }
    }
  }, []);

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const role = await AsyncStorage.getItem('userRole');
        if (token && role) {
          if (isWebAllowedRole(role)) {
            setUserRole(role);
          } else {
            await AsyncStorage.multiRemove(['userToken', 'userRole']);
            setUserRole(null);
          }
        }
      } catch (e) {
        console.error('Failed to load token.', e);
      } finally {
        setIsLoading(false);
      }
    };

    checkLoginStatus();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#003366" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ServerTimeProvider>
      <NavigationContainer>
        <Stack.Navigator 
        initialRouteName={userRole ? getWebInitialRouteForRole(userRole) : 'Login'}
        screenOptions={{
          headerShown: false,
          ...(Platform.OS === 'web' ? { cardStyle: { flex: 1, height: '100%' as any } } : {}),
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="Admin" component={AdminScreen} />
        <Stack.Screen name="HrpDashboard" component={HrpDashboardScreen} />
        <Stack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      </ServerTimeProvider>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;
