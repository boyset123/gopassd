import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, useWindowDimensions, Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';

type Employee = {
  _id?: string;
  name?: string;
  campus?: string;
  // In UI we show "Faculty"; backend may use `department` in some datasets.
  faculty?: string;
  department?: string;
};

type PassSlipLike = {
  _id: string;
  employee: Employee;
  date?: string;
  destination?: string;
  status?: string;
  arrivalStatus?: string;
  trackingNo?: string;
};

type TravelOrderLike = {
  _id: string;
  employee: Employee;
  date?: string;
  to?: string;
  status?: string;
  arrivalStatus?: string;
  travelOrderNo?: string;
};

export type RecordLike = PassSlipLike | TravelOrderLike;

export type HrpReportsAnalyticsProps = {
  records: RecordLike[];
};

const normalizeText = (value?: string) => (value || '').trim().toLowerCase();

type Filters = {
  campus: string;
  office: string;
  userId: string; // stores employee._id
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
};

const defaultFilters: Filters = {
  campus: 'All Campuses',
  office: 'All Faculties',
  userId: 'All Users',
  fromDate: '',
  toDate: '',
};

const safeParseDateMs = (d?: string) => {
  if (!d) return null;
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return 'No Date';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return 'Invalid Date';
  return d.toLocaleDateString();
};

