import { Tabs, useSegments, useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { View, ActivityIndicator, Platform, Dimensions, Pressable, StyleSheet, Alert, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CreateModalProvider, useCreateModal } from '../../contexts/CreateModalContext';
import { API_URL } from '../../config/api';

const tabTheme = {
  primary: '#0f172a',
  accent: '#3b82f6',
  accentSoft: 'rgba(59, 130, 246, 0.12)',
  inactive: 'rgba(15, 23, 42, 0.45)',
  surface: '#ffffff',
  surfaceElevated: 'rgba(255, 255, 255, 0.98)',
  border: 'rgba(15, 23, 42, 0.06)',
};

const FAB_SIZE = 56;
const SPEED_DIAL_ITEM_HEIGHT = 48;
const SPEED_DIAL_ICON_SIZE = 36;
const SPEED_DIAL_GAP = 10;
const SPEED_DIAL_STEP = SPEED_DIAL_ITEM_HEIGHT + SPEED_DIAL_GAP;
const TAB_BAR_HEIGHT = 56;
const TAB_BAR_RADIUS = 28;

const speedDialActions = [
  { id: 'slip', label: 'Pass Slip', icon: 'file-text-o' as const, route: '/forms/createPassSlip' as const },
  { id: 'travel', label: 'Travel Order', icon: 'plane' as const, route: '/forms/createTravelOrder' as const },
];

function SlipsFAB() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasOngoingSubmission } = useCreateModal();
  const [open, setOpen] = useState(false);
  const scale = useSharedValue(1);
  const iconRotation = useSharedValue(0);
  const dialSlideOffset = 24;
  const option1Y = useSharedValue(dialSlideOffset);
  const option2Y = useSharedValue(dialSlideOffset);
  const option1Opacity = useSharedValue(0);
  const option2Opacity = useSharedValue(0);
  const label1X = useSharedValue(20);
  const label2X = useSharedValue(20);
  const backdropOpacity = useSharedValue(0);

  const BOTTOM_MARGIN = 20;
  const fabBottom = Platform.OS === 'ios' ? BOTTOM_MARGIN : BOTTOM_MARGIN + (insets.bottom || 0);

  const animatedFabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotation.value}deg` }],
  }));

  const animatedOption1 = useAnimatedStyle(() => ({
    transform: [{ translateY: option1Y.value }],
    opacity: option1Opacity.value,
  }));

  const animatedOption2 = useAnimatedStyle(() => ({
    transform: [{ translateY: option2Y.value }],
    opacity: option2Opacity.value,
  }));

  const animatedBackdrop = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedLabel1 = useAnimatedStyle(() => ({
    transform: [{ translateX: label1X.value }],
  }));
  const animatedLabel2 = useAnimatedStyle(() => ({
    transform: [{ translateX: label2X.value }],
  }));

  useEffect(() => {
    if (open) {
      iconRotation.value = withSpring(45, { damping: 18, stiffness: 300 });
      option1Y.value = withTiming(0, { duration: 220 });
      option2Y.value = withTiming(0, { duration: 220 });
      option1Opacity.value = withTiming(1, { duration: 200 });
      option2Opacity.value = withTiming(1, { duration: 200 });
      label1X.value = withTiming(0, { duration: 240 });
      label2X.value = withTiming(0, { duration: 240 });
      backdropOpacity.value = withTiming(0.4, { duration: 200 });
    } else {
      iconRotation.value = withSpring(0, { damping: 18, stiffness: 300 });
      option1Y.value = withTiming(dialSlideOffset, { duration: 180 });
      option2Y.value = withTiming(dialSlideOffset, { duration: 180 });
      option1Opacity.value = withTiming(0, { duration: 150 });
      option2Opacity.value = withTiming(0, { duration: 150 });
      label1X.value = withTiming(20, { duration: 150 });
      label2X.value = withTiming(20, { duration: 150 });
      backdropOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [open]);

  const handlePressIn = () => {
    scale.value = withSpring(0.88, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const toggleSpeedDial = () => {
    if (hasOngoingSubmission) {
      Alert.alert(
        'Ongoing Submission',
        'You cannot create a new submission while another one is still in progress.',
        [{ text: 'OK' }]
      );
    } else {
      setOpen((prev) => !prev);
    }
  };

  const handleSpeedDialAction = (route: '/forms/createPassSlip' | '/forms/createTravelOrder') => {
    setOpen(false);
    router.push(route as any);
  };

  const closeSpeedDial = () => setOpen(false);

  return (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={closeSpeedDial}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, animatedBackdrop]} />
      </Pressable>
      <View style={[styles.speedDialContainer, { bottom: fabBottom }]}>
        {speedDialActions.map((action, index) => (
          <Animated.View
            key={action.id}
            style={[
              styles.speedDialItemWrapper,
              {
                bottom: FAB_SIZE + SPEED_DIAL_GAP + index * SPEED_DIAL_STEP,
              },
              index === 0 ? animatedOption1 : animatedOption2,
            ]}
          >
            <Pressable
              style={({ pressed }) => [styles.speedDialItem, pressed && styles.speedDialItemPressed]}
              onPress={() => handleSpeedDialAction(action.route)}
            >
              <View style={styles.speedDialIconWrap}>
                <FontAwesome name={action.icon} size={18} color={tabTheme.accent} />
              </View>
              <Animated.View style={[styles.speedDialLabelWrap, index === 0 ? animatedLabel1 : animatedLabel2]}>
                <Text style={styles.speedDialLabel}>{action.label}</Text>
              </Animated.View>
            </Pressable>
          </Animated.View>
        ))}
        <Pressable
          style={[styles.fab, { bottom: 0 }]}
          onPress={toggleSpeedDial}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.fabInner, animatedFabStyle]}>
            <Animated.View style={animatedIconStyle}>
              <FontAwesome name="plus" size={22} color="#fff" />
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

type TabDescriptorOptions = NonNullable<BottomTabBarProps['descriptors'][string]>['options'];

type PillTabItemProps = {
  focused: boolean;
  routeName: string;
  options: TabDescriptorOptions;
  onPress: () => void;
  accessibilityLabel?: string;
};

function PillTabItem({ focused, routeName, options, onPress, accessibilityLabel }: PillTabItemProps) {
  const labelOpacity = useSharedValue(focused ? 1 : 0);
  const pillOpacity = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    labelOpacity.value = withTiming(focused ? 1 : 0, { duration: 200 });
    pillOpacity.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused]);

  const animatedLabelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));
  const animatedPillStyle = useAnimatedStyle(() => ({ opacity: pillOpacity.value }));

  const color = focused ? tabTheme.primary : tabTheme.inactive;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.pillTabItem,
        !focused && styles.pillTabItemInactive,
        pressed && styles.pillTabItemPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel ?? options.title ?? routeName}
    >
      <View style={styles.pillTabItemInner}>
          <View style={[styles.pillTabContentWrap, !focused && styles.pillTabContentWrapInactive]}>
          <Animated.View style={[styles.pillTabActivePill, animatedPillStyle]} />
          <View style={[styles.pillTabContent, !focused && styles.pillTabContentInactive]}>
            <View style={styles.pillTabIconWrap}>
              {options.tabBarIcon?.({ focused, color, size: 24 })}
            </View>
            {options.title != null ? (
              <Animated.View style={[styles.pillTabLabelWrap, !focused && styles.pillTabLabelWrapInactive, animatedLabelStyle]}>
                <Text style={[styles.pillTabLabel, { color }]} numberOfLines={1}>
                  {options.title}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

type PillTabBarProps = BottomTabBarProps & { visibleTabNames: Set<string> };

function PillTabBar({ state, descriptors, navigation, visibleTabNames }: PillTabBarProps) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const tabSegment = segments[1];
  const isSlipsTab = tabSegment === 'slips';
  const isSecurityTab = tabSegment === 'securityDashboard';
  const hasFAB = isSlipsTab || isSecurityTab;
  const { width: screenWidth } = Dimensions.get('window');
  const FAB_RIGHT_MARGIN = 20;
  const GAP = 12;
  const PILL_LEFT_MARGIN = 20;
  const PILL_RIGHT_MARGIN = 20;
  const pillWidth = hasFAB
    ? screenWidth - PILL_LEFT_MARGIN - FAB_SIZE - FAB_RIGHT_MARGIN - GAP
    : screenWidth - PILL_LEFT_MARGIN - PILL_RIGHT_MARGIN;
  const BOTTOM_MARGIN = 20;
  const tabBarBottom = Platform.OS === 'ios' ? BOTTOM_MARGIN : BOTTOM_MARGIN + (insets.bottom || 0);

  const visibleRoutes = state.routes.filter((route) => visibleTabNames.has(route.name));

  return (
    <View
      style={[
        styles.pillTabBar,
        {
          marginLeft: PILL_LEFT_MARGIN,
          width: Math.max(120, pillWidth),
          bottom: tabBarBottom,
          height: TAB_BAR_HEIGHT,
          borderRadius: TAB_BAR_RADIUS,
        },
      ]}
    >
      {visibleRoutes.map((route) => {
        const { options } = descriptors[route.key];
        const originalIndex = state.routes.findIndex((r) => r.key === route.key);
        const focused = state.index === originalIndex;
        return (
          <PillTabItem
            key={route.key}
            focused={focused}
            routeName={route.name}
            options={options}
            onPress={() => navigation.navigate(route.name)}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
          />
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeOicForRoles, setActiveOicForRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const tabSegment = segments[1];
  const isSlipsTab = tabSegment === 'slips';

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const userDataString = await AsyncStorage.getItem('userData');
        if (userDataString) {
          const userData = JSON.parse(userDataString);
          setUserRole(userData.role || null);
          setActiveOicForRoles(Array.isArray(userData.activeOicForRoles) ? userData.activeOicForRoles : []);
        }
      } catch (e) {
        console.error("Failed to fetch user role from storage", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserRole();
  }, []);

  // Refresh `activeOicForRoles` whenever the tab area regains focus so that an
  // OIC dashboard appears/disappears as the principal goes on/off travel.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const token = await AsyncStorage.getItem('userToken');
          if (!token) return;
          const response = await axios.get(`${API_URL}/users/me`, {
            headers: { 'x-auth-token': token },
          });
          if (cancelled || !response?.data) return;
          const role = response.data.role || null;
          const oicRoles = Array.isArray(response.data.activeOicForRoles)
            ? response.data.activeOicForRoles
            : [];
          setUserRole(role);
          setActiveOicForRoles(oicRoles);
          try {
            const stored = await AsyncStorage.getItem('userData');
            const parsed = stored ? JSON.parse(stored) : {};
            await AsyncStorage.setItem(
              'userData',
              JSON.stringify({ ...parsed, ...response.data, activeOicForRoles: oicRoles })
            );
          } catch (storageErr) {
            if (__DEV__) console.warn('Failed to persist refreshed userData', storageErr);
          }
        } catch (err) {
          if (__DEV__) console.warn('Failed to refresh activeOicForRoles', err);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={tabTheme.primary} />
      </View>
    );
  }

  // Effective roles include both the user's own role and any roles they are
  // currently an active OIC for. Slips visibility intentionally stays keyed to
  // the user's actual role since slips are personal, not delegated.
  const effectiveRoles = new Set<string>(
    [userRole || '', ...activeOicForRoles].filter(Boolean) as string[]
  );
  const hasPresidentDash = effectiveRoles.has('President') || effectiveRoles.has('Vice President');

  const visibleTabNames = new Set<string>(['profile']);
  if (userRole && !['Security Personnel', 'President'].includes(userRole)) visibleTabNames.add('slips');
  if (effectiveRoles.has('Program Head')) visibleTabNames.add('programHeadDashboard');
  if (effectiveRoles.has('Faculty Dean')) visibleTabNames.add('facultyDeanDashboard');
  if (userRole === 'Security Personnel') visibleTabNames.add('securityDashboard');
  if (hasPresidentDash) visibleTabNames.add('presidentDashboard');

  return (
    <CreateModalProvider>
      <Tabs
        tabBar={(props) => <PillTabBar {...props} visibleTabNames={visibleTabNames} />}
        screenOptions={{
          tabBarShowLabel: false,
          headerShown: false,
        }}>
      <Tabs.Screen
        name="programHeadDashboard"
        options={{
          href: effectiveRoles.has('Program Head') ? '/(tabs)/programHeadDashboard' : null,
          headerShown: false,
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <FontAwesome size={size ?? 24} name="dashboard" color={color} />,
        }}
      />
      <Tabs.Screen
        name="slips"
        options={{
          href: userRole && !['Security Personnel', 'President'].includes(userRole) ? '/(tabs)/slips' : null,
          headerShown: false,
          title: 'My Slips',
          tabBarIcon: ({ color, size }) => <FontAwesome size={size ?? 24} name="file-text" color={color} />,
        }}
      />
      <Tabs.Screen
        name="facultyDeanDashboard"
        options={{
          href: effectiveRoles.has('Faculty Dean') ? '/(tabs)/facultyDeanDashboard' : null,
          headerShown: false,
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <FontAwesome size={size ?? 24} name="dashboard" color={color} />,
        }}
      />
      <Tabs.Screen
        name="securityDashboard"
        options={{
          href: userRole === 'Security Personnel' ? '/(tabs)/securityDashboard' : null,
          headerShown: false,
          title: 'Security',
          tabBarIcon: ({ color, size }) => <FontAwesome size={size ?? 24} name="shield" color={color} />,
        }}
      />
      <Tabs.Screen
        name="presidentDashboard"
        options={{
          href: hasPresidentDash ? '/(tabs)/presidentDashboard' : null,
          headerShown: false,
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <FontAwesome size={size ?? 24} name="dashboard" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <FontAwesome size={size ?? 24} name="user" color={color} />,
        }}
      />
      </Tabs>
      {isSlipsTab && <SlipsFAB />}
    </CreateModalProvider>
  );
}

const styles = StyleSheet.create({
  pillTabBar: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    backgroundColor: tabTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: tabTheme.border,
    paddingVertical: 6,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  pillTabItem: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 44,
    paddingVertical: 0,
    paddingHorizontal: 4,
    minWidth: 44,
  },
  pillTabItemInactive: {
    minWidth: 40,
    paddingHorizontal: 2,
  },
  pillTabItemPressed: {
    opacity: 0.7,
  },
  pillTabItemInner: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 32,
  },
  pillTabContentWrap: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
  },
  pillTabContentWrapInactive: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillTabActivePill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 9999,
    backgroundColor: tabTheme.accentSoft,
    borderWidth: 0,
  },
  pillTabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1,
  },
  pillTabContentInactive: {
    gap: 0,
  },
  pillTabIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTabLabelWrap: {
    justifyContent: 'center',
    minWidth: 0,
    maxWidth: 80,
  },
  pillTabLabelWrapInactive: {
    width: 0,
    maxWidth: 0,
    minWidth: 0,
    overflow: 'hidden',
    marginLeft: 0,
  },
  pillTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  backdrop: {
    backgroundColor: '#000',
  },
  speedDialContainer: {
    position: 'absolute',
    right: 20,
    alignItems: 'flex-end',
  },
  speedDialItemWrapper: {
    position: 'absolute',
    right: 0,
  },
  speedDialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: SPEED_DIAL_ITEM_HEIGHT,
    backgroundColor: tabTheme.surface,
    paddingVertical: 0,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: SPEED_DIAL_ITEM_HEIGHT / 2,
    borderWidth: 1,
    borderColor: tabTheme.border,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  speedDialItemPressed: {
    opacity: 0.9,
  },
  speedDialIconWrap: {
    width: SPEED_DIAL_ICON_SIZE,
    height: SPEED_DIAL_ICON_SIZE,
    borderRadius: SPEED_DIAL_ICON_SIZE / 2,
    backgroundColor: tabTheme.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedDialLabelWrap: {
    justifyContent: 'center',
  },
  speedDialLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tabTheme.primary,
  },
  fab: {
    position: 'absolute',
    right: 0,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: tabTheme.primary,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  fabInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
