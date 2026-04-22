import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

type PassSlipLike = {
  _id: string;
  date: string;
  timeOut?: string;
  estimatedTimeBack?: string;
  status?: string;
  hrApprovedBy?: unknown;
  employee?: {
    name?: string;
  };
};

type TrackerDayField = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

type TrackerRow = {
  id: string;
  employeeName: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
};

type WeeklyTrackerSheet = {
  weekKey: string;
  weekLabel: string;
  rows: TrackerRow[];
  totalApprovedSlips: number;
};

type PassSlipTrackerScreenProps = {
  passSlips: PassSlipLike[];
};

const WEEKLY_LIMIT_HOURS = 2;
const webSelectStyle = {
  minWidth: 300,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  backgroundColor: '#fff',
  fontSize: 14,
  color: '#334155',
  cursor: 'pointer',
};
const webExportButtonStyle = {
  backgroundColor: '#011a6b',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: '700',
  cursor: 'pointer',
  minWidth: 140,
};

const getMondayOfWeek = (date: Date): Date => {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
};

const getWeekKey = (date: Date): string => getMondayOfWeek(date).toISOString().slice(0, 10);

const getWeekLabel = (weekKey: string): string => {
  const monday = new Date(`${weekKey}T00:00:00`);
  if (Number.isNaN(monday.getTime())) return weekKey;
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
};

const parseTimeInDate = (baseDate: Date, timeValue?: string): Date | null => {
  if (!timeValue) return null;
  const match = String(timeValue).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  const parsed = new Date(baseDate);
  parsed.setHours(hours, minutes, 0, 0);
  return parsed;
};

const getSlipDurationHours = (slip: PassSlipLike): number => {
  const baseDate = new Date(slip.date);
  if (Number.isNaN(baseDate.getTime())) return 0;
  const start = parseTimeInDate(baseDate, slip.timeOut);
  const end = parseTimeInDate(baseDate, slip.estimatedTimeBack);
  if (!start || !end) return 0;
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) return 0;
  return durationMs / (1000 * 60 * 60);
};

const dayFieldFromDate = (date: Date): TrackerDayField | null => {
  const day = date.getDay();
  if (day === 1) return 'monday';
  if (day === 2) return 'tuesday';
  if (day === 3) return 'wednesday';
  if (day === 4) return 'thursday';
  if (day === 5) return 'friday';
  return null;
};

const blankSheetForCurrentWeek = (): WeeklyTrackerSheet => {
  const currentWeekKey = getWeekKey(new Date());
  return {
    weekKey: currentWeekKey,
    weekLabel: getWeekLabel(currentWeekKey),
    rows: [],
    totalApprovedSlips: 0,
  };
};

const formatHours = (value: number): string => value.toFixed(2);

