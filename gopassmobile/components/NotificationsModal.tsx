import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

export interface Notification {
  _id: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const theme = {
  primary: '#011a6b',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.65)',
  border: 'rgba(1,26,107,0.12)',
  accent: '#fece00',
  surface: '#ffffff',
  listBackground: '#eef0f6',
  danger: '#dc3545',
  success: 'rgba(1,26,107,0.06)',
};

function formatDate(dateString: string | undefined, includeTime: boolean = false): string {
  if (!dateString) return 'No Date';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  if (includeTime) {
    return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  }
  return date.toLocaleDateString();
}

function formatRelative(dateString: string | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const COLLAPSED_LINES = 2;
const PREVIEW_MAX_LENGTH = 120;

export interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  notifications: Notification[];
  onDeleteNotification: (id: string) => void;
  /** Called when the user taps a notification row (e.g. to expand). Use to mark as read on first interaction. */
  onMarkNotificationRead?: (id: string) => void;
  /** Marks every notification read (e.g. header “mark all” control). */
  onMarkAllRead?: () => void | Promise<void>;
}

export function NotificationsModal({
  visible,
  onClose,
  notifications,
  onDeleteNotification,
  onMarkNotificationRead,
  onMarkAllRead,
}: NotificationsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((n) =>
        (n.message || '').toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [notifications, searchQuery]
  );

  const toggleExpanded = useCallback((id: string) => {
    const key = String(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const renderPreview = (message: string) => {
    const trimmed = (message || '').trim() || 'No message';
    if (trimmed.length <= PREVIEW_MAX_LENGTH) return trimmed;
    return `${trimmed.slice(0, PREVIEW_MAX_LENGTH).trim()}…`;
  };

  const listScrollHeight = Math.round(Dimensions.get('window').height * 0.48);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.content}>
          <View style={styles.topBar} />
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.titleIcon}>
                <FontAwesome name="bell-o" size={20} color={theme.primary} />
              </View>
              <Text style={styles.title}>Notifications</Text>
            </View>
            <View style={styles.headerActions}>
              {onMarkAllRead != null && unreadCount > 0 ? (
                <TouchableOpacity
                  style={styles.markAllBtn}
                  onPress={() => void onMarkAllRead()}
                  activeOpacity={0.7}
                  accessibilityLabel="Mark all notifications as read"
                  accessibilityRole="button"
                >
                  <FontAwesome name="check-square-o" size={18} color={theme.primary} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
                <FontAwesome name="times" size={18} color={theme.primary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.searchContainer}>
            <View style={styles.searchWrap}>
              <FontAwesome name="search" size={16} color={theme.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search notifications..."
                placeholderTextColor={theme.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
          <ScrollView
            style={[styles.listScroll, { maxHeight: listScrollHeight }]}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {filteredNotifications.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrap}>
                  <FontAwesome name="bell-o" size={40} color={theme.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>No notifications yet</Text>
                <Text style={styles.emptySubtext}>When you get updates, they'll show up here.</Text>
              </View>
            ) : (
              filteredNotifications.map((item, index) => {
                const rowKey =
                  item._id && String(item._id).length > 0
                    ? String(item._id)
                    : `${item.createdAt || 'notification'}-${index}`;
                const isExpanded = expandedIds.has(String(item._id));
                const message =
                  item.message && item.message.trim().length > 0 ? item.message : 'No message';
                const hasMore =
                  message.length > PREVIEW_MAX_LENGTH || message.split('\n').length > COLLAPSED_LINES;
                const unread = !item.read;
                return (
                  <View
                    key={rowKey}
                    style={[
                      styles.item,
                      { borderLeftColor: unread ? theme.accent : 'transparent' },
                    ]}
                    collapsable={false}
                  >
                    <View style={[styles.unreadDot, !unread && styles.unreadDotHidden]} pointerEvents="none" />
                    <TouchableOpacity
                      style={styles.itemMain}
                      activeOpacity={0.88}
                      onPress={() => {
                        if (!item.read && onMarkNotificationRead) {
                          onMarkNotificationRead(item._id);
                        }
                        toggleExpanded(item._id);
                      }}
                    >
                      <View style={styles.itemIconWrap} collapsable={false}>
                        <FontAwesome name="bell-o" size={18} color={theme.primary} />
                      </View>
                      <View style={styles.itemBody} collapsable={false}>
                        {isExpanded ? (
                          <View>
                            <View style={styles.expandedMeta}>
                              <Text style={styles.expandedMetaLabel}>Sent</Text>
                              <Text style={styles.expandedMetaDate}>{formatDate(item.createdAt, true)}</Text>
                            </View>
                            <View style={styles.itemMessageTextWrap}>
                              <Text
                                style={[styles.itemMessage, styles.itemMessageExpanded, styles.itemMessageColor]}
                                {...(Platform.OS === 'android' ? { textBreakStrategy: 'simple' as const } : {})}
                              >
                                {message}
                              </Text>
                            </View>
                            <View style={styles.itemFooter}>
                              <View style={styles.expandCue}>
                                <Text style={styles.expandCueText}>Show less</Text>
                                <FontAwesome
                                  name="chevron-up"
                                  size={11}
                                  color={theme.primary}
                                  style={styles.expandChevron}
                                />
                              </View>
                              <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => onDeleteNotification(item._id)}
                                activeOpacity={0.7}
                              >
                                <FontAwesome name="trash-o" size={14} color={theme.danger} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <>
                            <View style={styles.itemTopRow}>
                              <View style={styles.itemMessageTextWrap}>
                                <Text
                                  style={[styles.itemMessage, styles.itemMessageColor]}
                                  numberOfLines={COLLAPSED_LINES}
                                  {...(Platform.OS === 'android' ? { textBreakStrategy: 'simple' as const } : {})}
                                >
                                  {renderPreview(message)}
                                </Text>
                              </View>
                              <View style={styles.itemTimePill}>
                                <Text style={styles.itemTimePillText}>{formatRelative(item.createdAt)}</Text>
                              </View>
                            </View>
                            <View style={styles.itemFooter}>
                              <View style={styles.expandCue}>
                                <Text style={styles.expandCueText}>
                                  {hasMore ? 'Show more' : 'Details'}
                                </Text>
                                <FontAwesome
                                  name="chevron-down"
                                  size={11}
                                  color={theme.primary}
                                  style={styles.expandChevron}
                                />
                              </View>
                              <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => onDeleteNotification(item._id)}
                                activeOpacity={0.7}
                              >
                                <FontAwesome name="trash-o" size={14} color={theme.danger} />
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: theme.listBackground,
    borderRadius: 20,
    width: '100%',
    maxHeight: '85%',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#011a6b',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },
  topBar: {
    height: 4,
    width: '100%',
    backgroundColor: theme.accent,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(1,26,107,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markAllBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(1,26,107,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(1,26,107,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: theme.surface,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(1,26,107,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.text,
  },
  listScroll: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    paddingTop: 2,
  },
  // Same dimensions for read/unread: only borderLeftColor toggles (see render).
  // overflow: hidden + rounded corners can blank Text on Android; keep visible there.
  item: {
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    overflow: Platform.OS === 'android' ? 'visible' : 'hidden',
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    left: 10,
    top: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.accent,
    zIndex: 1,
    opacity: 1,
  },
  unreadDotHidden: {
    opacity: 0,
  },
  itemMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  itemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(1,26,107,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  expandedMeta: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(1,26,107,0.08)',
  },
  expandedMetaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  expandedMetaDate: {
    fontSize: 12,
    color: theme.textMuted,
  },
  itemMessageExpanded: {
    marginBottom: 10,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  // Put flex on the wrapper, not on Text — avoids Android Text disappearing in a row.
  itemMessageTextWrap: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  itemMessage: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
  },
  itemMessageColor: {
    color: theme.text,
  },
  itemTimePill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(1,26,107,0.06)',
  },
  itemTimePillText: {
    fontSize: 11,
    color: theme.textMuted,
    fontWeight: '500',
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  itemDate: {
    flex: 1,
    fontSize: 12,
    color: theme.textMuted,
  },
  expandCue: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  expandCueText: {
    fontSize: 13,
    color: theme.primary,
    fontWeight: '600',
    marginRight: 2,
  },
  expandChevron: {
    marginLeft: 1,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(220,53,69,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(1,26,107,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
  },
});
