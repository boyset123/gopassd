import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

const UPLOAD_ACCENT = '#4f46e5';

export function supportingFileTypeBadge(
  contentType: string | undefined,
  name: string | undefined
): { label: string; color: string } {
  const mt = (contentType || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (mt.includes('pdf') || n.endsWith('.pdf')) return { label: 'PDF', color: '#dc2626' };
  if (n.endsWith('.docx') || mt.includes('wordprocessingml')) return { label: 'DOC', color: '#2563eb' };
  if (mt.includes('png') || n.endsWith('.png')) return { label: 'PNG', color: '#0d9488' };
  if (mt.includes('gif') || n.endsWith('.gif')) return { label: 'GIF', color: '#7c3aed' };
  if (mt.includes('webp') || n.endsWith('.webp')) return { label: 'WEBP', color: '#0284c7' };
  if (mt.includes('jpeg') || mt.includes('jpg') || n.endsWith('.jpg') || n.endsWith('.jpeg')) {
    return { label: 'JPG', color: UPLOAD_ACCENT };
  }
  return { label: 'FILE', color: '#64748b' };
}

export type SupportingAttachmentFileCardProps = {
  name: string;
  contentType?: string;
  /** Muted line under the filename (e.g. “PDF document”). */
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
};

export default function SupportingAttachmentFileCard({
  name,
  contentType,
  subtitle,
  onPress,
  disabled = false,
  loading = false,
  compact = false,
}: SupportingAttachmentFileCardProps) {
  const badge = supportingFileTypeBadge(contentType, name);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        (pressed || loading) && !(disabled && !loading) && styles.cardPressed,
        disabled && !loading && styles.cardDisabled,
      ]}
    >
      <View style={styles.body}>
        <View style={[styles.iconBlock, compact && styles.iconBlockCompact]}>
          <FontAwesome name="file-o" size={compact ? 22 : 26} color="#64748b" />
          <View style={[styles.badge, { backgroundColor: badge.color }]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
            {name}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, compact && styles.subtitleCompact]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={UPLOAD_ACCENT} style={styles.spinner} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 12,
  },
  cardCompact: {
    marginBottom: 6,
    padding: 10,
  },
  cardPressed: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
  },
  cardDisabled: {
    opacity: 0.55,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconBlock: {
    marginRight: 12,
    position: 'relative',
    width: 40,
    alignItems: 'center',
  },
  iconBlockCompact: {
    marginRight: 10,
    width: 36,
  },
  badge: {
    position: 'absolute',
    bottom: -4,
    left: -2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  meta: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 20,
  },
  titleCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
  },
  subtitleCompact: {
    marginTop: 2,
    fontSize: 11,
  },
  spinner: {
    marginLeft: 8,
    alignSelf: 'center',
  },
});