const getTotalUsedHours = (row: TrackerRow): number => row.monday + row.tuesday + row.wednesday + row.thursday + row.friday;
const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export default function PassSlipTrackerScreen({ passSlips }: PassSlipTrackerScreenProps) {
  const { width } = useWindowDimensions();
  const isCompactTable = width < 1100;

  const weekSheets = useMemo<WeeklyTrackerSheet[]>(() => {
    const perWeek = new Map<string, { rowsByEmployee: Map<string, TrackerRow>; totalApprovedSlips: number }>();
    const acceptedStatuses = new Set(['Approved', 'Verified', 'Returned', 'Completed']);

    for (const slip of passSlips || []) {
      if (slip.status && !acceptedStatuses.has(slip.status)) continue;
      if (!slip.status && !slip.hrApprovedBy) continue;
      const slipDate = new Date(slip.date);
      if (Number.isNaN(slipDate.getTime())) continue;
      const field = dayFieldFromDate(slipDate);
      if (!field) continue;

      const employeeName = slip.employee?.name?.trim() || 'Unknown Employee';
      const durationHours = getSlipDurationHours(slip);
      if (durationHours <= 0) continue;

      const weekKey = getWeekKey(slipDate);
      if (!perWeek.has(weekKey)) {
        perWeek.set(weekKey, { rowsByEmployee: new Map<string, TrackerRow>(), totalApprovedSlips: 0 });
      }
      const week = perWeek.get(weekKey)!;
      week.totalApprovedSlips += 1;

      const employeeKey = employeeName.toLowerCase();
      if (!week.rowsByEmployee.has(employeeKey)) {
        week.rowsByEmployee.set(employeeKey, {
          id: `${weekKey}-${employeeKey}`,
          employeeName,
          monday: 0,
          tuesday: 0,
          wednesday: 0,
          thursday: 0,
          friday: 0,
        });
      }
      const row = week.rowsByEmployee.get(employeeKey)!;
      row[field] += durationHours;
    }

    const result = Array.from(perWeek.entries())
      .map(([weekKey, week]) => ({
        weekKey,
        weekLabel: getWeekLabel(weekKey),
        rows: Array.from(week.rowsByEmployee.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
        totalApprovedSlips: week.totalApprovedSlips,
      }))
      .sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));

    if (!result.length) return [blankSheetForCurrentWeek()];

    const currentWeekKey = getWeekKey(new Date());
    if (!result.some((sheet) => sheet.weekKey === currentWeekKey)) {
      result.unshift(blankSheetForCurrentWeek());
    }
    return result;
  }, [passSlips]);

  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(weekSheets[0]?.weekKey || getWeekKey(new Date()));

  useEffect(() => {
    if (weekSheets.some((sheet) => sheet.weekKey === selectedWeekKey)) return;
    setSelectedWeekKey(weekSheets[0]?.weekKey || getWeekKey(new Date()));
  }, [weekSheets, selectedWeekKey]);

  const selectedSheet = useMemo(
    () => weekSheets.find((sheet) => sheet.weekKey === selectedWeekKey) || weekSheets[0],
    [weekSheets, selectedWeekKey]
  );
  const historyCount = Math.max(0, weekSheets.length - 1);
  const isCurrentWeekSelected = selectedSheet?.weekKey === getWeekKey(new Date());

  const exportSelectedWeekToCsv = () => {
    if (typeof document === 'undefined' || !selectedSheet) return;
    const headers = [
      'Employee Name',
      'Monday (hrs)',
      'Tuesday (hrs)',
      'Wednesday (hrs)',
      'Thursday (hrs)',
      'Friday (hrs)',
      'Total Used',
      'Remaining Balance (2 hrs)',
    ];
    const lines = [headers.map(csvEscape).join(',')];

    for (const row of selectedSheet.rows) {
      const totalUsed = getTotalUsedHours(row);
      const remaining = WEEKLY_LIMIT_HOURS - totalUsed;
      lines.push(
        [
          row.employeeName,
          formatHours(row.monday),
          formatHours(row.tuesday),
          formatHours(row.wednesday),
          formatHours(row.thursday),
          formatHours(row.friday),
          formatHours(totalUsed),
          remaining < 0 ? `Over by ${formatHours(Math.abs(remaining))}` : formatHours(remaining),
        ]
          .map((cell) => csvEscape(cell))
          .join(',')
      );
    }

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const weekPart = selectedSheet.weekKey || 'week';
    const fileName = `pass-slip-tracker-${weekPart}.csv`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerCard}>
        <View>
          <Text style={styles.title}>Pass Slip Tracker</Text>
          <Text style={styles.subtitle}>Approved pass slips from current and past records are grouped weekly. Each week is kept as history automatically.</Text>
        </View>
        <View style={styles.headerMeta}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{historyCount} history week{historyCount === 1 ? '' : 's'}</Text>
          </View>
          <View style={[styles.metaPill, isCurrentWeekSelected ? styles.metaPillCurrent : styles.metaPillHistory]}>
            <Text style={styles.metaPillText}>{isCurrentWeekSelected ? 'Current Week' : 'History View'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.controlsLeft}>
          <Text style={styles.controlLabel}>Week</Text>
          <select value={selectedWeekKey} onChange={(e) => setSelectedWeekKey(e.target.value)} style={webSelectStyle as any}>
            {weekSheets.map((sheet) => (
              <option key={sheet.weekKey} value={sheet.weekKey}>
                {sheet.weekLabel}
                {sheet.weekKey === getWeekKey(new Date()) ? ' (Current Week)' : ''}
              </option>
            ))}
          </select>
        </View>
        <button type="button" style={webExportButtonStyle as any} onClick={exportSelectedWeekToCsv} disabled={!selectedSheet}>
          Export Week CSV
        </button>
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableTopMeta}>
          <Text style={styles.tableMetaText}>{selectedSheet?.weekLabel}</Text>
          <Text style={styles.tableMetaText}>
            {selectedSheet?.totalApprovedSlips || 0} pass slip{selectedSheet?.totalApprovedSlips === 1 ? '' : 's'}
          </Text>
        </View>
        <ScrollView horizontal={isCompactTable} showsHorizontalScrollIndicator={isCompactTable}>
          <View style={[styles.tableInner, isCompactTable && styles.tableInnerCompact]}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.colEmployee, isCompactTable && styles.colEmployeeCompact]}>Employee Name</Text>
              <Text style={[styles.headerCell, styles.colDay, isCompactTable && styles.colDayCompact]}>Monday (hrs)</Text>
              <Text style={[styles.headerCell, styles.colDay, isCompactTable && styles.colDayCompact]}>Tuesday (hrs)</Text>
              <Text style={[styles.headerCell, styles.colDay, isCompactTable && styles.colDayCompact]}>Wednesday (hrs)</Text>
              <Text style={[styles.headerCell, styles.colDay, isCompactTable && styles.colDayCompact]}>Thursday (hrs)</Text>
              <Text style={[styles.headerCell, styles.colDay, isCompactTable && styles.colDayCompact]}>Friday (hrs)</Text>
              <Text style={[styles.headerCell, styles.colTotal, isCompactTable && styles.colTotalCompact]}>Total Used</Text>
              <Text style={[styles.headerCell, styles.colBalance, isCompactTable && styles.colBalanceCompact]}>Remaining Balance (2 hrs)</Text>
            </View>

            {selectedSheet?.rows?.length ? (
              selectedSheet.rows.map((row, index) => {
                const totalUsed = getTotalUsedHours(row);
                const remaining = WEEKLY_LIMIT_HOURS - totalUsed;
                const isOver = remaining < 0;
                return (
                  <View key={row.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                    <View style={[styles.colEmployee, styles.cell, isCompactTable && styles.colEmployeeCompact]}>
                      <Text style={styles.employeeText}>{row.employeeName}</Text>
                    </View>
                    <View style={[styles.colDay, styles.cell, isCompactTable && styles.colDayCompact]}>
                      <Text style={styles.valueText}>{formatHours(row.monday)}</Text>
                    </View>
                    <View style={[styles.colDay, styles.cell, isCompactTable && styles.colDayCompact]}>
                      <Text style={styles.valueText}>{formatHours(row.tuesday)}</Text>
                    </View>
                    <View style={[styles.colDay, styles.cell, isCompactTable && styles.colDayCompact]}>
                      <Text style={styles.valueText}>{formatHours(row.wednesday)}</Text>
                    </View>
                    <View style={[styles.colDay, styles.cell, isCompactTable && styles.colDayCompact]}>
                      <Text style={styles.valueText}>{formatHours(row.thursday)}</Text>
                    </View>
                    <View style={[styles.colDay, styles.cell, isCompactTable && styles.colDayCompact]}>
                      <Text style={styles.valueText}>{formatHours(row.friday)}</Text>
                    </View>
                    <View style={[styles.colTotal, styles.cell, isCompactTable && styles.colTotalCompact]}>
                      <Text style={styles.valueTextStrong}>{formatHours(totalUsed)}</Text>
                    </View>
                    <View style={[styles.colBalance, styles.cell, isCompactTable && styles.colBalanceCompact]}>
                      <Text style={[styles.valueTextStrong, isOver && styles.overLimitText]}>
                        {isOver ? `Over by ${formatHours(Math.abs(remaining))}` : formatHours(remaining)}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyStateRow}>
                <Text style={styles.emptyStateText}>No pass slips found for this week.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 14,
  },
  headerCard: {
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#011a6b',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#334155',
    maxWidth: 680,
  },
  headerMeta: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  metaPillCurrent: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  metaPillHistory: {
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  metaPillText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  controlsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  controlLabel: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  tableCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  tableTopMeta: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  tableMetaText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  tableInner: {
    width: '100%',
    minWidth: 0,
  },
  tableInnerCompact: {
    minWidth: 980,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#011a6b',
  },
  headerCell: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  tableRowAlt: {
    backgroundColor: '#f8fafc',
  },
  cell: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
    fontWeight: '500',
  },
  valueTextStrong: {
    fontSize: 13,
    color: '#0f172a',
    textAlign: 'center',
    fontWeight: '700',
  },
  employeeText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  overLimitText: {
    color: '#b91c1c',
  },
  colEmployee: {
    flex: 2.6,
    textAlign: 'left',
  },
  colDay: {
    flex: 1.35,
  },
  colTotal: {
    flex: 1.4,
  },
  colBalance: {
    flex: 2.1,
  },
  colEmployeeCompact: {
    width: 220,
    flex: undefined,
  },
  colDayCompact: {
    width: 120,
    flex: undefined,
  },
  colTotalCompact: {
    width: 120,
    flex: undefined,
  },
  colBalanceCompact: {
    width: 180,
    flex: undefined,
  },
  emptyStateRow: {
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
  },
});
