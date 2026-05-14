import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, Pressable, useWindowDimensions, ActivityIndicator, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { API_URL } from '../config/api';

type SignatureType = 'draw' | 'upload';

interface Employee {
  _id?: string;
  id?: string;
  name?: string;
  role?: string;
}

interface Recommender {
  id?: string;
  _id?: string;
  name: string;
}

type UserRef = string | { _id?: string; name?: string; role?: string } | undefined | null;

interface TravelOrder {
  _id: string;
  employee: Employee;
  purpose: string;
  to: string;
  date: string;
  travelOrderNo: string;
  employeeAddress?: string;
  salary: string;
  departureDate: string;
  arrivalDate: string;
  additionalInfo: string;
  recommendedBy: Recommender[];
  recommenderSignatures?: { user: UserRef; signature: string; date: string; signedAsOicFor?: UserRef }[];
  recommendersWhoApproved?: string[];
  approverSignature?: string;
  /** President’s signature image when not in signing mode (e.g. view-only modal). */
  presidentSignature?: string;
  /** Populated when the President's slot was signed by an OIC standing in for them. */
  presidentSignedAsOicFor?: { _id: string; name?: string; role?: string } | null;
  /** Populated when the President's slot was signed (could be original or OIC). */
  presidentApprovedBy?: { _id: string; name?: string; role?: string } | null;
  participants?: string[];
  /** Supporting proof (metadata only); API may return this alone or with `documents`. */
  document?: { name?: string; contentType?: string } | null;
  /** Multiple supporting files (metadata only). */
  documents?: { name?: string; contentType?: string }[] | null;
}

function supportingAttachmentMetaList(order: Pick<TravelOrder, 'documents' | 'document'>): {
  name?: string;
  contentType?: string;
}[] {
  if (Array.isArray(order.documents) && order.documents.length > 0) {
    return order.documents.filter((d) => d && (d.name || d.contentType));
  }
  if (order.document && (order.document.name || order.document.contentType)) {
    return [order.document];
  }
  return [];
}

function fileExtFromMeta(contentType: string | undefined, fileName: string | undefined): string {
  const nameLower = (fileName || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('pdf') || nameLower.endsWith('.pdf')) return 'pdf';
  if (ct.includes('wordprocessingml') || ct.includes('officedocument') || nameLower.endsWith('.docx')) return 'docx';
  if (ct.includes('png') || nameLower.endsWith('.png')) return 'png';
  if (ct.includes('webp') || nameLower.endsWith('.webp')) return 'webp';
  return 'jpg';
}

function mimeFromExt(ext: string, contentType?: string): string {
  if (contentType) return contentType;
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return `image/${ext}`;
}

interface TravelOrderFormProps {
  order: TravelOrder;
  presidentName: string;
  currentUserId?: string;
  approverSignature: string | null;
  onRedoApproverSignature: () => void;
  onChooseSignature: (type: SignatureType) => void;
  /** When true, show draw/upload controls in the APPROVED BY (President) section. */
  presidentCanSign?: boolean;
}

const formatDate = (dateString: string, includeTime = false) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  const base = `${month} ${day}, ${year}`;

  if (!includeTime) return base;

  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${base} : ${time}`;
};

const formatSalary = (salary: string | undefined) =>
  !salary ? '' : salary.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const normalizeInline = (value: string | undefined | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const formatNamesList = (names: string[]): string => {
  const filtered = names.map(normalizeInline).filter(Boolean);
  const count = filtered.length;
  if (count === 0) return '';
  if (count === 1) return filtered[0];
  if (count === 2) return `${filtered[0]} & ${filtered[1]}`;
  const allButLast = filtered.slice(0, -1).join(', ');
  const last = filtered[count - 1];
  return `${allButLast} & ${last}`;
};

const formatTravelOrderNoDisplay = (travelOrderNo: string | undefined, dateString: string | undefined) => {
  const no = normalizeInline(travelOrderNo);
  if (no) return no;

  const date = new Date(dateString || '');
  if (Number.isNaN(date.getTime())) return 'TBD';

  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm} - ____ - ${yy}`;
};

