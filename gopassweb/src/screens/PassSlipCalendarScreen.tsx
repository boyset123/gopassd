import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import {
  formatManilaDayLabel,
  formatManilaMonthYear,
  getManilaMonthBounds,
} from '../utils/manilaDate';
import {
  bucketPassSlipsByDay,
  buildMonthGrid,
  CalendarPassSlipLike,
  getCalendarStatusLegend,
  getManilaMonthFromDate,
  getTodayYmd,
} from '../utils/passSlipCalendarEvents';
import { calendarStyles, webFilterSelectStyle } from './PassSlipCalendarScreen.styles';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_OPTIONS = ['All', 'Pending', 'Recommended', 'Approved', 'Verified', 'Returned', 'Completed', 'Rejected', 'Cancelled', 'Expired'];

type PassSlipCalendarScreenProps = {
  campuses: string[];
  faculties: string[];
  campusFilter: string;
  facultyFilter: string;
  onCampusFilterChange: (value: string) => void;
  onFacultyFilterChange: (value: string) => void;
  onSelectSlip: (slip: CalendarPassSlipLike) => void;
  refreshKey?: number;
};

export default function PassSlipCalendarScreen({
  campuses,
  faculties,
  campusFilter,
  facultyFilter,
  onCampusFilterChange,
  onFacultyFilterChange,
  onSelectSlip,
  refreshKey = 0,
}: PassSlipCalendarScreenProps) {
  const { isNarrow } = useResponsiveLayout();
  const initialMonth = getManilaMonthFromDate(new Date());
  const [year, setYear] = useState(initialMonth.year);
  const [monthIndex, setMonthIndex] = useState(initialMonth.monthIndex);
  const [statusFilter, setStatusFilter] = useState('All');
  const [slips, setSlips] = useState<CalendarPassSlipLike[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYmd, setSelectedYmd] = useState(getTodayYmd());

  const monthBounds = useMemo(() => getManilaMonthBounds(year, monthIndex), [year, monthIndex]);
  const eventsByDay = useMemo(() => bucketPassSlipsByDay(slips), [slips]);
  const monthGrid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);
  const todayYmd = getTodayYmd();
  const selectedEvents = eventsByDay.get(selectedYmd) ?? [];
  const legend = getCalendarStatusLegend();

  const fetchCalendar = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'x-auth-token': token };
      const params: Record<string, string> = {
        from: monthBounds.from,
        to: monthBounds.to,
      };
      if (campusFilter && campusFilter !== 'All Campuses') params.campus = campusFilter;
      if (facultyFilter && facultyFilter !== 'All Faculties') params.faculty = facultyFilter;
      if (statusFilter !== 'All') params.status = statusFilter;

      const response = await axios.get<CalendarPassSlipLike[]>(`${API_URL}/pass-slips/calendar`, {
        headers,
        params,
      });
      setSlips(response.data || []);
    } catch (err) {
      console.error('Failed to fetch calendar pass slips', err);
      setError('Failed to load calendar data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [monthBounds.from, monthBounds.to, campusFilter, facultyFilter, statusFilter]);

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar, refreshKey]);

  const goToPreviousMonth = () => {
    if (monthIndex === 0) {
      setYear((value: number) => value - 1);
      setMonthIndex(11);
      return;
    }
    setMonthIndex((value: number) => value - 1);
  };

  const goToNextMonth = () => {
    if (monthIndex === 11) {
      setYear((value: number) => value + 1);
      setMonthIndex(0);
      return;
    }
    setMonthIndex((value: number) => value + 1);
  };

  const renderDayCell = (ymd: string | null, index: number) => {
    if (!ymd) {
      return <View key={`empty-${index}`} style={[calendarStyles.dayCell, calendarStyles.dayCellOutside]} />;
    }

    const dayNumber = parseInt(ymd.split('-')[2], 10);
    const events = eventsByDay.get(ymd) ?? [];
    const isToday = ymd === todayYmd;
    const isSelected = ymd === selectedYmd;
    const visibleEvents = events.slice(0, 3);
    const overflow = events.length - visibleEvents.length;

    return (
      <Pressable
        key={ymd}
        style={({ pressed }) => [
          calendarStyles.dayCell,
          isToday && calendarStyles.dayCellToday,
          isSelected && calendarStyles.dayCellSelected,
          pressed && calendarStyles.dayCellPressed,
        ]}
        onPress={() => setSelectedYmd(ymd)}
      >
        <Text
          style={[
            calendarStyles.dayNumber,
            isToday && calendarStyles.dayNumberToday,
            isSelected && calendarStyles.dayNumberSelected,
          ]}
        >
          {dayNumber}
        </Text>
        {visibleEvents.map((event) => (
          <View key={event.id} style={[calendarStyles.eventChip, { backgroundColor: event.color }]}>
            <Text style={calendarStyles.eventChipText} numberOfLines={1}>
              {event.title}
            </Text>
          </View>
        ))}
        {overflow > 0 ? <Text style={calendarStyles.overflowBadge}>+{overflow} more</Text> : null}
      </Pressable>
    );
  };

  const detailPanel = (
    <View style={calendarStyles.detailCard}>
      <Text style={calendarStyles.detailTitle}>{formatManilaDayLabel(selectedYmd)}</Text>
      {selectedEvents.length === 0 ? (
        <View style={calendarStyles.emptyWrap}>
          <FontAwesome name="calendar-o" size={28} color="#98A2B3" />
          <Text style={calendarStyles.emptyTitle}>No pass slips scheduled</Text>
          <Text style={calendarStyles.emptyText}>Select another day or adjust your filters.</Text>
        </View>
      ) : (
        selectedEvents.map((event) => (
          <Pressable
            key={event.id}
            style={({ pressed }) => [calendarStyles.eventRow, pressed && calendarStyles.eventRowPressed]}
            onPress={() => onSelectSlip(event.raw)}
          >
            <View style={calendarStyles.eventRowHeader}>
              <View style={[calendarStyles.eventDot, { backgroundColor: event.color }]} />
              <Text style={calendarStyles.eventName}>{event.title}</Text>
              <Text style={calendarStyles.eventStatus}>{event.status}</Text>
            </View>
            {event.timeLabel ? <Text style={calendarStyles.eventMeta}>{event.timeLabel}</Text> : null}
            {event.subtitle ? <Text style={calendarStyles.eventMeta}>Destination: {event.subtitle}</Text> : null}
            {event.raw.trackingNo ? (
              <Text style={calendarStyles.eventMeta}>Tracking No: {event.raw.trackingNo}</Text>
            ) : null}
          </Pressable>
        ))
      )}
    </View>
  );

  return (
    <View style={calendarStyles.container}>
      <View style={calendarStyles.headerCard}>
        <View>
          <Text style={calendarStyles.title}>Pass Slip Calendar</Text>
          <Text style={calendarStyles.subtitle}>
            View all employee pass slip schedules across the organization.
          </Text>
        </View>

        <View style={calendarStyles.headerRow}>
          <View style={calendarStyles.monthNav}>
            <Pressable
              style={({ pressed }) => [calendarStyles.monthNavButton, pressed && calendarStyles.monthNavButtonPressed]}
              onPress={goToPreviousMonth}
              accessibilityLabel="Previous month"
            >
              <FontAwesome name="chevron-left" size={14} color="#344054" />
            </Pressable>
            <Text style={calendarStyles.monthLabel}>{formatManilaMonthYear(year, monthIndex)}</Text>
            <Pressable
              style={({ pressed }) => [calendarStyles.monthNavButton, pressed && calendarStyles.monthNavButtonPressed]}
              onPress={goToNextMonth}
              accessibilityLabel="Next month"
            >
              <FontAwesome name="chevron-right" size={14} color="#344054" />
            </Pressable>
          </View>
        </View>

        <View style={calendarStyles.filtersRow}>
          <View style={calendarStyles.filterGroup}>
            <Text style={calendarStyles.filterLabel}>Campus</Text>
            <select
              value={campusFilter}
              onChange={(e) => onCampusFilterChange(e.target.value)}
              style={webFilterSelectStyle as React.CSSProperties}
            >
              {campuses.map((campus) => (
                <option key={campus} value={campus}>{campus}</option>
              ))}
            </select>
          </View>
          <View style={calendarStyles.filterGroup}>
            <Text style={calendarStyles.filterLabel}>Faculty</Text>
            <select
              value={facultyFilter}
              onChange={(e) => onFacultyFilterChange(e.target.value)}
              style={webFilterSelectStyle as React.CSSProperties}
            >
              {faculties.map((faculty) => (
                <option key={faculty} value={faculty}>{faculty}</option>
              ))}
            </select>
          </View>
          <View style={calendarStyles.filterGroup}>
            <Text style={calendarStyles.filterLabel}>Status</Text>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={webFilterSelectStyle as React.CSSProperties}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={calendarStyles.loadingWrap}>
          <ActivityIndicator size="large" color="#011a6b" />
        </View>
      ) : error ? (
        <View style={calendarStyles.emptyWrap}>
          <Text style={calendarStyles.emptyTitle}>{error}</Text>
          <Pressable onPress={() => void fetchCalendar()}>
            <Text style={[calendarStyles.emptyText, { color: '#011a6b', fontWeight: '600' }]}>Tap to retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={isNarrow ? calendarStyles.layoutStack : calendarStyles.layoutSideBySide}>
          <View style={calendarStyles.calendarColumn}>
            <View style={calendarStyles.calendarCard}>
              <View style={calendarStyles.weekdayRow}>
                {WEEKDAYS.map((day) => (
                  <View key={day} style={calendarStyles.weekdayCell}>
                    <Text style={calendarStyles.weekdayText}>{day}</Text>
                  </View>
                ))}
              </View>
              {monthGrid.map((week, weekIndex) => (
                <View key={`week-${weekIndex}`} style={calendarStyles.weekRow}>
                  {week.map((ymd, dayIndex) => renderDayCell(ymd, weekIndex * 7 + dayIndex))}
                </View>
              ))}
            </View>
            {slips.length === 0 ? (
              <View style={calendarStyles.emptyWrap}>
                <FontAwesome name="calendar-o" size={32} color="#98A2B3" />
                <Text style={calendarStyles.emptyTitle}>No pass slips this month</Text>
                <Text style={calendarStyles.emptyText}>Try another month or clear your filters.</Text>
              </View>
            ) : null}
          </View>
          <View style={isNarrow ? undefined : calendarStyles.detailColumn}>{detailPanel}</View>
        </View>
      )}

      {isNarrow && !isLoading && !error ? detailPanel : null}

      <View style={calendarStyles.legendCard}>
        <Text style={calendarStyles.legendTitle}>Status legend</Text>
        <View style={calendarStyles.legendRow}>
          {legend.map((item) => (
            <View key={item.label} style={calendarStyles.legendItem}>
              <View style={[calendarStyles.legendDot, { backgroundColor: item.color }]} />
              <Text style={calendarStyles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
