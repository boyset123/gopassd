import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { SignatureActionButtons } from './SignatureActionButtons';
import { formatRoleLabel } from '../utils/roleLabels';
import { formatAuditDate, formatAuditTime, resolveCancelledTimestamp, AuditTrailEvent } from '../utils/auditTrail';

type SignatureType = 'draw' | 'upload';

export interface PassSlipFormSlip {
  employee?: { name?: string; role?: string };
  date?: string;
  trackingNo?: string;
  timeOut?: string;
  estimatedTimeBack?: string;
  arrivalTime?: string;
  overdueMinutes?: number;
  destination?: string;
  requiredVicinity?: string;
  additionalInfo?: string;
  purpose?: string;
  signature?: string;
  approverSignature?: string;
  approvedBy?: { name?: string };
  approvedBySignedAsOicFor?: { name?: string } | null;
  status?: string;
  arrivalStatus?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  cancelledBy?: { name?: string };
  cancelledAt?: string;
  auditLog?: AuditTrailEvent[];
}

export interface PassSlipFormProps {
  slip: PassSlipFormSlip;
  viewerRole?: string;
  approverSignature?: string | null;
  onRedoApproverSignature?: () => void;
  onChooseSignature?: (type: SignatureType) => void;
  hasSavedSignature?: boolean;
  onUseSavedSignature?: () => void;
  approverDisplayName?: string;
  approverRoleLabel?: string;
  requesterRoleLabel?: string;
  approverCanSign?: boolean;
  onViewAuditTrail?: () => void;
  /** Optional content below fields (e.g. security timer). */
  children?: React.ReactNode;
}

const DORSU_LOGO = require('../assets/images/dorsulogo-removebg-preview (1).png');

