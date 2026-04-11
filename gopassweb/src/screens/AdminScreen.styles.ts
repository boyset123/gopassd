import { StyleSheet, Platform } from 'react-native';

// Match HrpDashboardScreen: #fece00 (yellow), darker blue, #ffffff (white)
const colors = {
  primary: '#011a6b',
  primaryDark: '#010d40',
  sidebar: '#011a6b',
  sidebarActive: 'rgba(254,206,0,0.25)',
  accent: '#fece00',
  surface: '#ffffff',
  background: '#ffffff',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
  danger: '#dc3545',
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
    ...Platform.select({
      web: {
        height: '100vh' as any,
        overflow: 'hidden' as any,
      },
    }),
  },
  containerMobile: {
    flexDirection: 'column',
    ...Platform.select({
      web: {
        height: 'auto' as any,
        minHeight: '100vh' as any,
        overflow: 'visible' as any,
      },
    }),
  },
  sidebar: {
    width: 240,
    backgroundColor: colors.sidebar,
    borderTopWidth: 4,
    borderTopColor: colors.accent,
    ...Platform.select({ web: { boxShadow: '4px 0 24px rgba(0,0,0,0.08)' } }),
  },
  sidebarMobile: {
    width: '100%',
    flexShrink: 0,
    borderTopWidth: 0,
    borderBottomWidth: 4,
    borderBottomColor: colors.accent,
    ...Platform.select({ web: { boxShadow: '0 8px 24px rgba(0,0,0,0.08)' } }),
  },
  sidebarInner: {
    flex: 1,
    paddingHorizontal: 14,
  },
  sidebarInnerMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingBottom: 8,
  },
  sidebarBrandMobile: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0,
  },
  navMobile: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 0,
    minWidth: 0,
    paddingTop: 0,
    paddingBottom: 4,
    justifyContent: 'center',
  },
  navItemMobile: {
    marginBottom: 8,
    marginLeft: 4,
  },
  sidebarBottomMobile: {
    width: '100%',
    marginTop: 0,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  sidebarBrand: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  logoImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    marginBottom: 8,
  },
  logo: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  nav: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
    ...Platform.select({ web: { transition: 'background-color 0.15s ease' } }),
  },
  activeNavItem: {
    backgroundColor: colors.sidebarActive,
  },
  navIcon: {
    width: 24,
    marginRight: 12,
    alignItems: 'center',
  },
  navText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  activeNavText: {
    fontWeight: '600',
    color: '#fff',
  },
  sidebarBottom: {
    marginTop: 'auto',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({ web: { cursor: 'pointer' } }),
  },
  mainContent: {
    flex: 1,
    flexDirection: 'column',
    minWidth: 0,
  },
  headerMobile: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 28,
    backgroundColor: colors.surface,
    borderBottomWidth: 3,
    borderBottomColor: colors.accent,
    ...Platform.select({ web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } }),
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerTitleMobile: {
    fontSize: 18,
  },
  contentContainer: {
    padding: 28,
  },
  contentContainerMobile: {
    padding: 16,
    paddingBottom: 32,
  },
  mainScroll: {
    flex: 1,
    minHeight: 0,
  },
  mainScrollMobile: {
    ...Platform.select({
      web: {
        flexGrow: 1,
        minHeight: 400 as any,
      },
    }),
  },
});
