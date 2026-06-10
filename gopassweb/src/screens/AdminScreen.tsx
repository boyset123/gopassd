import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView, Image, ImageStyle } from 'react-native';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackNavigationProp } from '@react-navigation/stack';
import { FontAwesome } from '@expo/vector-icons';
import RegistrationForm from './RegistrationForm';
import UserManagement from './UserManagement';
import MasterDataManagement from './MasterDataManagement';
import { styles } from './AdminScreen.styles';

type RootStackParamList = {
  Login: undefined;
  Admin: undefined;
};

type AdminScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Admin'>;

interface Props {
  navigation: AdminScreenNavigationProp;
}

const NAV_ITEMS = [
  { key: 'Dashboard', icon: 'th-large' as const, label: 'Dashboard' },
  { key: 'Users', icon: 'users' as const, label: 'Users' },
  { key: 'OrgSetup', icon: 'university' as const, label: 'Roles, Faculties & Campuses' },
];

const AdminScreen: React.FC<Props> = ({ navigation }) => {
  const { isNarrow } = useResponsiveLayout();
  const [activeNav, setActiveNav] = useState('Dashboard');

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['userToken', 'userRole']);
    navigation.replace('Login');
  };

  const headerTitle =
    activeNav === 'Dashboard'
      ? 'Register New User'
      : activeNav === 'Users'
        ? 'User Management'
        : 'Roles, Faculties & Campuses';

  const renderContent = () => {
    if (activeNav === 'Dashboard') return <RegistrationForm />;
    if (activeNav === 'Users') return <UserManagement />;
    return <MasterDataManagement />;
  };

  return (
    <SafeAreaView style={[styles.container, isNarrow && styles.containerMobile]}>
      <View style={[styles.sidebar, isNarrow && styles.sidebarMobile]}>
        <View style={[styles.sidebarInner, isNarrow && styles.sidebarInnerMobile]}>
          <View style={[styles.sidebarBrand, isNarrow && styles.sidebarBrandMobile]}>
            <Image source={require('../../assets/dorsulogo-removebg-preview (1).png')} style={styles.logoImage as ImageStyle} />
            <Text style={styles.logo}>GoPass DOrSU</Text>
          </View>
          <View style={[styles.nav, isNarrow && styles.navMobile]}>
            {NAV_ITEMS.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.navItem, activeNav === item.key && styles.activeNavItem, isNarrow && styles.navItemMobile]}
                onPress={() => setActiveNav(item.key)}
              >
                <View style={styles.navIcon}>
                  <FontAwesome
                    name={item.icon}
                    size={20}
                    color={activeNav === item.key ? '#fff' : 'rgba(255,255,255,0.75)'}
                  />
                </View>
                <Text style={[styles.navText, activeNav === item.key && styles.activeNavText]}>{item.label}</Text>
              </Pressable>
            ))}
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

      <View style={styles.mainContent}>
        <View style={[styles.header, isNarrow && styles.headerMobile]}>
          <Text style={[styles.headerTitle, isNarrow && styles.headerTitleMobile]}>{headerTitle}</Text>
        </View>
        <ScrollView
          style={[styles.mainScroll, isNarrow && styles.mainScrollMobile]}
          contentContainerStyle={[styles.contentContainer, isNarrow && styles.contentContainerMobile]}
          showsVerticalScrollIndicator
        >
          {renderContent()}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

export default AdminScreen;
