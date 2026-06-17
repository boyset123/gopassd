import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { formatManilaDayLabel, formatManilaMonthYear } from '../utils/manilaDate';
import {
  bucketSubmissionsByDay,
  buildMonthGrid,
  CalendarEvent,
  CalendarSubmissionLike,
  getCalendarStatusLegend,
  getManilaMonthFromDate,
  getTodayYmd,
} from '../utils/passSlipCalendarEvents';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const initialMonth = getManilaMonthFromDate(new Date());
  const [year, setYear] = useState(initialMonth.year);
  const [monthIndex, setMonthIndex] = useState(initialMonth.monthIndex);
  const [selectedYmd, setSelectedYmd] = useState(getTodayYmd());

  const todayYmd = getTodayYmd();
  const eventsByDay = useMemo(() => bucketSubmissionsByDay(submissions), [submissions]);
  const monthGrid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);
  const selectedEvents = eventsByDay.get(selectedYmd) ?? [];
  const legend = getCalendarStatusLegend();

  const goToPreviousMonth = () => {
    if (monthIndex === 0) {
      setYear((value) => value - 1);
      setMonthIndex(11);
      return;
    }
    setMonthIndex((value) => value - 1);
  };

  const goToNextMonth = () => {
    if (monthIndex === 11) {
      setYear((value) => value + 1);
      setMonthIndex(0);
      return;
    }
    setMonthIndex((value) => value + 1);
  };

  const handleEventPress = (event: CalendarEvent) => {
    onSelectSubmission(event.raw);
  };

  const renderDayCell = (ymd: string | null, index: number) => {
    if (!ymd) {
      return <View key={`empty-${index}`} style={[styles.dayCell, styles.dayCellOutside]} />;
    }

    const dayNumber = parseInt(ymd.split('-')[2], 10);
    const events = eventsByDay.get(ymd) ?? [];
    const isToday = ymd === todayYmd;
    const isSelected = ymd === selectedYmd;
    const visibleDots = events.slice(0, 3);
    const overflow = events.length - visibleDots.length;

    return (
      <Pressable
        key={ymd}
        style={({ pressed }) => [
          styles.dayCell,
          isToday && styles.dayCellToday,
          isSelected && styles.dayCellSelected,
          pressed && styles.dayCellPressed,
        ]}
        onPress={() => setSelectedYmd(ymd)}
      >
        <Text
          style={[
            styles.dayNumber,
            isToday && styles.dayNumberToday,
            isSelected && styles.dayNumberSelected,
          ]}
        >
          {dayNumber}
        </Text>
        <View style={styles.dotsRow}>
          {visibleDots.map((event) => (
            <View key={event.id} style={[styles.eventDot, { backgroundColor: event.color }]} />
          ))}
        </View>
        {overflow > 0 ? <Text style={styles.overflowText}>+{overflow}</Text> : null}
      </Pressable>
    );
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
        <View style={styles.monthNav}>
          <Pressable
            style={({ pressed }) => [styles.monthNavButton, pressed && styles.monthNavButtonPressed]}
            onPress={goToPreviousMonth}
            accessibilityLabel="Previous month"
          >
            <FontAwesome name="chevron-left" size={14} color={theme.primary} />
          </Pressable>
          <Text style={styles.monthLabel}>{formatManilaMonthYear(year, monthIndex)}</Text>
          <Pressable
            style={({ pressed }) => [styles.monthNavButton, pressed && styles.monthNavButtonPressed]}
            onPress={goToNextMonth}
            accessibilityLabel="Next month"
          >
            <FontAwesome name="chevron-right" size={14} color={theme.primary} />
          </Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((day) => (
            <View key={day} style={styles.weekdayCell}>
              <Text style={styles.weekdayText}>{day}</Text>
            </View>
          ))}
        </View>

        {monthGrid.map((week, weekIndex) => (
          <View key={`week-${weekIndex}`} style={styles.weekRow}>
            {week.map((ymd, dayIndex) => renderDayCell(ymd, weekIndex * 7 + dayIndex))}
          </View>
        ))}
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
    padding: 12,
    gap: 4,
    shadowColor: '#011a6b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  monthNavButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  monthNavButtonPressed: {
    backgroundColor: '#f0f3ff',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.primary,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.08)',
    padding: 4,
    alignItems: 'center',
    backgroundColor: theme.surface,
  },
  dayCellOutside: {
    backgroundColor: '#fafbff',
  },
  dayCellToday: {
    borderColor: theme.primary,
    backgroundColor: '#f8faff',
  },
  dayCellSelected: {
    borderColor: theme.primary,
    backgroundColor: '#eef2ff',
  },
  dayCellPressed: {
    backgroundColor: '#f0f3ff',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  dayNumberToday: {
    color: theme.primary,
  },
  dayNumberSelected: {
    color: theme.primary,
  },
  dotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 3,
    marginTop: 4,
    minHeight: 8,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overflowText: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.textMuted,
    marginTop: 2,
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
