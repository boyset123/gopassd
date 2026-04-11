import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView, Image, ImageStyle } from 'react-native';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackNavigationProp } from '@react-navigation/stack';
import { FontAwesome } from '@expo/vector-icons';
import RegistrationForm from './RegistrationForm';
import UserManagement from './UserManagement';
import { styles } from './AdminScreen.styles';

type RootStackParamList = {
  Login: undefined;
  Admin: undefined;
};

type AdminScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Admin'>;

interface Props {
  navigation: AdminScreenNavigationProp;
}

const AdminScreen: React.FC<Props> = ({ navigation }) => {
  const { isNarrow } = useResponsiveLayout();
  const [activeNav, setActiveNav] = useState('Dashboard');

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={[styles.container, isNarrow && styles.containerMobile]}>
      {/* Sidebar */}
      <View style={[styles.sidebar, isNarrow && styles.sidebarMobile]}>
        <View style={[styles.sidebarInner, isNarrow && styles.sidebarInnerMobile]}>
          <View style={[styles.sidebarBrand, isNarrow && styles.sidebarBrandMobile]}>
            <Image source={require('../../assets/dorsulogo-removebg-preview (1).png')} style={styles.logoImage as ImageStyle} />
            <Text style={styles.logo}>GoPass DOrSU</Text>
          </View>
          <View style={[styles.nav, isNarrow && styles.navMobile]}>
            <Pressable
              style={[styles.navItem, activeNav === 'Dashboard' && styles.activeNavItem, isNarrow && styles.navItemMobile]}
              onPress={() => setActiveNav('Dashboard')}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="th-large" size={20} color={activeNav === 'Dashboard' ? '#fff' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeNav === 'Dashboard' && styles.activeNavText]}>Dashboard</Text>
            </Pressable>
            <Pressable
              style={[styles.navItem, activeNav === 'Users' && styles.activeNavItem, isNarrow && styles.navItemMobile]}
              onPress={() => setActiveNav('Users')}
            >
              <View style={styles.navIcon}>
                <FontAwesome name="users" size={20} color={activeNav === 'Users' ? '#fff' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.navText, activeNav === 'Users' && styles.activeNavText]}>Users</Text>
            </Pressable>
          </View>
          <View style={[styles.sidebarBottom, isNarrow && styles.sidebarBottomMobile]}>
            <Pressable style={styles.logoutButton} onPress={handleLogout}>
              <View style={styles.navIcon}>
                <FontAwesome name="sign-out" size={20} color="rgba(255,255,255,0.9)" />
              </View>
              <Text style={styles.navText}>Logout</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={[styles.header, isNarrow && styles.headerMobile]}>
          <Text style={[styles.headerTitle, isNarrow && styles.headerTitleMobile]}>
            {activeNav === 'Dashboard' ? 'Register New User' : 'User Management'}
          </Text>
        </View>
        <ScrollView
          style={[styles.mainScroll, isNarrow && styles.mainScrollMobile]}
          contentContainerStyle={[styles.contentContainer, isNarrow && styles.contentContainerMobile]}
        >
          {activeNav === 'Dashboard' && <RegistrationForm />}
          {activeNav === 'Users' && <UserManagement />}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

export default AdminScreen;
