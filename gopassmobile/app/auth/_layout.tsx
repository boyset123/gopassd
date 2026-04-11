import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="forgot-password" 
        options={{
          headerShown: false,
          animation: 'none',
        }}
      />
    </Stack>
  );
}
