import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
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
  /** HR: mark approved travel order as Completed (with confirmation in parent) */
  onMarkComplete?: (order: ApprovedTravelOrder) => void;
  completingOrderId?: string | null;
  /** Row _id while the mark-complete confirmation modal is open for that order */
  markCompleteConfirmOpenForId?: string | null;
}

export default function MonitoringApprovedTravelOrdersCard(props: MonitoringApprovedTravelOrdersCardProps) {
  const { styles, orders, onView, onIssueCtc, onMarkComplete, completingOrderId, markCompleteConfirmOpenForId } = props;
  const showCtc = FEATURE_CTC_ENABLED && !!onIssueCtc;
  const showMarkComplete = !!onMarkComplete;
  const actionsColStyle = showCtc
    ? (styles as any).monitoringColActionsThreeButtons
    : showMarkComplete
      ? (styles as any).monitoringColActionsTwoButtons
      : (styles as any).monitoringColActions;

  return (
    <View style={styles.monitoringCard}>
      <Text style={styles.sectionTitle}>Active Travel Orders ({orders.length})</Text>
      <View style={(styles as any).monitoringTableCard}>
        <View style={(styles as any).monitoringTableInner}>
          <View style={(styles as any).monitoringTableHeader}>
            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColEmployee, colFit]}>Employee</Text>
            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColDestination, colFit]}>Destination</Text>
            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColTimeOut, colFit]}>TO No.</Text>
            <Text style={[(styles as any).monitoringHeaderText, (styles as any).monitoringColTimer, colFit]}>Schedule</Text>
            <Text style={[(styles as any).monitoringHeaderText, actionsColStyle]}>Actions</Text>
          </View>

          {orders.map((item, index) => (
            <View
              key={item._id}
              style={[(styles as any).monitoringTableRow, index % 2 === 1 && (styles as any).monitoringTableRowAlt]}
            >
              <View style={[(styles as any).monitoringColEmployee, colFit, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <Image
                  source={{
                    uri: profilePictureUri(
                      item.employee?.profilePicture,
                      API_BASE_URL,
                      'https://via.placeholder.com/48'
                    ),
                  }}
                  style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#F2F4F7', borderWidth: 1, borderColor: 'rgba(16,24,40,0.06)' }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[(styles as any).monitoringRowText, { fontSize: 14, fontWeight: '500', color: '#101828' }]}
                    numberOfLines={1}
                  >
                    {item.employee?.name || 'N/A'}
                  </Text>
                  {item.employee?.email ? (
                    <Text style={{ fontSize: 13, color: '#475467', marginTop: 2 }} numberOfLines={1}>
                      {item.employee.email}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text style={[(styles as any).monitoringRowText, (styles as any).monitoringColDestination, colFit]} numberOfLines={1}>
                {item.to || '—'}
              </Text>
              <Text style={[(styles as any).monitoringRowText, (styles as any).monitoringColTimeOut, colFit]} numberOfLines={1}>
                {item.travelOrderNo || '—'}
              </Text>
              <View style={[(styles as any).monitoringColTimer, colFit, { justifyContent: 'center' }]}>
                <Text style={[(styles as any).monitoringRowText, { fontSize: 12, fontWeight: '600' }]} numberOfLines={1}>
                  {formatDate(item.departureDate || item.date)} → {formatDate(item.arrivalDate || '')}
                </Text>
                <Text style={[(styles as any).monitoringRowText, { fontSize: 12, opacity: 0.75 }]} numberOfLines={1}>
                  {formatTimeOnly(item.departureDate || item.date)} - {formatTimeOnly(item.arrivalDate || '')}
                </Text>
              </View>
              <View style={[actionsColStyle, (styles as any).monitoringActionsCell]}>
                <Pressable style={styles.viewButton} onPress={() => onView(item)}>
                  <Text style={styles.viewButtonText}>View</Text>
                </Pressable>
                {onMarkComplete && (!item.status || item.status === 'Approved') ? (
                  <Pressable
                    disabled={
                      String(completingOrderId || '') === String(item._id) ||
                      String(markCompleteConfirmOpenForId || '') === String(item._id)
                    }
                    style={[
                      styles.markTravelCompleteButton,
                      (String(completingOrderId || '') === String(item._id) ||
                        String(markCompleteConfirmOpenForId || '') === String(item._id)) &&
                        styles.markTravelCompleteButtonDisabled,
                    ]}
                    onPress={() => onMarkComplete(item)}
                  >
                    <Text style={styles.markTravelCompleteButtonText}>Complete</Text>
                  </Pressable>
                ) : null}
                {FEATURE_CTC_ENABLED && onIssueCtc ? (
                  <Pressable style={styles.issueCtcButton} onPress={() => onIssueCtc(item)}>
                    <Text style={styles.issueCtcButtonText}>Travel Complete</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

