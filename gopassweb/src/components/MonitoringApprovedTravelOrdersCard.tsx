import React, { useState } from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { API_BASE_URL } from '../config/api';
import { profilePictureUri } from '../utils/profilePictureUri';
import { FEATURE_CTC_ENABLED } from '../config/featureFlags';

interface Employee {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  role?: string;
  immediateSupervisor?: { name?: string } | string;
}

export interface ApprovedTravelOrder {
  _id: string;
  employee: Employee;
  /** Submitter role snapshot from server */
  employeeRole?: string;
  approvedBy?: Employee;
  recommendedBy?: Employee[];
  /** Employee (submitter) signature on the travel order */
  signature?: string;
  /** Often holds first recommender / immediate chief signature */
  approverSignature?: string;
  recommenderSignatures?: { user?: string; signature?: string }[];
  travelOrderNo?: string;
  date: string;
  to: string;
  purpose: string;
  departureDate?: string;
  arrivalDate?: string;
  status: string;
}

const formatDate = (dateString: string, includeTime: boolean = false) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid';
  if (!includeTime) return date.toLocaleDateString();
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
};

const formatTimeOnly = (dateString: string) => {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'Invalid';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

/** Lets flex columns shrink so the table fits its container (shared styles use large minWidths). */
const colFit = { minWidth: 0 as const };

export interface MonitoringApprovedTravelOrdersCardProps {
  styles: any;
  orders: ApprovedTravelOrder[];
  onView: (order: ApprovedTravelOrder) => void;
  /** When FEATURE_CTC_ENABLED is false, omit or pass undefined */
  onIssueCtc?: (order: ApprovedTravelOrder) => void;
}

export default function MonitoringApprovedTravelOrdersCard(props: MonitoringApprovedTravelOrdersCardProps) {
  const { styles, orders, onView, onIssueCtc } = props;
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const s = styles as Record<string, object>;
  const showCtc = FEATURE_CTC_ENABLED && !!onIssueCtc;
  const actionsColStyle = showCtc
    ? s.monitoringColActionsTwoButtons
    : s.monitoringColActions;

  return (
    <View style={styles.monitoringCard}>
      <Text style={styles.sectionTitle}>Active Travel Orders ({orders.length})</Text>
      <View style={s.monitoringTableCard}>
        <View style={s.monitoringTableInner}>
          <View style={s.monitoringTableHeader}>
            <Text style={[s.monitoringHeaderText, s.monitoringColEmployee, colFit]}>Employee</Text>
            <Text style={[s.monitoringHeaderText, s.monitoringColDestination, colFit]}>Destination</Text>
            <Text style={[s.monitoringHeaderText, s.monitoringColTimeOut, colFit]}>TO No.</Text>
            <Text style={[s.monitoringHeaderText, s.monitoringColTimer, colFit]}>Schedule</Text>
            <Text style={[s.monitoringHeaderText, actionsColStyle]}>Actions</Text>
          </View>

          {orders.length === 0 ? (
            <View style={s.monitoringEmptyState}>
              <Text style={s.monitoringEmptyTitle}>No active travel orders</Text>
              <Text style={s.monitoringEmptySubtitle}>
                Approved travel orders currently in progress will appear here.
              </Text>
            </View>
          ) : (
            orders.map((item, index) => {
              const isHovered = hoveredRow === item._id;
              return (
                <Pressable
                  key={item._id}
                  onPress={() => onView(item)}
                  onHoverIn={Platform.OS === 'web' ? () => setHoveredRow(item._id) : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHoveredRow(null) : undefined}
                  style={[
                    s.monitoringTableRow,
                    index % 2 === 1 && s.monitoringTableRowAlt,
                    isHovered && s.monitoringTableRowHover,
                  ]}
                >
                  <View style={[s.monitoringColEmployee, colFit, s.monitoringEmployeeCell]}>
                    <Image
                      source={{
                        uri: profilePictureUri(
                          item.employee?.profilePicture,
                          API_BASE_URL,
                          'https://via.placeholder.com/48'
                        ),
                      }}
                      style={s.monitoringAvatar}
                    />
                    <View style={s.monitoringEmployeeMeta}>
                      <Text style={s.monitoringEmployeeName} numberOfLines={1}>
                        {item.employee?.name || 'N/A'}
                      </Text>
                      {item.employee?.email ? (
                        <Text style={s.monitoringEmployeeEmail} numberOfLines={1}>
                          {item.employee.email}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Text
                    style={[s.monitoringDestinationText, s.monitoringColDestination, colFit]}
                    numberOfLines={2}
                    {...(Platform.OS === 'web' ? ({ title: item.to } as object) : {})}
                  >
                    {item.to || '—'}
                  </Text>
                  <Text style={[s.monitoringRowText, s.monitoringColTimeOut, colFit]} numberOfLines={1}>
                    {item.travelOrderNo || '—'}
                  </Text>
                  <View style={[s.monitoringColTimer, colFit, s.monitoringScheduleCell]}>
                    <Text style={s.monitoringSchedulePrimary} numberOfLines={1}>
                      {formatDate(item.departureDate || item.date)} → {formatDate(item.arrivalDate || '')}
                    </Text>
                    <Text style={s.monitoringScheduleSecondary} numberOfLines={1}>
                      {formatTimeOnly(item.departureDate || item.date)} – {formatTimeOnly(item.arrivalDate || '')}
                    </Text>
                  </View>
                  <View style={[actionsColStyle, s.monitoringActionsCell]}>
                    <Pressable
                      style={[styles.viewButton, isHovered && s.viewButtonHover]}
                      onPress={(e) => {
                        if (Platform.OS === 'web') (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
                        onView(item);
                      }}
                    >
                      <Text style={styles.viewButtonText}>View</Text>
                    </Pressable>
                    {FEATURE_CTC_ENABLED && onIssueCtc ? (
                      <Pressable style={styles.issueCtcButton} onPress={() => onIssueCtc(item)}>
                        <Text style={styles.issueCtcButtonText}>Travel Complete</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </View>
    </View>
  );
}
