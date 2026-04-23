import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform, Alert, ImageBackground, ActivityIndicator } from 'react-native';
import axios from 'axios';
import { StackNavigationProp } from '@react-navigation/stack';
import { API_URL } from '../config/api';

const image = require('../../assets/dorsubg3.jpg');

type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
};

type ForgotPasswordNavigationProp = StackNavigationProp<RootStackParamList, 'ForgotPassword'>;

interface Props {
  navigation: ForgotPasswordNavigationProp;
}

const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/users/forgot-password`, { email: normalizedEmail });
      Alert.alert('Success', 'If an account with that email exists, a password reset link has been sent.');
      navigation.goBack();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        'Unable to send reset link right now. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ImageBackground source={image} resizeMode="cover" style={styles.backgroundImage}>
      <View style={styles.overlay} />
      <View style={styles.centeredContainer}>
        <View style={styles.formCard}>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>Enter your email and we will send a password reset link.</Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Email address"
            placeholderTextColor="#6b7280"
            editable={!isSubmitting}
          />

          <Pressable
            style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Send Reset Link</Text>
            )}
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()} disabled={isSubmitting}>
            <Text style={styles.secondaryButtonText}>Back to Login</Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(1, 26, 107, 0.55)',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  formCard: {
    width: '92%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 28,
    borderTopWidth: 4,
    borderTopColor: '#fece00',
    ...Platform.select({
      web: {
        boxShadow: '0 18px 40px rgba(1, 26, 107, 0.2), 0 0 0 1px rgba(1, 26, 107, 0.08)',
      },
    }),
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#011a6b',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 22,
  },
  input: {
    height: 50,
    borderWidth: 2,
    borderColor: 'rgba(1, 26, 107, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#011a6b',
    fontSize: 15,
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#011a6b',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#011a6b',
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;
