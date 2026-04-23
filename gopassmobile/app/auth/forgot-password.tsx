import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ImageBackground, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { API_URL } from '../../config/api';

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handlePasswordReset = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/users/forgot-password`, {
        email: email.trim().toLowerCase(),
      });
      Alert.alert('Success', 'A password reset link has been sent to your registered email.');
      router.back();
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        Alert.alert(
          'Email Not Registered',
          'This email is not registered in the system. Please check the address or contact the administrator.'
        );
      } else {
        const message =
          error?.response?.data?.message ||
          'Unable to process your request right now. Please try again.';
        Alert.alert('Error', message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ImageBackground 
      source={require('../../assets/images/dorsubg3.jpg')} 
      resizeMode="cover" 
      style={styles.backgroundImage}
    >
      <View style={styles.overlay} />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoidingWrapper}>
          <View style={styles.formContainer}>
            <Text style={styles.title}>Forgot Password</Text>
            <Text style={styles.subtitle}>Enter your email to receive a reset link.</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Pressable
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handlePasswordReset}
              disabled={isSubmitting}
            >
              <Text style={styles.buttonText}>{isSubmitting ? 'Sending...' : 'Send Reset Link'}</Text>
            </Pressable>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Back to Login</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 20, 40, 0.6)',
  },
  keyboardAvoidingWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    padding: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#003366',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    width: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    height: 50,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  button: {
    width: '100%',
    borderRadius: 8,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: '#FFC107',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#003366',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backButtonText: {
    fontSize: 14,
    color: '#003366',
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '500',
  },
});

export default ForgotPasswordScreen;
