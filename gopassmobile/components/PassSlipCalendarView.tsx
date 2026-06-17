import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { FontAwesome } from '@expo/vector-icons';
import { formatManilaDateYmd, formatManilaDayLabel } from '../utils/manilaDate';
import {
  bucketSubmissionsByDay,
  buildMarkedDates,
  CalendarEvent,
  CalendarSubmissionLike,
  getCalendarStatusLegend,
} from '../utils/passSlipCalendarEvents';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
};

type PassSlipCalendarViewProps = {
  submissions: CalendarSubmissionLike[];
  onSelectSubmission: (submission: CalendarSubmissionLike) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentPaddingBottom?: number;
};

export default function PassSlipCalendarView({
  submissions,
  onSelectSubmission,
  onRefresh,
  refreshing = false,
  contentPaddingBottom = 20,
}: PassSlipCalendarViewProps) {
  const todayYmd = formatManilaDateYmd(new Date());
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);
  const [visibleMonth, setVisibleMonth] = useState(todayYmd.slice(0, 7));

  const eventsByDay = useMemo(() => bucketSubmissionsByDay(submissions), [submissions]);
  const markedDates = useMemo(
    () => buildMarkedDates(eventsByDay, selectedYmd),
    [eventsByDay, selectedYmd],
  );
  const selectedEvents = eventsByDay.get(selectedYmd) ?? [];
  const legend = getCalendarStatusLegend();

  const handleEventPress = (event: CalendarEvent) => {
    onSelectSubmission(event.raw);
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: contentPaddingBottom }]}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.calendarCard}>
        <Calendar
          current={visibleMonth}
          onMonthChange={(month) => setVisibleMonth(`${month.year}-${String(month.month).padStart(2, '0')}`)}
          onDayPress={(day) => setSelectedYmd(day.dateString)}
          markedDates={markedDates}
          enableSwipeMonths
          theme={{
            backgroundColor: theme.surface,
            calendarBackground: theme.surface,
            textSectionTitleColor: theme.textMuted,
            selectedDayBackgroundColor: theme.primary,
            selectedDayTextColor: '#ffffff',
            todayTextColor: theme.primary,
            dayTextColor: theme.text,
            textDisabledColor: 'rgba(1,26,107,0.25)',
            monthTextColor: theme.primary,
            arrowColor: theme.primary,
            textDayFontWeight: '500',
            textMonthFontWeight: '700',
            textDayHeaderFontWeight: '600',
            textDayFontSize: 15,
            textMonthFontSize: 18,
            textDayHeaderFontSize: 12,
          }}
          style={styles.calendar}
        />
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>{formatManilaDayLabel(selectedYmd)}</Text>
        {selectedEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="calendar-o" size={28} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <Text style={styles.emptyText}>Your pass slips and travel orders will appear here.</Text>
          </View>
        ) : (
          selectedEvents.map((event) => (
            <Pressable
              key={event.id}
              style={({ pressed }) => [styles.eventCard, pressed && styles.eventCardPressed]}
              onPress={() => handleEventPress(event)}
            >
              <View style={styles.eventHeader}>
                <View style={[styles.kindBadge, event.kind === 'travel-order' ? styles.travelBadge : styles.slipBadge]}>
                  <Text style={styles.kindBadgeText}>
                    {event.kind === 'travel-order' ? 'Travel Order' : 'Pass Slip'}
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: event.color }]} />
              </View>
              {event.timeLabel ? <Text style={styles.eventTime}>{event.timeLabel}</Text> : null}
              {event.subtitle ? <Text style={styles.eventSubtitle}>{event.subtitle}</Text> : null}
              <Text style={styles.eventStatus}>{event.status}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.legendCard}>
        <Text style={styles.legendTitle}>Status legend</Text>
        <View style={styles.legendRow}>
          {legend.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 16,
  },
  calendarCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    shadowColor: '#011a6b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  calendar: {
    borderRadius: 16,
  },
  detailCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    gap: 12,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
  },
  eventCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 6,
    backgroundColor: '#fafbff',
  },
  eventCardPressed: {
    backgroundColor: '#f0f3ff',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kindBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  slipBadge: {
    backgroundColor: 'rgba(1,26,107,0.1)',
  },
  travelBadge: {
    backgroundColor: 'rgba(254,206,0,0.25)',
  },
  kindBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.primary,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  eventTime: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  eventSubtitle: {
    fontSize: 14,
    color: theme.textMuted,
  },
  eventStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(1,26,107,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  emptyText: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
  },
  legendCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 10,
    marginBottom: 8,
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.text,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: theme.textMuted,
  },
});
