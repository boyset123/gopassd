import { StyleSheet } from 'react-native';

export const calendarStyles = StyleSheet.create({
  container: {
    gap: 20,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    fontSize: 14,
    color: '#475467',
    marginTop: 4,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  monthNavButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavButtonPressed: {
    backgroundColor: '#F9FAFB',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#011a6b',
    minWidth: 180,
    textAlign: 'center',
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-end',
  },
  filterGroup: {
    gap: 6,
    minWidth: 180,
    flex: 1,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    padding: 16,
    gap: 8,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#667085',
    textTransform: 'uppercase',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1,
    borderColor: '#F2F4F7',
    padding: 6,
    backgroundColor: '#FFFFFF',
  },
  dayCellOutside: {
    backgroundColor: '#FCFCFD',
  },
  dayCellToday: {
    borderColor: '#011a6b',
    backgroundColor: '#F8FAFF',
  },
  dayCellSelected: {
    borderColor: '#011a6b',
    backgroundColor: '#EEF2FF',
  },
  dayCellPressed: {
    backgroundColor: '#F2F4F7',
  },
  dayNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#344054',
    marginBottom: 4,
  },
  dayNumberToday: {
    color: '#011a6b',
  },
  dayNumberSelected: {
    color: '#011a6b',
  },
  eventChip: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginBottom: 2,
  },
  eventChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  overflowBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475467',
    marginTop: 2,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    padding: 20,
    gap: 12,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  eventRow: {
    borderWidth: 1,
    borderColor: '#EAECF0',
    borderRadius: 10,
    padding: 14,
    gap: 6,
    backgroundColor: '#FCFCFD',
  },
  eventRowPressed: {
    backgroundColor: '#F2F4F7',
  },
  eventRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  eventName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101828',
    flex: 1,
  },
  eventMeta: {
    fontSize: 13,
    color: '#475467',
  },
  eventStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#011a6b',
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  legendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    padding: 16,
    gap: 10,
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#344054',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#475467',
  },
  loadingWrap: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#344054',
  },
  emptyText: {
    fontSize: 14,
    color: '#667085',
    textAlign: 'center',
  },
  layoutStack: {
    gap: 20,
  },
  layoutSideBySide: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
  },
  calendarColumn: {
    flex: 1.4,
  },
  detailColumn: {
    flex: 1,
    minWidth: 280,
  },
});

export const webFilterSelectStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #D0D5DD',
  backgroundColor: '#FFFFFF',
  fontSize: 14,
  color: '#101828',
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
};
