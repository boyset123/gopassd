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

type SignatureType = 'draw' | 'upload';

export interface PassSlipFormSlip {
  employee?: { name?: string; role?: string };
  timeOut?: string;
  estimatedTimeBack?: string;
  arrivalTime?: string;
  overdueMinutes?: number;
  destination?: string;
  purpose?: string;
  signature?: string;
  approverSignature?: string;
  approvedBy?: { name?: string };
  approvedBySignedAsOicFor?: { name?: string } | null;
  status?: string;
  rejectionReason?: string;
}

export interface PassSlipFormProps {
  slip: PassSlipFormSlip;
  viewerRole?: string;
  approverSignature?: string | null;
  onRedoApproverSignature?: () => void;
  onChooseSignature?: (type: SignatureType) => void;
  /** Name shown on the approver line when signing (defaults to approvedBy.name). */
  approverDisplayName?: string;
  /** Role label under approver signature (overrides viewerRole-based default). */
  approverRoleLabel?: string;
  /** Role label under requester signature (overrides viewerRole-based default). */
  requesterRoleLabel?: string;
  showStatusOverlay?: boolean;
  /** When true, show draw/upload controls in the Approved By section. */
  approverCanSign?: boolean;
}

const DORSU_BLUE = '#003366';

const normalizeInline = (value: string | undefined | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const formatTimeOnly = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return normalizeInline(value);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

export const requestedByRoleLabel = (viewerRole?: string) => {
  if (viewerRole === 'Program Head') return 'Program Head';
  if (viewerRole === 'Faculty Dean') return 'Faculty Dean';
  return 'Faculty Staff';
};

export const approvedByRoleLabel = (viewerRole?: string) => {
  if (viewerRole === 'Program Head') return 'Faculty Dean';
  if (viewerRole === 'Faculty Dean') return 'President';
  return 'Immediate Head';
};

const FieldRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.fieldRow}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue}>{value || ' '}</Text>
  </View>
);

