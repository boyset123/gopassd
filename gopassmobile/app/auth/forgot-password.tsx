import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ImageBackground, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState('');
  const router = useRouter();

  const handlePasswordReset = () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    // TODO: Implement password reset logic
    Alert.alert('Success', 'If an account with that email exists, a password reset link has been sent.');
    router.back();
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
            <Pressable style={styles.button} onPress={handlePasswordReset}>
              <Text style={styles.buttonText}>Send Reset Link</Text>
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
