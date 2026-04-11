import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome } from '@expo/vector-icons';

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
};

type TravelOrderLike = {
  _id: string;
  employee: Employee;
  date?: string;
  to?: string;
  status?: string;
  arrivalStatus?: string;
};

export type RecordLike = PassSlipLike | TravelOrderLike;

export type HrpReportsAnalyticsProps = {
  records: RecordLike[];
};

const campuses = [
  'All Campuses',
  'Main Campus',
  'Baganga Campus',
  'Banaybanay Campus',
  'Cateel Campus',
  'San Isidro Campus',
  'Tarragona Campus',
];

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

const getRecordTypeLabel = (r: RecordLike) => ('destination' in r && r.destination ? 'Pass Slip' : 'Travel Order');

const escapeCsv = (value: string) => {
  const v = value ?? '';
  const needsQuotes = /[",\n]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

const HrpReportsAnalytics = ({ records }: HrpReportsAnalyticsProps) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [filtersDraft, setFiltersDraft] = useState<Filters>(defaultFilters);
  const [filtersApplied, setFiltersApplied] = useState<Filters>(defaultFilters);

  const { width } = useWindowDimensions();
  const isNarrow = width < 900;

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

      if (campus !== 'All Campuses' && r.employee?.campus !== campus) return false;

      const officeValue = (r.employee?.faculty || r.employee?.department || '').trim();
      if (office !== 'All Faculties' && officeValue !== office) return false;

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

    const byType = {
      passSlips,
      travelOrders,
    };

    return { total, ...byType, onTime, overdue };
  }, [appliedFilteredRecords]);

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

  let tableInnerContent: any = null;
  let tableInnerContentError: string | null = null;

  try {
    tableInnerContent = (
      <View style={[styles.tableInner, isNarrow && styles.tableInnerNarrow]}>
        <View style={styles.tableHeadRow}>
          <Text style={[styles.tableHeadCell, styles.cEmployee]}>Employee</Text>
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

            return (
              <View
                key={`${r._id}-${idx}`}
                style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : undefined]}
              >
                <Text style={[styles.tableCell, styles.cEmployee]} numberOfLines={1}>
                  {employee}
                </Text>
                <View style={styles.cType}>
                  <Text
                    style={[
                      styles.typeBadge,
                      typeLabel === 'Pass Slip' ? styles.typeBadgeSlip : styles.typeBadgeOrder,
                    ]}
                  >
                    {typeLabel}
                  </Text>
                </View>
                <Text style={[styles.tableCell, styles.cDate]}>{formatDate(r.date)}</Text>
                <Text style={[styles.tableCell, styles.cStatus]} numberOfLines={1}>
                  {status}
                </Text>
                <View
                  style={[
                    styles.cArrival,
                    styles.arrivalBadge,
                    arrivalVariant === 'overdue' && styles.arrivalBadgeOverdue,
                    arrivalVariant === 'onTime' && styles.arrivalBadgeOnTime,
                  ]}
                >
                  <Text
                    style={[
                      styles.arrivalBadgeText,
                      arrivalVariant === 'overdue' && styles.arrivalBadgeTextOverdue,
                    ]}
                  >
                    {arrival}
                  </Text>
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
    const headers = ['Date (YYYY-MM-DD)', 'Type', 'Employee', 'Campus', 'Faculty', 'Status', 'Arrival Status'];
    const rows = appliedFilteredRecords.map((r) => {
      const type = getRecordTypeLabel(r);
      const employee = r.employee?.name || '—';
      const campus = r.employee?.campus || '—';
      const office = r.employee?.faculty || r.employee?.department || '—';
      const status = r.status || '—';
      const arrivalStatus = r.arrivalStatus || '—';

      return [
        escapeCsv(formatCsvDate(r.date)),
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

  const applyFilters = () => setFiltersApplied(filtersDraft);
  const resetFilters = () => {
    setFiltersDraft(defaultFilters);
    setFiltersApplied(defaultFilters);
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
      <View style={[styles.headerRow, isNarrow && styles.headerRowNarrow]}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Reports & Analytics</Text>
          <Text style={styles.subtitle}>Generate detailed HR reports by user, faculty, campus, and date range.</Text>
        </View>
        <View style={[styles.headerActions, isNarrow && styles.headerActionsNarrow]}>
          <Pressable onPress={downloadCsv} style={styles.primaryBtn} accessibilityRole="button">
            <View style={styles.primaryBtnIcon}>
              <FontAwesome name="download" size={14} color="#fff" />
            </View>
            <Text style={styles.primaryBtnText}>Export CSV</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filtersCard}>
        <Text style={styles.filtersTitle}>Report Filters</Text>

        <View style={[styles.filtersGrid, isNarrow && styles.filtersGridNarrow]}>
          <View style={[styles.filterGroup, isNarrow && styles.filterGroupNarrow]}>
            <Text style={styles.filterLabel}>Campus</Text>
            <select
              value={filtersDraft.campus}
              onChange={(e) => setFiltersDraft((p) => ({ ...p, campus: e.target.value }))}
              style={selectStyle}
            >
              {campuses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </View>

          <View style={[styles.filterGroup, isNarrow && styles.filterGroupNarrow]}>
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

          <View style={[styles.filterGroup, isNarrow && styles.filterGroupNarrow]}>
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

          <View style={[styles.filterGroup, isNarrow && styles.filterGroupNarrow]}>
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

        <View style={[styles.filterActions, isNarrow && styles.filterActionsNarrow]}>
          <Pressable style={styles.primaryBtn} onPress={applyFilters}>
            <View style={styles.primaryBtnIcon}>
              <FontAwesome name="cogs" size={14} color="#fff" />
            </View>
            <Text style={styles.primaryBtnText}>Generate Report</Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={resetFilters}>
            <Text style={styles.secondaryBtnText}>Reset</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={styles.kpiIconWrap}>
            <FontAwesome name="list-alt" size={14} color="#fff" />
          </View>
          <View style={styles.kpiText}>
            <Text style={styles.kpiValue}>{kpis.total}</Text>
            <Text style={styles.kpiLabel}>Total Records</Text>
          </View>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, styles.kpiIconWrapAccent]}>
            <FontAwesome name="check-circle" size={14} color="#fff" />
          </View>
          <View style={styles.kpiText}>
            <Text style={styles.kpiValue}>{kpis.passSlips}</Text>
            <Text style={styles.kpiLabel}>Pass Slips</Text>
          </View>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, styles.kpiIconWrapAccent2]}>
            <FontAwesome name="plane" size={14} color="#fff" />
          </View>
          <View style={styles.kpiText}>
            <Text style={styles.kpiValue}>{kpis.travelOrders}</Text>
            <Text style={styles.kpiLabel}>Travel Orders</Text>
          </View>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, styles.kpiIconWrapWarn]}>
            <FontAwesome name="exclamation-triangle" size={14} color="#fff" />
          </View>
          <View style={styles.kpiText}>
            <Text style={styles.kpiValue}>
              {kpis.onTime}
              <Text style={styles.kpiValueSmall}> on time</Text>
            </Text>
            <Text style={styles.kpiLabel}>{kpis.overdue} overdue</Text>
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
          <Text style={styles.tableTitle}>Detailed Report</Text>
          <Text style={styles.tableSubtitle}>
            Showing {appliedFilteredRecords.length} result{appliedFilteredRecords.length === 1 ? '' : 's'}
          </Text>
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
  },
  headerActionsNarrow: {
    minWidth: 0,
    marginTop: 10,
    alignItems: 'flex-start',
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
    marginTop: 6,
  },
  filterActionsNarrow: {
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
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
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    marginBottom: 18,
    ...Platform.select({
      web: {
        overflowX: 'auto' as any,
        paddingBottom: 6,
      },
    }),
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.14)',
    padding: 18,
    flex: 1,
    minWidth: 200,
    marginRight: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    ...Platform.select({
      web: {
        boxShadow: '0 10px 26px rgba(1,26,107,0.06)',
      },
    }),
  },
  kpiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#011a6b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginBottom: 0,
  },
  kpiIconWrapAccent: {
    backgroundColor: '#fece00',
  },
  kpiIconWrapAccent2: {
    backgroundColor: '#0284c7',
  },
  kpiIconWrapWarn: {
    backgroundColor: '#dc3545',
  },
  kpiText: {
    flex: 1,
  },
  kpiValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#011a6b',
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  kpiValueSmall: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(1,26,107,0.65)',
    letterSpacing: 0.2,
  },
  kpiLabel: {
    fontSize: 12,
    color: 'rgba(1,26,107,0.65)',
    fontWeight: '600',
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
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.14)',
    padding: 0,
    ...Platform.select({
      web: {
        boxShadow: '0 14px 40px rgba(1,26,107,0.06)',
      },
    }),
  },
  tableHeader: {
    padding: 16,
    backgroundColor: '#011a6b',
    borderBottomWidth: 3,
    borderBottomColor: '#fece00',
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
  tableSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
    marginTop: 4,
  },
  tableHorizontal: {
    flexGrow: 0,
  },
  tableHorizontalWrapper: {
    width: '100%',
    borderRadius: 0,
    padding: 16,
    ...Platform.select({
      web: {
        overflowX: 'auto' as any,
        overflowY: 'hidden' as any,
        WebkitOverflowScrolling: 'touch' as any,
      },
    }),
  },
  tableInner: {
    minWidth: 1100,
  },
  tableInnerNarrow: {
    minWidth: 980,
  },
  tableHeadRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(1,26,107,0.10)',
    paddingBottom: 8,
    backgroundColor: 'rgba(1,26,107,0.06)',
  },
  tableHeadCell: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontWeight: '900',
    fontSize: 12,
    color: '#011a6b',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(1,26,107,0.10)',
    paddingVertical: 10,
  },
  tableRowAlt: {
    backgroundColor: 'rgba(2,132,199,0.05)',
  },
  tableCell: {
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
  },
  arrivalBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    alignSelf: 'flex-start',
  },
  arrivalBadgeOnTime: {
    backgroundColor: '#dcfce7',
  },
  arrivalBadgeOverdue: {
    backgroundColor: '#fee2e2',
  },
  arrivalBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
  },
  arrivalBadgeTextOverdue: {
    color: '#b91c1c',
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
    fontWeight: '900',
    color: '#011a6b',
    marginBottom: 6,
    textAlign: 'center',
  },
  noResultsText: {
    fontSize: 13,
    color: 'rgba(1,26,107,0.65)',
    fontWeight: '600',
    textAlign: 'center',
  },

  cEmployee: { width: 260, flexGrow: 0 },
  cType: { width: 140, flexGrow: 0 },
  cDate: { width: 150, minWidth: 130, flexGrow: 0 },
  cStatus: { width: 170, flexGrow: 0 },
  cArrival: { width: 160, flexGrow: 0 },
  cCampus: { width: 150, flexGrow: 0 },
  cOffice: { width: 170, flexGrow: 0 },

  typeBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '900',
  },
  typeBadgeSlip: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  typeBadgeOrder: {
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
  },
});

export default HrpReportsAnalytics;

