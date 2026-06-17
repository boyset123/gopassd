import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import {
  formatEquivalentDay,
  HOURS_CONVERSION_ROWS,
} from '../utils/serviceCreditsConversion';
import {
  SERVICE_CREDIT_BALANCE_DAYS,
  SERVICE_CREDIT_LEDGER,
  type ServiceCreditLedgerEntry,
} from '../utils/serviceCreditsDemoData';

const theme = {
  primary: '#011a6b',
  accent: '#fece00',
  surface: '#ffffff',
  text: '#011a6b',
  textMuted: 'rgba(1,26,107,0.75)',
  border: 'rgba(1,26,107,0.22)',
  success: '#198754',
  danger: '#dc3545',
};

interface ServiceCreditsProfileCardProps {
  userName?: string;
}

function ledgerIcon(entry: ServiceCreditLedgerEntry): string {
  return entry.type === 'earned' ? 'clock-o' : 'exclamation-triangle';
}

function ledgerIconColor(entry: ServiceCreditLedgerEntry): string {
  return entry.type === 'earned' ? theme.success : theme.danger;
}

export function ServiceCreditsProfileCard({ userName }: ServiceCreditsProfileCardProps) {
  const [isTableExpanded, setIsTableExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <View style={[styles.cardTopBar, styles.cardTopBarAccent]} />
      <View style={styles.cardBody}>
        <View style={styles.sectionTitleRow}>
          <FontAwesome name="star" size={16} color={theme.primary} />
          <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>Service Credits</Text>
        </View>

        {userName ? (
          <Text style={styles.subtitle}>Credits for {userName}</Text>
        ) : null}

        <View style={styles.balanceStatRow}>
          <Text style={styles.balanceStatValue}>
            {formatEquivalentDay(SERVICE_CREDIT_BALANCE_DAYS)}
          </Text>
          <Text style={styles.balanceStatLabel}>total equivalent days</Text>
          <Text style={styles.balanceHint}>Based on 8-hour workday</Text>
        </View>

        <View style={styles.policyNote}>
          <FontAwesome name="info-circle" size={13} color={theme.textMuted} />
          <Text style={styles.policyNoteText}>
            Pass slips exceeding 2 hours are automatically deducted from service credits.
          </Text>
        </View>

        <View style={styles.separator} />

        {SERVICE_CREDIT_LEDGER.map((entry) => (
          <View key={entry.id} style={styles.ledgerRow}>
            <View
              style={[
                styles.ledgerIconWrap,
                entry.type === 'deducted' && styles.ledgerIconWrapDanger,
              ]}
            >
              <FontAwesome
                name={ledgerIcon(entry) as 'clock-o' | 'exclamation-triangle'}
                size={14}
                color={ledgerIconColor(entry)}
              />
            </View>
            <View style={styles.ledgerTextWrap}>
              <Text style={styles.ledgerTitle}>{entry.title}</Text>
              <Text style={styles.ledgerDetail}>{entry.detail}</Text>
            </View>
            <Text
              style={[
                styles.ledgerAmount,
                entry.type === 'earned' ? styles.ledgerAmountEarned : styles.ledgerAmountDeducted,
              ]}
            >
              {entry.formattedAmount}
            </Text>
          </View>
        ))}

        <Text style={styles.deductionHint}>
          Deduction amount follows CSC fraction-of-day conversion.
        </Text>

        <View style={styles.separator} />

        <Pressable
          style={styles.tableHeader}
          onPress={() => setIsTableExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isTableExpanded }}
        >
          <View style={styles.sectionTitleRow}>
            <FontAwesome name="table" size={14} color={theme.primary} />
            <Text style={[styles.tableHeaderTitle, styles.sectionTitleInline]}>
              Conversion reference
            </Text>
          </View>
          <FontAwesome
            name={isTableExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.primary}
          />
        </Pressable>

        {isTableExpanded ? (
          <View style={styles.tableWrap}>
            <Text style={styles.tableCaption}>
              Conversion of working hours into fractions of a day
            </Text>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.tableHeaderCell]}>Hours</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, styles.tableCellRight]}>
                Equivalent day
              </Text>
            </View>
            {HOURS_CONVERSION_ROWS.map((row) => (
              <View key={row.hours} style={styles.tableRow}>
                <Text style={styles.tableCell}>{row.hours}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight]}>
                  {formatEquivalentDay(row.equivalentDay)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#011a6b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  cardTopBar: {
    height: 4,
    width: '100%',
    backgroundColor: theme.primary,
  },
  cardTopBarAccent: {
    backgroundColor: theme.accent,
  },
  cardBody: {
    padding: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitleInline: {
    marginBottom: 0,
    flex: 1,
  },
  subtitle: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: -8,
    marginBottom: 12,
  },
  balanceStatRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.primary,
  },
  balanceStatLabel: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  balanceHint: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  policyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(1,26,107,0.06)',
    borderRadius: 8,
    padding: 10,
  },
  policyNoteText: {
    flex: 1,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 17,
  },
  separator: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 14,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  ledgerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(25,135,84,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  ledgerIconWrapDanger: {
    backgroundColor: 'rgba(220,53,69,0.1)',
  },
  ledgerTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  ledgerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  ledgerDetail: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  ledgerAmount: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },
  ledgerAmountEarned: {
    color: theme.success,
  },
  ledgerAmountDeducted: {
    color: theme.danger,
  },
  deductionHint: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 10,
    fontStyle: 'italic',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 0,
  },
  tableWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableCaption: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(1,26,107,0.04)',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  tableCell: {
    flex: 1,
    fontSize: 13,
    color: theme.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    fontWeight: '700',
    backgroundColor: 'rgba(1,26,107,0.06)',
  },
  tableCellRight: {
    textAlign: 'right',
  },
});
