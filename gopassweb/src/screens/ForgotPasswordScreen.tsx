import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform, Modal, ImageBackground, ActivityIndicator } from 'react-native';
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
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [isModalError, setIsModalError] = useState(false);

  const openResultModal = (title: string, message: string, error: boolean) => {
    setModalTitle(title);
    setModalMessage(message);
    setIsModalError(error);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      openResultModal('Missing Email', 'Please enter your email address before requesting a reset link.', true);
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/users/forgot-password`, { email: normalizedEmail });
      openResultModal(
        'Reset Link Sent',
        'A password reset link has been sent to your registered email.',
        false
      );
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        openResultModal(
          'Email Not Registered',
          'This email is not registered in the system. Please check the address or contact the administrator.',
          true
        );
      } else {
        const message =
          error?.response?.data?.message ||
          'Unable to send reset link right now. Please try again.';
        openResultModal('Request Failed', message, true);
      }
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

      <Modal
        animationType="fade"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, isModalError ? styles.modalTitleError : styles.modalTitleSuccess]}>
              {modalTitle}
            </Text>
            <Text style={styles.modalMessage}>{modalMessage}</Text>

            {!isModalError ? (
              <View style={styles.infoBlock}>
                <Text style={styles.infoText}>- Check your inbox and spam/junk folder.</Text>
                <Text style={styles.infoText}>- The reset link expires in 1 hour.</Text>
                <Text style={styles.infoText}>- Use the latest email if you requested multiple times.</Text>
              </View>
            ) : (
              <View style={styles.infoBlock}>
                <Text style={styles.infoText}>- Confirm the email format is correct.</Text>
                <Text style={styles.infoText}>- Make sure your internet connection is stable.</Text>
                <Text style={styles.infoText}>- Try again in a few moments.</Text>
              </View>
            )}

            <View style={styles.modalButtonRow}>
              {!isModalError ? (
                <Pressable
                  style={[styles.modalButton, styles.modalSecondaryButton]}
                  onPress={() => {
                    setModalVisible(false);
                    navigation.goBack();
                  }}
                >
                  <Text style={styles.modalSecondaryButtonText}>Back to Login</Text>
                </Pressable>
              ) : null}

              <Pressable
                style={[styles.modalButton, isModalError ? styles.modalErrorButton : styles.modalSuccessButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>{isModalError ? 'Try Again' : 'Okay'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  modalTitleSuccess: {
    color: '#065f46',
  },
  modalTitleError: {
    color: '#b91c1c',
  },
  modalMessage: {
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 22,
  },
  infoBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 19,
  },
  modalButtonRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  modalButton: {
    minWidth: 112,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalSuccessButton: {
    backgroundColor: '#065f46',
  },
  modalErrorButton: {
    backgroundColor: '#b91c1c',
  },
  modalSecondaryButton: {
    backgroundColor: '#e5e7eb',
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalSecondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ForgotPasswordScreen;