export const TravelOrderForm: React.FC<TravelOrderFormProps> = ({
  order,
  presidentName,
  currentUserId,
  approverSignature,
  onRedoApproverSignature,
  onChooseSignature,
  presidentCanSign = false,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const a4PageWidth = Math.min(windowWidth - 32, 420);

  const [generatedTravelOrderNo, setGeneratedTravelOrderNo] = useState<string>('');
  const [openingSupportingIndex, setOpeningSupportingIndex] = useState<number | null>(null);

  const attachmentMeta = useMemo(() => supportingAttachmentMetaList(order), [order.documents, order.document]);

  const hasSupportingDocument = attachmentMeta.length > 0;

  const openSupportingDocumentAtIndex = useCallback(
    async (fileIndex: number) => {
      if (!order._id || fileIndex < 0 || fileIndex >= attachmentMeta.length) return;
      const meta = attachmentMeta[fileIndex];
      setOpeningSupportingIndex(fileIndex);
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          Alert.alert('Session', 'You are not logged in.');
          return;
        }
        const ext = fileExtFromMeta(meta.contentType, meta.name);
        const url = `${API_URL}/travel-orders/${order._id}/supporting-document?index=${fileIndex}`;
        const destFile = new File(Paths.cache, `to-support-${order._id}-${fileIndex}.${ext}`);
        let localFile: File;
        try {
          localFile = await File.downloadFileAsync(url, destFile, {
            headers: { 'x-auth-token': token },
            idempotent: true,
          });
        } catch {
          Alert.alert('Could not open', 'The file may be missing or you may not have permission to view it.');
          return;
        }
        const mime = mimeFromExt(ext, meta.contentType);
        // expo-sharing only accepts file:// URIs, not Android content:// (see ExpoSharing.shareAsync).
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(localFile.uri, {
            mimeType: mime,
            dialogTitle: meta.name || `Attachment ${fileIndex + 1}`,
          });
        } else {
          Alert.alert('Downloaded', 'Sharing is not available on this device; the file was saved to app cache.');
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Could not open the supporting document.');
      } finally {
        setOpeningSupportingIndex(null);
      }
    },
    [order._id, attachmentMeta]
  );

  const dateForNo = useMemo(() => {
    const d = new Date(order.date || '');
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [order.date]);

  const monthKey = useMemo(() => {
    const yyyy = dateForNo.getFullYear();
    const mm = String(dateForNo.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }, [dateForNo]);

  useEffect(() => {
    let cancelled = false;

    const ensureTravelOrderNo = async () => {
      // If backend already provided one, don't generate.
      if (normalizeInline(order.travelOrderNo)) {
        if (!cancelled) setGeneratedTravelOrderNo('');
        return;
      }

      // Need a stable id to prevent re-numbering the same record.
      const orderId = normalizeInline(order._id);
      if (!orderId) return;

      const storageKey = `travelOrderNoSeq:${monthKey}`;
      const raw = await AsyncStorage.getItem(storageKey);

      const parsed: { lastSeq: number; map: Record<string, number> } = raw
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return { lastSeq: 0, map: {} };
            }
          })()
        : { lastSeq: 0, map: {} };

      const existingSeq = parsed.map?.[orderId];
      const seq = typeof existingSeq === 'number' && existingSeq > 0 ? existingSeq : parsed.lastSeq + 1;

      const yyyy = dateForNo.getFullYear();
      const mm = String(dateForNo.getMonth() + 1).padStart(2, '0');
      const yy = String(yyyy).slice(-2);
      const seq4 = String(seq).padStart(4, '0');
      const fullNo = `${mm} - ${seq4} - ${yy}`;

      if (!cancelled) setGeneratedTravelOrderNo(fullNo);

      // Persist assignment so it remains stable per order id.
      if (!existingSeq) {
        const next = {
          lastSeq: seq,
          map: { ...(parsed.map || {}), [orderId]: seq },
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      }
    };

    void ensureTravelOrderNo();

    return () => {
      cancelled = true;
    };
  }, [order._id, order.travelOrderNo, monthKey, dateForNo]);

  const toNames = [
    order.employee?.name || '',
    ...(order.participants || []).filter((p) => !!p),
  ];

  return (
    <View style={styles.a4Stack}>
      <View style={[styles.a4Page, { width: a4PageWidth }]}>
        <View style={styles.docHeader}>
          <View style={styles.universityNameContainer}>
            <View style={styles.headerRule} />
            <Text style={styles.universityName}>
              DAVAO ORIENTAL{'\n'}STATE UNIVERSITY
            </Text>
            <Text style={styles.universityMotto}>"A University of excellence, innovation, and inclusion"</Text>
            <View style={styles.headerRule} />
          </View>
          <Image source={require('../assets/images/dorsulogo.png')} style={styles.logo} />
          <View style={styles.docCodeCard}>
            <View style={styles.docCodeTopBar}>
              <Text style={styles.docCodeTopBarText}>Document Code No.</Text>
            </View>
            <View style={styles.docCodeValueRow}>
              <Text style={styles.docCodeValueText}>FM-DOrSU-HRMO-01</Text>
            </View>
            <View style={styles.docCodeTable}>
              <View style={styles.docCodeTableHeaderRow}>
                <Text style={styles.docCodeTableHeaderCell}>Issue Status</Text>
                <Text style={[styles.docCodeTableHeaderCell, styles.docCodeTableNarrowCol]}>Rev No.</Text>
                <Text style={styles.docCodeTableHeaderCell}>Effective Date</Text>
                <Text style={[styles.docCodeTableHeaderCell, styles.docCodeTableNarrowCol, styles.docCodeTableLastCell]}>Page No.</Text>
              </View>
              <View style={styles.docCodeTableValueRow}>
                <Text style={styles.docCodeTableValueCell}>01</Text>
                <Text style={[styles.docCodeTableValueCell, styles.docCodeTableNarrowCol]}>00</Text>
                <Text style={styles.docCodeTableValueCell}>07.22.2022</Text>
                <Text style={[styles.docCodeTableValueCell, styles.docCodeTableNarrowCol, styles.docCodeTableLastCell]}>1 of 1</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.docTitle}>TRAVEL ORDER FORM</Text>
        <Text style={styles.revisedText}>Revised 1996</Text>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Travel Order No.</Text>
          <Text style={[styles.formValueUnderlined, styles.formValueTravelOrderNo]}>
            {normalizeInline(order.travelOrderNo) || generatedTravelOrderNo || formatTravelOrderNoDisplay(order.travelOrderNo, order.date)}
          </Text>
          <View style={styles.formDateRight}>
            <Text style={styles.formLabelDate}>Date</Text>
            <Text style={styles.formValueDate}>{formatDate(order.date)}</Text>
          </View>
        </View>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>TO:</Text>
          <Text style={styles.formValueUnderlined}>{formatNamesList(toNames)}</Text>
        </View>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>POSITION:</Text>
          <Text style={styles.formValueUnderlined}>{order.employee?.role}</Text>
        </View>
        <View style={styles.addressSalaryRow}>
          <View style={styles.addressGroup}>
            <Text style={styles.formLabel}>ADDRESS:</Text>
            <Text style={styles.formValueUnderlined}>{normalizeInline(order.employeeAddress)}</Text>
          </View>
          <View style={styles.salaryGroup}>
            <Text style={styles.formLabelSalary}>SALARY:</Text>
            <Text style={styles.salaryValue}>₱{formatSalary(order.salary)}</Text>
          </View>
        </View>

        <Text style={styles.directiveText}>You are hereby directed to travel on official business:</Text>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>TO:</Text>
          <Text style={styles.formValueUnderlined}>{normalizeInline(order.to)}</Text>
        </View>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>PURPOSE/S:</Text>
          <Text style={styles.formValueUnderlined}>{normalizeInline(order.purpose)}</Text>
        </View>

        <Text style={styles.directiveText}>You will leave and return to your official station</Text>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Date of Departure:</Text>
          <Text style={styles.formValueUnderlined}>{formatDate(order.departureDate, true)}</Text>
        </View>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Date of Arrival:</Text>
          <Text style={styles.formValueUnderlined}>{formatDate(order.arrivalDate, true)}</Text>
        </View>

        <Text style={styles.infoText}>
          You shall be guided further by the following additional instruction and information on{' '}
          <Text style={styles.inlineUnderlinedText}>{normalizeInline(order.additionalInfo)}</Text>
        </Text>
        <Text style={styles.infoText}>
          Upon completion of your travel, you are required to submit your full report through proper channel; no travel order shall be issued for the succeeding work unless a copy of your accomplishment in the immediate past is herewith attached or presented.
        </Text>

        {hasSupportingDocument ? (
          <View style={styles.supportingAttachmentsBlock}>
            {attachmentMeta.map((meta, i) => (
              <View key={`${meta.name || 'file'}-${i}`} style={styles.supportingDocBanner}>
                <FontAwesome name="paperclip" size={12} color="#011a6b" style={{ marginRight: 6 }} />
                <Text style={styles.supportingDocLabel} numberOfLines={1}>
                  {meta.name || `Attachment ${i + 1}`}
                </Text>
                <Pressable
                  onPress={() => void openSupportingDocumentAtIndex(i)}
                  disabled={openingSupportingIndex !== null}
                  style={({ pressed }) => [styles.supportingDocViewBtn, pressed && styles.supportingDocViewBtnPressed]}
                >
                  {openingSupportingIndex === i ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.supportingDocViewBtnText}>View</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.signatureSection}>
          {(order.recommendedBy || []).map((recommender, index) => {
            const currentApprovedCount = order.recommendersWhoApproved?.length || 0;
            const recommenderId = String(recommender._id || recommender.id || '');
            const hasSigned = order.recommendersWhoApproved?.some(id => String(id) === recommenderId);
            const isUserCandidate = !!currentUserId && (String(recommender._id || recommender.id) === String(currentUserId));
            const isTurn = index === currentApprovedCount && isUserCandidate;
            // Find the actual signature record for this slot (matched by signedAsOicFor for OIC, or user for direct signers).
            const sigRecord = order.recommenderSignatures?.find(rs => {
              const oic = typeof rs.signedAsOicFor === 'object' ? rs.signedAsOicFor?._id : rs.signedAsOicFor;
              if (oic && String(oic) === recommenderId) return true;
              const u = typeof rs.user === 'object' ? rs.user?._id : rs.user;
              return String(u || '') === recommenderId;
            });
            const existingSignature =
              sigRecord?.signature ||
              (index === 0 ? (order.approverSignature || null) : null);

            // Display name: if signed by OIC, show OIC's name; else show original recommender's name.
            const oicSignedFor = sigRecord?.signedAsOicFor;
            const oicSignedForName = typeof oicSignedFor === 'object' ? oicSignedFor?.name : null;
            const oicSigner = sigRecord?.user;
            const oicSignerName = typeof oicSigner === 'object' ? oicSigner?.name : null;
            const isOicSigned = !!oicSignedForName;
            const displayName = isOicSigned ? (oicSignerName || recommender.name) : recommender.name;

            return (
              <View key={recommenderId || `${recommender.name}-${index}`} style={styles.signatureBlockLeft}>
                <Text style={styles.signatureHeader}>RECOMMENDED BY {index + 1}:</Text>
                <View style={styles.docSignatureDisplay}>
                  {hasSigned && existingSignature ? (
                    <View style={styles.signatureImageContainer}>
                      <Image source={{ uri: existingSignature }} style={styles.docSignatureImage} />
                    </View>
                  ) : isTurn ? (
                    approverSignature ? (
                      <View style={styles.signatureImageContainer}>
                        <Image source={{ uri: approverSignature }} style={styles.docSignatureImage} />
                        <Pressable style={styles.redoButton} onPress={onRedoApproverSignature}>
                          <FontAwesome name="undo" size={18} color="#003366" />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.signatureButtonsContainer}>
                        <Pressable style={styles.signatureButton} onPress={() => onChooseSignature('draw')}>
                          <FontAwesome name="pencil" size={24} color="#003366" />
                        </Pressable>
                        <Pressable style={styles.signatureButton} onPress={() => onChooseSignature('upload')}>
                          <FontAwesome name="upload" size={24} color="#003366" />
                        </Pressable>
                      </View>
                    )
                  ) : (
                    <View style={styles.placeholderSignature}>
                      <Text style={styles.placeholderText}>
                        {index < currentApprovedCount ? 'Signed' : index === currentApprovedCount ? 'Waiting for turn' : 'Pending'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.signatureNameContainer}>
                    <Text style={styles.signatureName}>{displayName}</Text>
                  </View>
                </View>
                <Text style={styles.signatureTitle}>Immediate Chief</Text>
                {isOicSigned && (
                  <Text style={styles.oicNote}>(OIC for {oicSignedForName})</Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlockLeft}>
            <Text style={styles.signatureHeader}>APPROVED BY:</Text>
            <View style={styles.docSignatureDisplay}>
              {presidentCanSign ? (
                approverSignature ? (
                  <View style={styles.signatureImageContainer}>
                    <Image source={{ uri: approverSignature }} style={styles.docSignatureImage} />
                    <Pressable style={styles.redoButton} onPress={onRedoApproverSignature}>
                      <FontAwesome name="undo" size={18} color="#003366" />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.signatureButtonsContainer}>
                    <Pressable style={styles.signatureButton} onPress={() => onChooseSignature('draw')}>
                      <FontAwesome name="pencil" size={24} color="#003366" />
                    </Pressable>
                    <Pressable style={styles.signatureButton} onPress={() => onChooseSignature('upload')}>
                      <FontAwesome name="upload" size={24} color="#003366" />
                    </Pressable>
                  </View>
                )
              ) : order.presidentSignature ? (
                <View style={styles.signatureImageContainer}>
                  <Image source={{ uri: order.presidentSignature }} style={styles.docSignatureImage} />
                </View>
              ) : null}
              <View style={styles.signatureNameContainer}>
                <Text style={styles.signatureName}>
                  {order.presidentSignedAsOicFor && order.presidentApprovedBy?.name
                    ? order.presidentApprovedBy.name
                    : presidentName}
                </Text>
              </View>
            </View>
            <Text style={styles.signatureTitle}>President</Text>
            {order.presidentSignedAsOicFor?.name && (
              <Text style={styles.oicNote}>(OIC for {order.presidentSignedAsOicFor.name})</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  a4Stack: {
    alignItems: 'center',
  },
  a4Page: {
    backgroundColor: '#fff',
    aspectRatio: 1 / 1.65421356237,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 10,
    overflow: 'hidden',
  },
  docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  universityNameContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: 6,
  },
  headerRule: {
    height: 2,
    width: '92%',
    backgroundColor: '#7f93ad',
    marginVertical: 3,
  },
  universityName: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'left',
    color: '#8da2bf',
    lineHeight: 14,
    letterSpacing: 0.25,
  },
  universityMotto: {
    fontSize: 5,
    textAlign: 'left',
    color: '#6f7f95',
    fontStyle: 'italic',
    marginTop: 2,
  },
  logo: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
    marginHorizontal: 16,
  },
  docCodeCard: {
    width: 110,
    borderWidth: 1,
    borderColor: '#616a78',
    backgroundColor: '#fff',
  },
  docCodeTopBar: {
    backgroundColor: '#7c879a',
    paddingVertical: 1,
    paddingHorizontal: 3,
    borderBottomWidth: 1,
    borderColor: '#616a78',
  },
  docCodeTopBarText: {
    fontSize: 4,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  docCodeValueRow: {
    paddingVertical: 2,
    paddingHorizontal: 3,
    borderBottomWidth: 1,
    borderColor: '#616a78',
  },
  docCodeValueText: {
    fontSize: 6,
    fontWeight: '800',
    textAlign: 'center',
    color: '#6c6c6c',
    lineHeight: 6,
  },
  docCodeTable: {
    borderTopWidth: 0,
  },
  docCodeTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#7c879a',
    borderBottomWidth: 1,
    borderColor: '#616a78',
  },
  docCodeTableValueRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
  },
  docCodeTableHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 4,
    fontWeight: 'bold',
    color: '#fff',
    paddingVertical: 1,
    borderRightWidth: 1,
    borderColor: '#616a78',
  },
  docCodeTableValueCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 3,
    fontWeight: 'bold',
    color: '#666',
    paddingVertical: 1,
    borderRightWidth: 1,
    borderColor: '#616a78',
  },
  docCodeTableLastCell: {
    borderRightWidth: 0,
  },
  docCodeTableNarrowCol: {
    flex: 0.6,
  },
  docTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 14,
    marginVertical: 4,
    textDecorationLine: 'underline',
  },
  revisedText: {
    textAlign: 'left',
    fontSize: 9,
    marginBottom: 6,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  addressSalaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    width: '100%',
  },
  addressGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  salaryGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  formLabelSalary: {
    fontSize: 9,
    marginRight: 5,
  },
  formLabel: {
    fontSize: 9,
    marginRight: 5,
  },
  /** Keeps Date label + value flush to the right edge of the row (no flex gap after the value). */
  formDateRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  formLabelDate: {
    fontSize: 9,
    marginRight: 5,
  },
  formValueDate: {
    fontSize: 9,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  formValueTravelOrderNo: {
    minWidth: 0,
  },
  formValueUnderlined: {
    fontSize: 9,
    fontWeight: 'bold',
    flex: 1,
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  salaryValue: {
    fontSize: 9,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  directiveText: {
    fontSize: 9,
    marginVertical: 6,
  },
  infoText: {
    fontSize: 9,
    marginBottom: 4,
  },
  inlineUnderlinedText: {
    fontSize: 9,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  supportingAttachmentsBlock: {
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
  },
  supportingDocBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(1,26,107,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.2)',
  },
  supportingDocLabel: {
    flex: 1,
    fontSize: 8,
    fontWeight: '600',
    color: '#011a6b',
  },
  supportingDocViewBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#011a6b',
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportingDocViewBtnPressed: {
    opacity: 0.88,
  },
  supportingDocViewBtnText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  signatureSection: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  signatureBlockLeft: {
    marginBottom: 12,
    flexBasis: '32%',
    maxWidth: '32%',
    alignItems: 'flex-start',
  },
  signatureHeader: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  signatureTitle: {
    fontSize: 8,
    marginTop: 2,
  },
  docSignatureDisplay: {
    position: 'relative',
    width: 80,
    minHeight: 42,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  signatureImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docSignatureImage: {
    width: 120,
    height: 48,
    resizeMode: 'contain',
  },
  signatureButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  signatureButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redoButton: {
    position: 'absolute',
    right: -25,
    top: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderSignature: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 8,
    color: '#667085',
    fontWeight: '600',
  },
  signatureNameContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderColor: '#000',
  },
  signatureName: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  oicNote: {
    fontSize: 7,
    fontStyle: 'italic',
    color: '#444',
    marginTop: 1,
  },
});

export default TravelOrderForm;

