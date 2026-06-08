import { View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = ViewProps & { basePadding?: number };

export function ModalActionFooter({ style, basePadding = 12, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[{ paddingBottom: (insets.bottom || 0) + basePadding }, style]}
      {...rest}
    />
  );
}