export const PassSlipForm: React.FC<PassSlipFormProps> = ({
  slip,
  viewerRole,
  approverSignature = null,
  onRedoApproverSignature = () => {},
  onChooseSignature = () => {},
  approverDisplayName,
  approverRoleLabel,
  requesterRoleLabel,
  showStatusOverlay = true,
  approverCanSign = false,
}) => {
  const approved =
    slip.status === 'Approved' || slip.status === 'Completed' || slip.status === 'Verified';
  const rejected = slip.status === 'Rejected';
  const arrivalDisplay = formatTimeOnly(slip.arrivalTime);
  const requesterRole = requesterRoleLabel ?? requestedByRoleLabel(viewerRole);
  const approverRole = approverRoleLabel ?? approvedByRoleLabel(viewerRole);
  const approverName = approverDisplayName ?? slip.approvedBy?.name ?? ' ';

  return (
    <View style={styles.slipCard}>
      <View style={styles.docHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.blueLine} />
          <Text style={styles.universityName}>DAVAO ORIENTAL STATE UNIVERSITY</Text>
          <View style={styles.doubleLine}>
            <View style={styles.doubleLineThick} />
            <View style={styles.doubleLineThin} />
          </View>
          <Text style={styles.motto}>"A university of excellence, innovation, and inclusion"</Text>
          <Text style={styles.headerPassSlip}>PASS SLIP</Text>
        </View>
        <Image
          source={require('../assets/images/dorsulogo-removebg-preview (1).png')}
          style={styles.logo}
        />
      </View>

      <View style={styles.headerRule} />

      <View style={styles.mainTitleBlock}>
        <Text style={styles.mainTitle}>PASS SLIP</Text>
        <Text style={styles.subTitle}>(Within Mati City)</Text>
      </View>

      <FieldRow label="Name of Employee:" value={normalizeInline(slip.employee?.name)} />
      <FieldRow label="Time Out:" value={normalizeInline(slip.timeOut)} />
      <FieldRow label="Estimated Time to be Back:" value={normalizeInline(slip.estimatedTimeBack)} />
      {arrivalDisplay ? (
        <FieldRow label="Actual Time Back:" value={arrivalDisplay} />
      ) : null}
      {typeof slip.overdueMinutes === 'number' && slip.overdueMinutes > 0 ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Overdue:</Text>
          <Text style={[styles.fieldValue, styles.overdueValue]}>{Math.round(slip.overdueMinutes)} min</Text>
        </View>
      ) : null}
      <FieldRow label="Destination:" value={normalizeInline(slip.destination)} />
      <FieldRow label="Purpose/s:" value={normalizeInline(slip.purpose)} />

      {showStatusOverlay && approved ? (
        <View style={styles.statusStampWrap} pointerEvents="none">
          <Text style={styles.approvedStamp}>APPROVED</Text>
        </View>
      ) : null}
      {showStatusOverlay && rejected ? (
        <View style={styles.statusStampWrap} pointerEvents="none">
          <Text style={styles.rejectedStamp}>REJECTED</Text>
        </View>
      ) : null}

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
          <Text style={styles.sigLabel}>Approved By:</Text>
          <View style={styles.sigBox}>
            {approverCanSign ? (
              approverSignature ? (
                <View style={styles.sigImageWrap}>
                  <Image source={{ uri: approverSignature }} style={styles.sigImage} />
                  <Pressable style={styles.redoButton} onPress={onRedoApproverSignature}>
                    <FontAwesome name="undo" size={16} color={DORSU_BLUE} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.sigButtonsRow}>
                  <Pressable style={styles.sigButton} onPress={() => onChooseSignature('draw')}>
                    <FontAwesome name="pencil" size={20} color={DORSU_BLUE} />
                  </Pressable>
                  <Pressable style={styles.sigButton} onPress={() => onChooseSignature('upload')}>
                    <FontAwesome name="upload" size={20} color={DORSU_BLUE} />
                  </Pressable>
                </View>
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

      <View style={styles.footerNotes}>
        <Text style={styles.footerNote}>1 copy to security guard on duty</Text>
        <Text style={styles.footerNote}>1 copy to be attached to DTR/FSR</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  slipCard: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#fff',
    padding: 12,
    ...Platform.select({
      ios: { fontFamily: 'Arial' },
      android: { fontFamily: 'sans-serif' },
      default: { fontFamily: 'Arial, Helvetica, sans-serif' },
    }),
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  blueLine: {
    height: 2,
    backgroundColor: DORSU_BLUE,
    width: '88%',
    marginBottom: 4,
  },
  universityName: {
    fontSize: 11,
    fontWeight: '700',
    color: DORSU_BLUE,
    lineHeight: 14,
  },
  doubleLine: {
    marginVertical: 3,
    width: '88%',
  },
  doubleLineThick: {
    height: 2,
    backgroundColor: DORSU_BLUE,
    marginBottom: 1,
  },
  doubleLineThin: {
    height: 1,
    backgroundColor: DORSU_BLUE,
  },
  motto: {
    fontSize: 8,
    fontStyle: 'italic',
    color: DORSU_BLUE,
    marginBottom: 4,
  },
  headerPassSlip: {
    fontSize: 10,
    fontWeight: '700',
    color: DORSU_BLUE,
    textDecorationLine: 'underline',
  },
  logo: {
    width: 52,
    height: 52,
    resizeMode: 'contain',
    flexShrink: 0,
  },
  headerRule: {
    height: 2,
    backgroundColor: DORSU_BLUE,
    marginVertical: 8,
  },
  mainTitleBlock: {
    alignItems: 'center',
    marginBottom: 12,
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
  subTitle: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#000',
    marginTop: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#000',
    flexShrink: 0,
  },
  fieldValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
    borderBottomWidth: 1,
    borderColor: '#000',
    paddingBottom: 1,
    minHeight: 16,
  },
  overdueValue: {
    color: '#c53030',
  },
  statusStampWrap: {
    position: 'absolute',
    top: '42%',
    left: '18%',
    right: '18%',
    alignItems: 'center',
    zIndex: 10,
    transform: [{ rotate: '-18deg' }],
  },
  approvedStamp: {
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(47, 133, 90, 0.75)',
    borderWidth: 3,
    borderColor: 'rgba(47, 133, 90, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  rejectedStamp: {
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(197, 48, 48, 0.75)',
    borderWidth: 3,
    borderColor: 'rgba(197, 48, 48, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  sigCol: {
    flex: 1,
    maxWidth: '48%',
  },
  sigLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
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
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderColor: '#000',
    paddingBottom: 2,
    color: '#000',
  },
  sigRole: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
    color: '#000',
  },
  sigOicNote: {
    fontSize: 8,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 2,
    color: '#444',
  },
  footerNotes: {
    marginTop: 12,
  },
  footerNote: {
    fontSize: 8,
    color: '#000',
    lineHeight: 12,
  },
});

export default PassSlipForm;
