import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import ReCAPTCHA from 'react-google-recaptcha';

type Props = {
  siteKey: string;
  onVerify: (token: string | null) => void;
};

export default function LoginRecaptcha({ siteKey, onVerify }: Props) {
  const onChange = useCallback(
    (token: string | null) => {
      onVerify(token);
    },
    [onVerify]
  );

  return (
    <View style={styles.wrap}>
      <ReCAPTCHA sitekey={siteKey} onChange={onChange} theme="light" size="normal" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
});
