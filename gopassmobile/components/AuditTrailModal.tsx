import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ModalActionFooter } from './ModalActionFooter';
import { AuditTrailEvent, formatAuditDate, formatAuditTime } from '../utils/auditTrail';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
};

interface AuditTrailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  events: AuditTrailEvent[];
  loading?: boolean;
}

export function AuditTrailModal({
  visible,
  onClose,
  title,
  events,
  loading = false,
}: AuditTrailModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <FontAwesome name="history" size={18} color={theme.primary} />
              <Text style={styles.title}>{title}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <FontAwesome name="close" size={22} color={theme.primary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {events.length === 0 ? (
                <Text style={styles.emptyText}>No audit events recorded yet.</Text>
              ) : (
                events.map((event, index) => (
                  <View key={`${event.action}-${event.timestamp}-${index}`} style={styles.eventRow}>
                    <View style={styles.timelineCol}>
                      <View style={[styles.dot, index === events.length - 1 && styles.dotLatest]} />
                      {index < events.length - 1 ? <View style={styles.line} /> : null}
                    </View>
                    <View style={styles.eventBody}>
                      <Text style={styles.eventLabel}>{event.label}</Text>
                      {event.performedByName ? (
                        <Text style={styles.eventActor}>
                          {event.performedByName}
                          {event.role ? ` · ${event.role}` : ''}
                        </Text>
                      ) : null}
                      <Text style={styles.eventWhen}>
                        {formatAuditDate(event.timestamp)} · {formatAuditTime(event.timestamp)}
                      </Text>
                      {event.details ? (
                        <Text style={styles.eventDetails}>{event.details}</Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          <ModalActionFooter>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </ModalActionFooter>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: theme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 4,
    borderTopColor: theme.accent,
    ...Platform.select({ ios: { shadowOpacity: 0.15, shadowRadius: 12 }, android: { elevation: 8 } }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    flexShrink: 1,
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 8,
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 24,
  },
  eventRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  timelineCol: {
    width: 24,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.primary,
    marginTop: 4,
  },
  dotLatest: {
    backgroundColor: theme.accent,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: theme.border,
    marginTop: 4,
    minHeight: 24,
  },
  eventBody: {
    flex: 1,
    paddingBottom: 18,
    paddingLeft: 8,
  },
  eventLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 4,
  },
  eventActor: {
    fontSize: 13,
    color: theme.text,
    marginBottom: 2,
  },
  eventWhen: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 4,
  },
  eventDetails: {
    fontSize: 13,
    color: theme.text,
    fontStyle: 'italic',
  },
  closeBtn: {
    flex: 1,
    backgroundColor: theme.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
