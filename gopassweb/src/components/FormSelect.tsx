import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';

const theme = {
  primary: '#011a6b',
  border: 'rgba(1,26,107,0.22)',
  textMuted: 'rgba(1,26,107,0.65)',
};

export interface FormSelectOption {
  label: string;
  value: string;
}

interface FormSelectProps {
  label?: string;
  value: string;
  options: FormSelectOption[] | string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: object;
  testID?: string;
}

function normalizeOptions(options: FormSelectOption[] | string[]): FormSelectOption[] {
  if (!options.length) return [];
  if (typeof options[0] === 'string') {
    return (options as string[]).map((o) => ({ label: o, value: o }));
  }
  return options as FormSelectOption[];
}

const webSelectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  backgroundColor: '#fff',
  color: theme.primary,
  cursor: 'pointer',
};

const FormSelect: React.FC<FormSelectProps> = ({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  style,
  testID,
}) => {
  const normalized = normalizeOptions(options);

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {Platform.OS === 'web' ? (
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={webSelectStyle}
          data-testid={testID}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {normalized.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <View style={[styles.pickerContainer, disabled && styles.pickerDisabled]}>
          <Picker
            enabled={!disabled}
            selectedValue={value}
            onValueChange={onChange}
            style={styles.picker}
            testID={testID}
          >
            {placeholder ? <Picker.Item label={placeholder} value="" enabled={false} /> : null}
            {normalized.map((opt) => (
              <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
            ))}
          </Picker>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
    marginBottom: 6,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  pickerDisabled: {
    opacity: 0.6,
  },
  picker: {
    height: 44,
    width: '100%',
  },
});

export default FormSelect;