// Stable date format for CSV/Excel exports.
const formatCsvDate = (dateString?: string) => {
  if (!dateString) return 'No Date';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return 'Invalid Date';
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

// Keep dates as plain text in Excel CSV import/open.
// This avoids "#######" rendering in narrow columns caused by Excel date formatting.
const formatExcelCsvDateText = (dateString?: string) => {
  const value = formatCsvDate(dateString);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `'${value}`;
  return value;
};

const getRecordTypeLabel = (r: RecordLike) => ('destination' in r && r.destination ? 'Pass Slip' : 'Travel Order');

/** Pass slip uses `trackingNo`; travel order uses `travelOrderNo`. */
const getTrackingNo = (r: RecordLike) => {
  if ('destination' in r) return (r as PassSlipLike).trackingNo || '—';
  return (r as TravelOrderLike).travelOrderNo || '—';
};

const escapeCsv = (value: string) => {
  const v = value ?? '';
  const needsQuotes = /[",\n]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

/** Polar coords: 0° = top, clockwise (for SVG donut arcs). */
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180 - Math.PI / 2;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const donutSlicePath = (cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) => {
  const sweep = endDeg - startDeg;
  const large = sweep > 180 ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startDeg);
  const p2 = polar(cx, cy, rOuter, endDeg);
  const p3 = polar(cx, cy, rInner, endDeg);
  const p4 = polar(cx, cy, rInner, startDeg);
  return `M${p1.x} ${p1.y} A${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y} L${p3.x} ${p3.y} A${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
};

type DonutSeg = { value: number; color: string; label: string };

const DonutChart = ({ size, segments }: { size: number; segments: DonutSeg[] }) => {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.38;
  const rInner = size * 0.22;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const strokeW = rOuter - rInner;
  const rMid = (rOuter + rInner) / 2;

  if (total <= 0) {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={cx} cy={cy} r={rMid} fill="none" stroke="#e2e8f0" strokeWidth={strokeW} />
      </Svg>
    );
  }

  const positive = segments.filter((s) => s.value > 0);
  let angle = 0;
  const paths: React.ReactNode[] = [];

  if (positive.length === 1) {
    const s = positive[0];
    paths.push(<Path key="full-a" d={donutSlicePath(cx, cy, rOuter, rInner, 0, 180)} fill={s.color} />);
    paths.push(<Path key="full-b" d={donutSlicePath(cx, cy, rOuter, rInner, 180, 360)} fill={s.color} />);
  } else {
    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const sweep = (seg.value / total) * 360;
      const start = angle;
      const end = start + (sweep >= 359.99 ? 359.99 : sweep);
      paths.push(<Path key={seg.label} d={donutSlicePath(cx, cy, rOuter, rInner, start, end)} fill={seg.color} />);
      angle += sweep;
    }
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
    </Svg>
  );
};

const HrpReportsAnalytics = ({ records }: HrpReportsAnalyticsProps) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [filtersDraft, setFiltersDraft] = useState<Filters>(defaultFilters);
  const [filtersApplied, setFiltersApplied] = useState<Filters>(defaultFilters);
  const [filterActionMessage, setFilterActionMessage] = useState<string>('');

  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  const isVeryNarrow = width < 640;

  // IMPORTANT:
  // `select`/`input[type="date"]` are DOM elements on web.
  // Passing `style={[...]}`
  // can crash react-native-web with: "Failed to set an indexed property [0] on CSSStyleDeclaration".
  // Flatten to a single object for DOM style props.
  const selectStyle = StyleSheet.flatten([styles.select, isNarrow && styles.selectNarrow]) as any;
  const dateInputStyle = StyleSheet.flatten([styles.dateInput, isNarrow && styles.dateInputNarrow]) as any;

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const role = await AsyncStorage.getItem('userRole');
        const authorized = role === 'Human Resource Personnel';
        setIsAuthorized(authorized);
        setAuthError(authorized ? null : 'You are not authorized to view HR analytics.');
      } catch {
        setIsAuthorized(false);
        setAuthError('Unable to verify authorization.');
      } finally {
        setAuthChecked(true);
      }
    };
    checkAuth();
  }, []);

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      const id = r.employee?._id;
      const name = r.employee?.name;
      if (!id || !name) continue;
      map.set(id, name);
    }
    const arr = Array.from(map.entries()).map(([userId, label]) => ({ userId, label }));
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [records]);

  const campusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      const campusValue = (r.employee?.campus || '').trim();
      if (campusValue) set.add(campusValue);
    }
    const arr = Array.from(set.values()).sort((a, b) => a.localeCompare(b));
    return arr;
  }, [records]);

  const officeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      const facultyValue = (r.employee?.faculty || r.employee?.department || '').trim();
      if (facultyValue) set.add(facultyValue);
    }
    const arr = Array.from(set.values()).sort((a, b) => a.localeCompare(b));
    return arr;
  }, [records]);

  const appliedFilteredRecords = useMemo(() => {
    const { campus, office, userId, fromDate, toDate } = filtersApplied;

    const fromMs = safeParseDateMs(fromDate ? `${fromDate}T00:00:00` : undefined);
    // inclusive end date (set to next day start - 1ms)
    const toMs = safeParseDateMs(toDate ? `${toDate}T23:59:59` : undefined);

    return records.filter((r) => {
      const recordType = getRecordTypeLabel(r);
      void recordType;

      const campusValue = (r.employee?.campus || '').trim();
      if (campus !== 'All Campuses' && normalizeText(campusValue) !== normalizeText(campus)) return false;

      const officeValue = (r.employee?.faculty || r.employee?.department || '').trim();
      if (office !== 'All Faculties' && normalizeText(officeValue) !== normalizeText(office)) return false;

      const rid = r.employee?._id;
      if (userId !== 'All Users' && rid !== userId) return false;

      if (fromMs != null || toMs != null) {
        const recordMs = safeParseDateMs(r.date);
        if (recordMs == null) return false;
        if (fromMs != null && recordMs < fromMs) return false;
        if (toMs != null && recordMs > toMs) return false;
      }

      return true;
    });
  }, [records, filtersApplied]);

  const kpis = useMemo(() => {
    const total = appliedFilteredRecords.length;
    const passSlips = appliedFilteredRecords.filter((r) => getRecordTypeLabel(r) === 'Pass Slip').length;
    const travelOrders = total - passSlips;

    const onTime = appliedFilteredRecords.filter((r) => (r.arrivalStatus || '').toLowerCase().includes('on time')).length;
    const overdue = appliedFilteredRecords.filter((r) => (r.arrivalStatus || '').toLowerCase().includes('overdue')).length;
    const arrivalOther = Math.max(0, total - onTime - overdue);

    return { total, passSlips, travelOrders, onTime, overdue, arrivalOther };
  }, [appliedFilteredRecords]);

  const recordsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of appliedFilteredRecords) {
      const key = formatCsvDate(r.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [appliedFilteredRecords]);

  const maxDayCount = useMemo(() => Math.max(1, ...recordsByDay.map(([, c]) => c)), [recordsByDay]);
  const graphAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    graphAnim.setValue(0);
    Animated.timing(graphAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [graphAnim, kpis.total, kpis.passSlips, kpis.travelOrders, kpis.onTime, kpis.overdue, kpis.arrivalOther, recordsByDay.length, maxDayCount]);

  const topByCampus = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of appliedFilteredRecords) {
      const c = r.employee?.campus || '—';
      map.set(c, (map.get(c) || 0) + 1);
    }
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 6);
  }, [appliedFilteredRecords]);

  const topByOffice = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of appliedFilteredRecords) {
      const o = r.employee?.faculty || r.employee?.department || '—';
      map.set(o, (map.get(o) || 0) + 1);
    }
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 6);
  }, [appliedFilteredRecords]);

  const topByUser = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const r of appliedFilteredRecords) {
      const userId = r.employee?._id || '';
      const label = r.employee?.name || '—';
      if (!userId) continue;
      const prev = map.get(userId);
      map.set(userId, prev ? { label: prev.label, count: prev.count + 1 } : { label, count: 1 });
    }
    const entries = Array.from(map.entries()).map(([userId, v]) => ({ userId, ...v }));
    entries.sort((a, b) => b.count - a.count);
    return entries.slice(0, 8);
  }, [appliedFilteredRecords]);

  const maxCampus = useMemo(() => Math.max(1, ...topByCampus.map((x) => x[1])), [topByCampus]);
  const maxOffice = useMemo(() => Math.max(1, ...topByOffice.map((x) => x[1])), [topByOffice]);
  const maxUser = useMemo(() => Math.max(1, ...topByUser.map((x) => x.count)), [topByUser]);
  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filtersApplied.campus !== 'All Campuses') chips.push(`Campus: ${filtersApplied.campus}`);
    if (filtersApplied.office !== 'All Faculties') chips.push(`Faculty: ${filtersApplied.office}`);
    if (filtersApplied.userId !== 'All Users') {
      const selectedUser = userOptions.find((u) => u.userId === filtersApplied.userId);
      chips.push(`User: ${selectedUser?.label || filtersApplied.userId}`);
    }
    if (filtersApplied.fromDate || filtersApplied.toDate) {
      const from = filtersApplied.fromDate || 'Any';
      const to = filtersApplied.toDate || 'Any';
      chips.push(`Date: ${from} to ${to}`);
    }
    return chips;
  }, [filtersApplied, userOptions]);
  const generatedAtLabel = useMemo(() => new Date().toLocaleString(), [filtersApplied]);

  let tableInnerContent: any = null;
  let tableInnerContentError: string | null = null;

  try {
    tableInnerContent = (
      <View style={[styles.tableInner, isNarrow && styles.tableInnerNarrow]}>
        <View style={styles.tableHeadRow}>
          <Text style={[styles.tableHeadCell, styles.cEmployee]}>Employee</Text>
          <Text style={[styles.tableHeadCell, styles.cTracking]}>Tracking No.</Text>
          <Text style={[styles.tableHeadCell, styles.cType]}>Type</Text>
          <Text style={[styles.tableHeadCell, styles.cDate]}>Date</Text>
          <Text style={[styles.tableHeadCell, styles.cStatus]}>Status</Text>
          <Text style={[styles.tableHeadCell, styles.cArrival]}>Arrival</Text>
          <Text style={[styles.tableHeadCell, styles.cCampus]}>Campus</Text>
          <Text style={[styles.tableHeadCell, styles.cOffice]}>Faculty</Text>
        </View>

        {appliedFilteredRecords.length ? (
          appliedFilteredRecords.map((r, idx) => {
            const typeLabel = getRecordTypeLabel(r);
      const office = r.employee?.faculty || r.employee?.department || '—';
            const campus = r.employee?.campus || '—';
            const employee = r.employee?.name || '—';
            const status = r.status || '—';
            const arrival = r.arrivalStatus || '—';
            const arrivalLower = arrival.toLowerCase();
            const arrivalVariant = arrivalLower.includes('overdue')
              ? 'overdue'
              : arrivalLower.includes('on time')
                ? 'onTime'
                : 'neutral';

            const trackingNo = getTrackingNo(r);

            return (
              <View
                key={`${r._id}-${idx}`}
                style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : undefined]}
              >
                <Text style={[styles.tableCell, styles.cEmployee]} numberOfLines={1}>
                  {employee}
                </Text>
                <Text style={[styles.tableCell, styles.cTracking]} numberOfLines={1}>
                  {trackingNo}
                </Text>
                <View style={styles.cType}>
                  <View
                    style={[
                      styles.typeBadge,
                      typeLabel === 'Pass Slip' ? styles.typeBadgeSlip : styles.typeBadgeOrder,
                    ]}
                  >
                    <View
                      style={[
                        styles.typeBadgeDot,
                        typeLabel === 'Pass Slip' ? styles.typeBadgeDotSlip : styles.typeBadgeDotOrder,
                      ]}
                    />
                    <Text
                      style={[
                        styles.typeBadgeText,
                        typeLabel === 'Pass Slip' ? styles.typeBadgeTextSlip : styles.typeBadgeTextOrder,
                      ]}
                      numberOfLines={1}
                    >
                      {typeLabel}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.tableCell, styles.cDate]}>{formatDate(r.date)}</Text>
                <Text style={[styles.tableCell, styles.cStatus]} numberOfLines={1}>
                  {status}
                </Text>
                <View style={styles.cArrival}>
                  {arrival !== '—' ? (
                    <View
                      style={[
                        styles.arrivalBadge,
                        arrivalVariant === 'overdue' && styles.arrivalBadgeOverdue,
                        arrivalVariant === 'onTime' && styles.arrivalBadgeOnTime,
                      ]}
                    >
                      <View
                        style={[
                          styles.arrivalDot,
                          arrivalVariant === 'overdue' && styles.arrivalDotOverdue,
                          arrivalVariant === 'onTime' && styles.arrivalDotOnTime,
                        ]}
                      />
                      <Text
                        style={[
                          styles.arrivalBadgeText,
                          arrivalVariant === 'overdue' && styles.arrivalBadgeTextOverdue,
                          arrivalVariant === 'onTime' && styles.arrivalBadgeTextOnTime,
                        ]}
                        numberOfLines={1}
                      >
                        {arrival}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.tableCell}>—</Text>
                  )}
                </View>
                <Text style={[styles.tableCell, styles.cCampus]} numberOfLines={1}>
                  {campus}
                </Text>
                <Text style={[styles.tableCell, styles.cOffice]} numberOfLines={1}>
                  {office}
                </Text>
              </View>
            );
          })
        ) : (
          <View style={styles.noResults}>
            <Text style={styles.noResultsTitle}>No records match your filters.</Text>
            <Text style={styles.noResultsText}>Try changing campus, faculty, user, or date range.</Text>
          </View>
        )}
      </View>
    );
  } catch (err) {
    tableInnerContentError = String(err);
    tableInnerContent = (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Reports table error</Text>
        <Text style={{ color: '#dc3545', marginTop: 12, fontSize: 13, fontWeight: '600' }}>
          {tableInnerContentError}
        </Text>
      </View>
    );
    // eslint-disable-next-line no-console
    console.error('HrpReportsAnalytics table render error:', err);
  }

  const downloadCsv = () => {
    if (typeof window === 'undefined') return;

    // Longer date header so Excel opens with a wider Date column (avoids ######)
    const headers = ['Date (YYYY-MM-DD)', 'Tracking No.', 'Type', 'Employee', 'Campus', 'Faculty', 'Status', 'Arrival Status'];
    const rows = appliedFilteredRecords.map((r) => {
      const type = getRecordTypeLabel(r);
      const employee = r.employee?.name || '—';
      const campus = r.employee?.campus || '—';
      const office = r.employee?.faculty || r.employee?.department || '—';
      const status = r.status || '—';
      const arrivalStatus = r.arrivalStatus || '—';
      const trackingNo = getTrackingNo(r);

      return [
        escapeCsv(formatExcelCsvDateText(r.date)),
        escapeCsv(trackingNo),
        escapeCsv(type),
        escapeCsv(employee),
        escapeCsv(campus),
        escapeCsv(office),
        escapeCsv(status),
        escapeCsv(arrivalStatus),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `hr-analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  };

  const applyFilters = () => {
    setFiltersApplied(filtersDraft);
    setFilterActionMessage('Report generated using selected filters.');
  };
  const resetFilters = () => {
    setFiltersDraft(defaultFilters);
    setFiltersApplied(defaultFilters);
    setFilterActionMessage('Filters reset to default.');
  };

  if (!authChecked) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#011a6b" />
      </View>
    );
  }

  if (!isAuthorized) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{authError || 'Unauthorized.'}</Text>
      </View>
    );
  }

  try {
    return (
      <View style={styles.container}>
      <View style={styles.pageShell}>
      <View style={[styles.headerRow, isNarrow && styles.headerRowNarrow]}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Reports & Analytics</Text>
          <Text style={styles.subtitle}>Generate detailed HR reports by user, faculty, campus, and date range.</Text>
        </View>
        <View style={[styles.headerActions, isNarrow && styles.headerActionsNarrow]}>
          <View style={styles.headerPill}>
            <Text style={styles.headerPillText}>{appliedFilteredRecords.length} records</Text>
          </View>
          <Pressable onPress={downloadCsv} style={[styles.primaryBtn, styles.exportBtn]} accessibilityRole="button">
            <View style={[styles.primaryBtnIcon, styles.exportBtnIcon]}>
              <FontAwesome name="download" size={14} color="#011a6b" />
            </View>
            <Text style={[styles.primaryBtnText, styles.exportBtnText]}>Export CSV</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filtersCard}>
        <Text style={styles.filtersTitle}>Report Filters</Text>
        <Text style={styles.filtersSubtitle}>Set filters below, then click Generate Report to refresh analytics and the detailed table.</Text>

        <View style={[styles.filtersGrid, isNarrow && styles.filtersGridNarrow]}>
          <View style={[styles.filterGroup, styles.filterGroupCard, isNarrow && styles.filterGroupNarrow]}>
            <Text style={styles.filterLabel}>Campus</Text>
            <select
              value={filtersDraft.campus}
              onChange={(e) => setFiltersDraft((p) => ({ ...p, campus: e.target.value }))}
              style={selectStyle}
            >
              <option value="All Campuses">All Campuses</option>
              {campusOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </View>

          <View style={[styles.filterGroup, styles.filterGroupCard, isNarrow && styles.filterGroupNarrow]}>
            <Text style={styles.filterLabel}>Faculty</Text>
            <select
              value={filtersDraft.office}
              onChange={(e) => setFiltersDraft((p) => ({ ...p, office: e.target.value }))}
              style={selectStyle}
            >
              <option value="All Faculties">All Faculties</option>
              {officeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </View>

          <View style={[styles.filterGroup, styles.filterGroupCard, isNarrow && styles.filterGroupNarrow]}>
            <Text style={styles.filterLabel}>User</Text>
            <select
              value={filtersDraft.userId}
              onChange={(e) => setFiltersDraft((p) => ({ ...p, userId: e.target.value }))}
              style={selectStyle}
            >
              <option value="All Users">All Users</option>
              {userOptions.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.label}
                </option>
              ))}
            </select>
          </View>

          <View style={[styles.filterGroup, styles.filterGroupCard, isNarrow && styles.filterGroupNarrow]}>
            <Text style={styles.filterLabel}>Date Range</Text>
            <View style={styles.dateRow}>
              <input
                type="date"
                value={filtersDraft.fromDate}
                onChange={(e) => setFiltersDraft((p) => ({ ...p, fromDate: e.target.value }))}
                style={dateInputStyle}
              />
              <Text style={styles.dateDash}>to</Text>
              <input
                type="date"
                value={filtersDraft.toDate}
                onChange={(e) => setFiltersDraft((p) => ({ ...p, toDate: e.target.value }))}
                style={dateInputStyle}
              />
            </View>
          </View>
        </View>

        <View style={[styles.filterActions, isNarrow && styles.filterActionsNarrow, isVeryNarrow && styles.filterActionsVeryNarrow]}>
          <Pressable style={[styles.primaryBtn, isVeryNarrow && styles.primaryBtnBlock]} onPress={applyFilters}>
            <View style={styles.primaryBtnIcon}>
              <FontAwesome name="cogs" size={14} color="#fff" />
            </View>
            <Text style={styles.primaryBtnText}>Generate Report</Text>
          </Pressable>

          <Pressable style={[styles.secondaryBtn, isVeryNarrow && styles.secondaryBtnBlock]} onPress={resetFilters}>
            <Text style={styles.secondaryBtnText}>Reset</Text>
          </Pressable>
        </View>
        <View style={styles.appliedFiltersRow}>
          <Text style={styles.appliedFiltersLabel}>Active filters:</Text>
          {activeFilterChips.length ? (
            <View style={styles.filterChipWrap}>
              {activeFilterChips.map((chip) => (
                <View key={chip} style={styles.filterChip}>
                  <Text style={styles.filterChipText}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.appliedFiltersNone}>None (showing all records)</Text>
          )}
        </View>
        {!!filterActionMessage && <Text style={styles.filterActionMessage}>{filterActionMessage}</Text>}
      </View>

      <View style={styles.snapshotCard}>
        <View>
          <Text style={styles.snapshotTitle}>Report Snapshot</Text>
          <Text style={styles.snapshotMeta}>Generated: {generatedAtLabel}</Text>
        </View>
        <View style={styles.snapshotCountPill}>
          <Text style={styles.snapshotCountPillText}>{appliedFilteredRecords.length} result{appliedFilteredRecords.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <View style={styles.summaryChartsCard}>
        <View style={[styles.summaryChartsHeader, isNarrow && styles.summaryChartsHeaderNarrow]}>
          <View style={styles.summaryChartsHeaderText}>
            <Text style={styles.summaryChartsTitle}>Visual summary</Text>
            <Text style={styles.summaryChartsSubtitle}>
              Document mix, arrival outcomes, and daily volume for the filtered set.
            </Text>
          </View>
          <View style={styles.summaryTotalPill}>
            <Text style={styles.summaryTotalValue}>{kpis.total}</Text>
            <Text style={styles.summaryTotalLabel}>records</Text>
          </View>
        </View>

        <View style={[styles.summaryChartsRow, isVeryNarrow && styles.summaryChartsRowStacked]}>
          <View style={[styles.summaryChartCol, isVeryNarrow && styles.summaryChartColStacked]}>
            <Text style={styles.donutBlockTitle}>By document type</Text>
            <View style={styles.summaryColBody}>
              <Animated.View
                style={{
                  opacity: graphAnim,
                  transform: [
                    {
                      scale: graphAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.92, 1],
                      }),
                    },
                  ],
                }}
              >
                <DonutChart
                  size={100}
                  segments={[
                    { label: 'Pass Slip', value: kpis.passSlips, color: '#fece00' },
                    { label: 'Travel Order', value: kpis.travelOrders, color: '#0284c7' },
                  ]}
                />
              </Animated.View>
              <View style={styles.donutLegendColumn}>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: '#fece00' }]} />
                  <Text style={styles.legendText} numberOfLines={2}>
                    Pass slips · {kpis.passSlips}
                  </Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: '#0284c7' }]} />
                  <Text style={styles.legendText} numberOfLines={2}>
                    Travel orders · {kpis.travelOrders}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.summaryChartCol,
              !isVeryNarrow && styles.summaryChartColDivider,
              isVeryNarrow && styles.summaryChartColStacked,
            ]}
          >
            <Text style={styles.donutBlockTitle}>By arrival status</Text>
            <View style={styles.summaryColBody}>
              <Animated.View
                style={{
                  opacity: graphAnim,
                  transform: [
                    {
                      scale: graphAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.92, 1],
                      }),
                    },
                  ],
                }}
              >
                <DonutChart
                  size={100}
                  segments={[
                    { label: 'On time', value: kpis.onTime, color: '#16a34a' },
                    { label: 'Overdue', value: kpis.overdue, color: '#dc3545' },
                    { label: 'Other / unset', value: kpis.arrivalOther, color: '#94a3b8' },
                  ]}
                />
              </Animated.View>
              <View style={styles.donutLegendColumn}>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: '#16a34a' }]} />
                  <Text style={styles.legendText} numberOfLines={2}>
                    On time · {kpis.onTime}
                  </Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: '#dc3545' }]} />
                  <Text style={styles.legendText} numberOfLines={2}>
                    Overdue · {kpis.overdue}
                  </Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: '#94a3b8' }]} />
                  <Text style={styles.legendText} numberOfLines={2}>
                    Other / unset · {kpis.arrivalOther}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.summaryChartCol,
              !isVeryNarrow && styles.summaryChartColDivider,
              isVeryNarrow && styles.summaryChartColStacked,
            ]}
          >
            <Text style={styles.donutBlockTitle}>Records by day</Text>
            {recordsByDay.length ? (
              <View style={styles.trendColumnBody}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  nestedScrollEnabled
                  style={styles.trendScroll}
                  contentContainerStyle={styles.trendScrollContent}
                >
                  {recordsByDay.map(([date, count]) => {
                    const pct = (count / maxDayCount) * 100;
                    const animatedHeight = graphAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', `${pct}%`],
                    });
                    return (
                      <Animated.View
                        key={date}
                        style={[
                          styles.trendCol,
                          {
                            opacity: graphAnim,
                            transform: [
                              {
                                translateY: graphAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [8, 0],
                                }),
                              },
                            ],
                          },
                        ]}
                      >
                        <Text style={styles.trendCount}>{count}</Text>
                        <View style={styles.trendBarTrack}>
                          <Animated.View style={[styles.trendBarFill, { height: animatedHeight }]} />
                        </View>
                        <Text style={styles.trendDateLabel}>{date.slice(5)}</Text>
                      </Animated.View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <Text style={styles.trendEmptyInCol}>No dated records.</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.analyticsRow}>
        <View style={styles.analyticsCard}>
          <Text style={styles.analyticsTitle}>By Campus (Top)</Text>
          {topByCampus.length ? (
            <View style={styles.barList}>
              {topByCampus.map(([campus, value]) => (
                <View key={campus} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {campus}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(value / maxCampus) * 100}%` }]} />
                  </View>
                  <Text style={styles.barValue}>{value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No matching data.</Text>
          )}
        </View>

        <View style={styles.analyticsCard}>
          <Text style={styles.analyticsTitle}>By Faculty (Top)</Text>
          {topByOffice.length ? (
            <View style={styles.barList}>
              {topByOffice.map(([office, value]) => (
                <View key={office} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {office}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(value / maxOffice) * 100}%` }]} />
                  </View>
                  <Text style={styles.barValue}>{value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No matching data.</Text>
          )}
        </View>
      </View>

      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsTitle}>By User (Top)</Text>
        {topByUser.length ? (
          <View style={styles.barList}>
            {topByUser.map((u) => (
              <View key={u.userId} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1}>
                  {u.label}
                </Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(u.count / maxUser) * 100}%` }]} />
                </View>
                <Text style={styles.barValue}>{u.count}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No matching data.</Text>
        )}
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.tableTitle}>Detailed Report</Text>
            <Text style={styles.tableSubtitle}>
              Showing {appliedFilteredRecords.length} result{appliedFilteredRecords.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.tableHeaderBadge}>
            <Text style={styles.tableHeaderBadgeText}>
              {appliedFilteredRecords.length} record{appliedFilteredRecords.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {Platform.OS === 'web' ? (
          <View style={styles.tableHorizontalWrapper}>{tableInnerContent}</View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tableHorizontal}
            nestedScrollEnabled={true}
          >
            {tableInnerContent}
          </ScrollView>
        )}
      </View>
      </View>
      </View>
    );
  } catch (err) {
    // Prevent blank screen if something crashes during render.
    // eslint-disable-next-line no-console
    console.error('HrpReportsAnalytics render error:', err);
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Reports render error</Text>
        <Text style={{ color: '#dc3545', marginTop: 12, fontSize: 13, fontWeight: '600' }}>
          {String(err)}
        </Text>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {
    // Let the parent `ScrollView` control height; avoid `flex: 1` inside scroll content.
    width: '100%',
    backgroundColor: '#f8fafc',
  },
  pageShell: {
    borderRadius: 18,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.08)',
    backgroundColor: '#f8fafc',
  },
  centered: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc3545',
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#011a6b',
  },
  headerRowNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '500',
  },
  headerActions: {
    minWidth: 180,
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8 as any,
  },
  headerActionsNarrow: {
    minWidth: 0,
    marginTop: 10,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  headerPill: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 6,
  },
  headerPillText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  exportBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.25)',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 18px rgba(1,26,107,0.18)',
      },
    }),
  },
  exportBtnIcon: {
    backgroundColor: 'rgba(1,26,107,0.10)',
    borderRadius: 999,
  },
  exportBtnText: {
    color: '#011a6b',
    fontWeight: '900',
  },
  filtersCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.16)',
    padding: 16,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 12px 30px rgba(1,26,107,0.08)',
      },
    }),
  },
  filtersTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#011a6b',
    marginBottom: 6,
  },
  filtersSubtitle: {
    fontSize: 12,
    color: 'rgba(1,26,107,0.65)',
    fontWeight: '600',
    marginBottom: 14,
  },
  filtersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filtersGridNarrow: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  filterGroup: {
    minWidth: 220,
    marginRight: 12,
    marginBottom: 10,
  },
  filterGroupCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.12)',
    padding: 10,
  },
  filterGroupNarrow: {
    minWidth: '100%' as any,
    marginRight: 0,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(1,26,107,0.65)',
    marginBottom: 6,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  select: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.22)',
    backgroundColor: '#fff',
    fontSize: 14,
    color: '#334155',
    minWidth: 190,
    cursor: 'pointer',
  },
  selectNarrow: {
    minWidth: 0 as any,
    width: '100%' as any,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateDash: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(1,26,107,0.65)',
    marginHorizontal: 8,
  },
  dateInput: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.22)',
    backgroundColor: '#fff',
    fontSize: 14,
    color: '#334155',
    cursor: 'pointer',
    minWidth: 160,
  },
  dateInputNarrow: {
    minWidth: 0 as any,
    width: 150 as any,
    flex: 1,
  },
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(1,26,107,0.10)',
  },
  filterActionsNarrow: {
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
  filterActionsVeryNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  primaryBtnBlock: {
    justifyContent: 'center',
  },
  appliedFiltersRow: {
    marginTop: 10,
  },
  appliedFiltersLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(1,26,107,0.70)',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  appliedFiltersNone: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(1,26,107,0.62)',
  },
  filterChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterChip: {
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(1,26,107,0.08)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.16)',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#011a6b',
  },
  filterActionMessage: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(1,26,107,0.72)',
  },
  secondaryBtnBlock: {
    marginLeft: 0,
    marginTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snapshotCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.14)',
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 20px rgba(1,26,107,0.06)',
      },
    }),
  },
  snapshotTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#011a6b',
    marginBottom: 4,
  },
  snapshotMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(1,26,107,0.66)',
  },
  snapshotCountPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(1,26,107,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.16)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  snapshotCountPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#011a6b',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#011a6b',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    ...Platform.select({ web: { cursor: 'pointer' } }),
  },
  primaryBtnIcon: {
    marginRight: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryBtn: {
    marginLeft: 12,
    backgroundColor: 'rgba(1,26,107,0.08)',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    ...Platform.select({ web: { cursor: 'pointer' } }),
  },
  secondaryBtnText: {
    color: '#011a6b',
    fontWeight: '800',
    fontSize: 13,
  },
  summaryChartsCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.14)',
    padding: 16,
    marginBottom: 18,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 26px rgba(1,26,107,0.06)',
      },
    }),
  },
  summaryChartsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(1,26,107,0.10)',
  },
  summaryChartsHeaderNarrow: {
    flexDirection: 'column',
    gap: 12 as any,
  },
  summaryChartsHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  summaryChartsTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#011a6b',
    marginBottom: 4,
  },
  summaryChartsSubtitle: {
    fontSize: 12,
    color: 'rgba(1,26,107,0.65)',
    fontWeight: '600',
    lineHeight: 17,
  },
  summaryTotalPill: {
    borderRadius: 14,
    backgroundColor: 'rgba(1,26,107,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.14)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 88,
  },
  summaryTotalValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#011a6b',
    letterSpacing: -0.5,
  },
  summaryTotalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(1,26,107,0.55)',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  summaryChartsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  summaryChartsRowStacked: {
    flexDirection: 'column',
  },
  summaryChartCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  summaryChartColDivider: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(1,26,107,0.10)',
  },
  summaryChartColStacked: {
    width: '100%' as any,
    flex: 0 as any,
    borderLeftWidth: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(1,26,107,0.10)',
    paddingTop: 14,
    marginTop: 12,
  },
  summaryColBody: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  donutBlockTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#011a6b',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  donutLegendColumn: {
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginRight: 8,
  },
  legendText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  trendColumnBody: {
    flex: 1,
    minHeight: 132,
    minWidth: 0,
    width: '100%',
    justifyContent: 'center',
  },
  trendScroll: {
    flexGrow: 0,
    width: '100%',
    maxWidth: '100%',
  },
  trendScrollContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 4,
    paddingRight: 8,
  },
  trendEmptyInCol: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(1,26,107,0.55)',
    marginTop: 8,
  },
  trendCol: {
    width: 40,
    marginRight: 10,
    alignItems: 'center',
  },
  trendCount: {
    fontSize: 10,
    fontWeight: '800',
    color: '#011a6b',
    marginBottom: 4,
  },
  trendBarTrack: {
    width: 28,
    height: 100,
    borderRadius: 8,
    backgroundColor: 'rgba(1,26,107,0.10)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  trendBarFill: {
    width: '100%',
    backgroundColor: '#011a6b',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  trendDateLabel: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(1,26,107,0.55)',
  },
  analyticsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  analyticsCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.14)',
    padding: 16,
    flex: 1,
    minWidth: 320,
    marginRight: 12,
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 26px rgba(1,26,107,0.06)',
      },
    }),
  },
  analyticsTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#011a6b',
    marginBottom: 10,
  },
  barList: {
    // Avoid `gap` for broader React Native compatibility.
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  barLabel: {
    width: 160,
    color: '#011a6b',
    fontWeight: '700',
    fontSize: 12,
    marginRight: 10,
  },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: 'rgba(1,26,107,0.10)',
    borderRadius: 999,
    overflow: 'hidden',
    marginRight: 10,
  },
  barFill: {
    height: '100%',
    backgroundColor: '#fece00',
    borderRadius: 999,
  },
  barValue: {
    width: 38,
    textAlign: 'right',
    color: '#011a6b',
    fontWeight: '900',
    fontSize: 12,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(1,26,107,0.65)',
    fontWeight: '600',
  },
  /** Untitled UI-style table card */
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    padding: 0,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.10)',
      },
    }),
  },
  /** TableCard.Header — title left, count pill right */
  tableHeader: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
    letterSpacing: -0.2,
  },
  tableSubtitle: {
    fontSize: 13,
    color: '#475467',
    fontWeight: '500',
    marginTop: 2,
  },
  tableHeaderBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#344054',
  },
  tableHorizontal: {
    flexGrow: 0,
  },
  tableHorizontalWrapper: {
    width: '100%',
    borderRadius: 0,
    ...Platform.select({
      web: {
        overflowX: 'auto' as any,
        overflowY: 'hidden' as any,
        WebkitOverflowScrolling: 'touch' as any,
      },
    }),
  },
  /**
   * Responsive: stretch to fill on wide screens; columns clamp to their minWidths
   * on narrow ones and the wrapper above provides horizontal scroll.
   * 1140 = sum of column minWidths (180+130+110+100+130+200+120+170).
   */
  tableInner: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 1140,
  },
  tableInnerNarrow: {
    minWidth: 1140,
  },
  tableHeadRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    backgroundColor: '#F9FAFB',
  },
  tableHeadCell: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontWeight: '600',
    fontSize: 12,
    color: '#475467',
    textAlign: 'left',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  /** Untitled UI alternating fill */
  tableRowAlt: {
    backgroundColor: '#F9FAFB',
  },
  tableCell: {
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#101828',
    fontWeight: '500',
  },
  /** Arrival badge — modern w/ dot. Default is neutral; variants override. */
  arrivalBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EAECF0',
    backgroundColor: '#F2F4F7',
    maxWidth: '100%',
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  arrivalBadgeOnTime: {
    backgroundColor: '#ECFDF3',
    borderColor: '#ABEFC6',
  },
  arrivalBadgeOverdue: {
    backgroundColor: '#FEF3F2',
    borderColor: '#FECDCA',
  },
  arrivalDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#475467',
    marginRight: 6,
    flexShrink: 0,
  },
  arrivalDotOnTime: {
    backgroundColor: '#17B26A',
  },
  arrivalDotOverdue: {
    backgroundColor: '#F04438',
  },
  arrivalBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#344054',
    flexShrink: 1,
    minWidth: 0 as any,
  },
  arrivalBadgeTextOnTime: {
    color: '#067647',
  },
  arrivalBadgeTextOverdue: {
    color: '#B42318',
  },
  tableHorizontalCell: {
    paddingHorizontal: 10,
  },
  noResults: {
    padding: 44,
    alignItems: 'center',
  },
  noResultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
    marginBottom: 6,
    textAlign: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: '#475467',
    fontWeight: '500',
    textAlign: 'center',
  },

  /** Flex-based columns: ratios + minWidths so the table fills wide screens and clamps on narrow */
  cEmployee: { flex: 2, minWidth: 180, flexBasis: 0 as any },
  cTracking: { flex: 1.2, minWidth: 130, flexBasis: 0 as any },
  cType: { flex: 1, minWidth: 110, flexBasis: 0 as any },
  cDate: { flex: 1, minWidth: 100, flexBasis: 0 as any },
  cStatus: { flex: 1.2, minWidth: 130, flexBasis: 0 as any },
  cArrival: { flex: 1.6, minWidth: 200, flexBasis: 0 as any, overflow: 'hidden' as any },
  cCampus: { flex: 1.2, minWidth: 120, flexBasis: 0 as any },
  cOffice: { flex: 1.6, minWidth: 170, flexBasis: 0 as any },

  /** Type badge — "BadgeWithDot modern" */
  typeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  typeBadgeSlip: {
    backgroundColor: '#EFF8FF',
    borderColor: '#B2DDFF',
  },
  typeBadgeOrder: {
    backgroundColor: '#EEF4FF',
    borderColor: '#C7D7FE',
  },
  typeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginRight: 6,
    flexShrink: 0,
  },
  typeBadgeDotSlip: {
    backgroundColor: '#2E90FA',
  },
  typeBadgeDotOrder: {
    backgroundColor: '#6172F3',
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
    minWidth: 0 as any,
  },
  typeBadgeTextSlip: {
    color: '#175CD3',
  },
  typeBadgeTextOrder: {
    color: '#3538CD',
  },
});

export default HrpReportsAnalytics;

