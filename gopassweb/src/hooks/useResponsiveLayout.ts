import { useWindowDimensions } from 'react-native';

/** Sidebar stacks / switches to top bar below this width (tablet portrait, small laptops). */
export const BREAKPOINT_SIDEBAR = 900;
/** Tighter typography and full-width cards below this width (phones). */
export const BREAKPOINT_COMPACT = 600;

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isNarrow: width < BREAKPOINT_SIDEBAR,
    isCompact: width < BREAKPOINT_COMPACT,
  };
}