const normalizeInline = (value: string | undefined | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const formatDate = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const formatTimeOnly = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return normalizeInline(value);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

export const requestedByRoleLabel = (viewerRole?: string, employeeRole?: string) => {
  if (employeeRole === 'Program Head') return 'Program Head';
  if (employeeRole === 'Faculty Dean') return 'Faculty Dean';
  if (viewerRole === 'Program Head') return 'Program Head';
  if (viewerRole === 'Faculty Dean') return 'Faculty Dean';
  const role = employeeRole || viewerRole;
  return formatRoleLabel(role) || 'Faculty';
};

export const approvedByRoleLabel = (viewerRole?: string, employeeRole?: string) => {
  if (employeeRole === 'Faculty Dean') return 'President';
  if (employeeRole === 'Program Head') return 'Faculty Dean';
  if (viewerRole === 'Program Head') return 'Faculty Dean';
  if (viewerRole === 'Faculty Dean') return 'President';
  return 'Immediate Head';
};

const FieldRow = ({ label, value }: { label: string; value: string }) => (
  <Text style={styles.fieldRow}>
    <Text style={styles.fieldLabel}>{label} </Text>
    <Text style={styles.fieldValue}>{value || 'N/A'}</Text>
  </Text>
);

export const PassSlipForm: React.FC<PassSlipFormProps> = ({
  slip,
  viewerRole,
  approverSignature = null,
  onRedoApproverSignature = () => {},
  onChooseSignature = () => {},
  hasSavedSignature = false,
  onUseSavedSignature,
  approverDisplayName,
  approverRoleLabel,
  requesterRoleLabel,
  approverCanSign = false,
  onViewAuditTrail,
  children,
}) => {
  const employeeRole = slip.employee?.role;
  const arrivalDisplay = formatTimeOnly(slip.arrivalTime);
  const requesterRole = requesterRoleLabel ?? requestedByRoleLabel(viewerRole, employeeRole);
  const approverRole = approverRoleLabel ?? approvedByRoleLabel(viewerRole, employeeRole);
  const approverName = approverDisplayName ?? slip.approvedBy?.name ?? ' ';
  const cancelledTimestamp = resolveCancelledTimestamp(slip.cancelledAt, slip.auditLog);

  return (
    <View style={styles.slipCard}>
      <View style={styles.docHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.rule} />
          <Text style={styles.universityName}>DAVAO ORIENTAL</Text>
          <Text style={styles.universityName}>STATE UNIVERSITY</Text>
          <Text style={styles.motto}>"A university of excellence, innovation, and inclusion"</Text>
          <View style={styles.rule} />
          <Text style={styles.headerPassSlip}>PASS SLIP</Text>
        </View>
        <Image source={DORSU_LOGO} style={styles.logo} />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          <Text style={styles.metaLabel}>Tracking No.: </Text>
          <Text style={styles.metaValue}>{normalizeInline(slip.trackingNo) || 'N/A'}</Text>
        </Text>
        <Text style={styles.metaText}>
          <Text style={styles.metaLabel}>Date: </Text>
          <Text style={styles.metaValue}>{formatDate(slip.date) || 'N/A'}</Text>
        </Text>
      </View>

      <View style={styles.mainTitleBlock}>
        <Text style={styles.mainTitle}>PASS SLIP</Text>
        <Text style={styles.subTitle}>(Within Mati City)</Text>
      </View>

      <FieldRow label="Name of Employee:" value={normalizeInline(slip.employee?.name)} />
      <FieldRow label="Time Out:" value={normalizeInline(slip.timeOut)} />
      <FieldRow label="Estimated Time to be Back:" value={normalizeInline(slip.estimatedTimeBack)} />
      {arrivalDisplay ? <FieldRow label="Actual Time Back:" value={arrivalDisplay} /> : null}
      {typeof slip.overdueMinutes === 'number' && slip.overdueMinutes > 0 ? (
        <Text style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Overdue: </Text>
          <Text style={[styles.fieldValue, styles.overdueValue]}>{Math.round(slip.overdueMinutes)} min</Text>
        </Text>
      ) : null}
      <FieldRow label="Required Vicinity:" value={normalizeInline(slip.requiredVicinity) || 'Mati City'} />
      <FieldRow label="Destination:" value={normalizeInline(slip.destination)} />
      {slip.additionalInfo != null && normalizeInline(slip.additionalInfo) !== '' ? (
        <FieldRow label="Additional Information:" value={normalizeInline(slip.additionalInfo)} />
      ) : null}
      <FieldRow label="Purpose/s:" value={normalizeInline(slip.purpose)} />

      {slip.status === 'Cancelled' ? (
        <View style={styles.auditSection}>
          <Text style={styles.auditTitle}>Cancellation Audit Trail</Text>
          <FieldRow
            label="Cancelled by:"
            value={normalizeInline(slip.cancelledBy?.name) || normalizeInline(slip.employee?.name) || 'Not recorded'}
          />
          <FieldRow
            label="Date:"
            value={cancelledTimestamp ? formatAuditDate(cancelledTimestamp) : 'Not recorded'}
          />
          <FieldRow
            label="Time:"
            value={cancelledTimestamp ? formatAuditTime(cancelledTimestamp) : 'Not recorded'}
          />
          <FieldRow
            label="Reason:"
            value={normalizeInline(slip.cancellationReason) || 'Not recorded'}
          />
          {onViewAuditTrail ? (
            <Pressable style={styles.auditTrailLink} onPress={onViewAuditTrail}>
              <Text style={styles.auditTrailLinkText}>View full audit trail</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {children}

      <View style={styles.sigRow}>
        <View style={styles.sigCol}>
          <Text style={styles.sigLabel}>Requested by:</Text>
          <View style={styles.sigBox}>
            {slip.signature ? (
              <Image source={{ uri: slip.signature }} style={styles.sigImage} />
            ) : (
              <View style={styles.sigImagePlaceholder} />
            )}
            <Text style={styles.sigName}>{normalizeInline(slip.employee?.name) || ' '}</Text>
          </View>
          <Text style={styles.sigRole}>{requesterRole}</Text>
        </View>

        <View style={styles.sigCol}>
          <Text style={styles.sigLabel}>Approved by:</Text>
          <View style={styles.sigBox}>
            {approverCanSign ? (
              approverSignature ? (
                <View style={styles.sigImageWrap}>
                  <Image source={{ uri: approverSignature }} style={styles.sigImage} />
                  <Pressable style={styles.redoButton} onPress={onRedoApproverSignature}>
                    <FontAwesome name="undo" size={16} color="#003366" />
                  </Pressable>
                </View>
              ) : (
                <SignatureActionButtons
                  onDraw={() => onChooseSignature('draw')}
                  onUpload={() => onChooseSignature('upload')}
                  onUseSaved={onUseSavedSignature}
                  hasSavedSignature={hasSavedSignature}
                  iconColor="#003366"
                  iconSize={20}
                  buttonStyle={styles.sigButton}
                  containerStyle={styles.sigButtonsRow}
                />
              )
            ) : slip.approverSignature ? (
              <Image source={{ uri: slip.approverSignature }} style={styles.sigImage} />
            ) : (
              <View style={styles.sigImagePlaceholder} />
            )}
            <Text style={styles.sigName}>{approverName}</Text>
          </View>
          <Text style={styles.sigRole}>{approverRole}</Text>
          {slip.approvedBySignedAsOicFor?.name ? (
            <Text style={styles.sigOicNote}>(OIC for {slip.approvedBySignedAsOicFor.name})</Text>
          ) : null}
        </View>
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  slipCard: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 4,
    ...Platform.select({
      ios: { fontFamily: 'Times New Roman' },
      android: { fontFamily: 'serif' },
      default: { fontFamily: 'Times New Roman' },
    }),
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  rule: {
    height: 1,
    backgroundColor: '#111',
    width: '78%',
    marginVertical: 2,
  },
  universityName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    lineHeight: 17,
    fontFamily: Platform.select({ ios: 'Arial', android: 'sans-serif', default: 'Arial' }),
  },
  motto: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#444',
    marginVertical: 2,
  },
  headerPassSlip: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
    fontFamily: Platform.select({ ios: 'Arial', android: 'sans-serif', default: 'Arial' }),
  },
  logo: {
    width: 56,
    height: 56,
    resizeMode: 'contain',
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: '#000',
  },
  metaLabel: {
    fontWeight: '700',
  },
  metaValue: {
    fontWeight: '400',
  },
  mainTitleBlock: {
    alignItems: 'center',
    marginBottom: 14,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
    textDecorationLine: 'underline',
    letterSpacing: 0.5,
  },
  subTitle: {
    fontSize: 12,
    color: '#000',
    marginTop: 4,
  },
  fieldRow: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
    color: '#000',
  },
  fieldLabel: {
    fontWeight: '700',
    color: '#000',
  },
  fieldValue: {
    fontWeight: '400',
    color: '#000',
  },
  overdueValue: {
    color: '#c53030',
  },
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 16,
  },
  sigCol: {
    flex: 1,
    maxWidth: '48%',
  },
  sigLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  sigBox: {
    minHeight: 58,
    justifyContent: 'flex-end',
  },
  sigImageWrap: {
    alignItems: 'center',
    marginBottom: 2,
  },
  sigImage: {
    width: 100,
    height: 44,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 2,
  },
  sigImagePlaceholder: {
    height: 36,
  },
  sigButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 4,
  },
  sigButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  redoButton: {
    position: 'absolute',
    right: -8,
    top: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  sigName: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderColor: '#111',
    paddingBottom: 2,
    color: '#000',
  },
  sigRole: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    color: '#333',
  },
  sigOicNote: {
    fontSize: 8,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 2,
    color: '#444',
  },
  auditSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
  },
  auditTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  auditTrailLink: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  auditTrailLinkText: {
    fontSize: 12,
    color: '#003366',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

export default PassSlipForm;
