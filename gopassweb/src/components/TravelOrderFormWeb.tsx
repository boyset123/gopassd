import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Image, Pressable, useWindowDimensions, ActivityIndicator, Alert, Platform, Linking } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

type WebUserRef = string | { _id?: string; name?: string; role?: string } | null | undefined;

/** Order shape for web HR viewing (extends mobile fields + API extras) */
export interface TravelOrderWebOrder {
  _id: string;
  employee: Employee;
  purpose: string;
  to: string;
  date: string;
  travelOrderNo?: string;
  employeeAddress?: string;
  salary: string;
  departureDate: string;
  arrivalDate: string;
  additionalInfo: string;
  recommendedBy?: Recommender[];
  recommenderSignatures?: { user?: WebUserRef; signature?: string; date?: string; signedAsOicFor?: WebUserRef }[];
  recommendersWhoApproved?: string[];
  approverSignature?: string;
  participants?: string[];
  presidentSignature?: string;
  presidentApprovedBy?: { _id?: string; name?: string };
  presidentSignedAsOicFor?: { _id?: string; name?: string } | null;
  approvedBy?: { _id?: string; name?: string };
  latitude?: number;
  longitude?: number;
  document?: { name?: string; contentType?: string } | null;
  documents?: { name?: string; contentType?: string }[] | null;
}

export interface TravelOrderFormWebProps {
  order: TravelOrderWebOrder;
  presidentName: string;
  /** Default true on web: no draft TO# from AsyncStorage; signatures read-only */
  viewOnly?: boolean;
  /** When provided, Travel Order No. shows this (e.g. HR typing before approve). Omit to use order value. */
  travelOrderNoDraft?: string;
  onViewMap?: () => void;
  currentUserId?: string;
  approverSignature?: string | null;
  onRedoApproverSignature?: () => void;
  onChooseSignature?: (type: SignatureType) => void;
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

export const TravelOrderFormWeb: React.FC<TravelOrderFormWebProps> = ({
  order,
  presidentName,
  viewOnly = true,
  travelOrderNoDraft,
  onViewMap,
  currentUserId,
  approverSignature = null,
  onRedoApproverSignature = () => {},
  onChooseSignature = () => {},
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const a4PageWidth = Math.min(Math.max(windowWidth - 48, 280), 440);

  const [generatedTravelOrderNo, setGeneratedTravelOrderNo] = useState<string>('');
  const [supportingDocLoadingIndex, setSupportingDocLoadingIndex] = useState<number | null>(null);
  /** Web-only: blob URLs for image attachment previews */
  const [supportingThumbUris, setSupportingThumbUris] = useState<string[]>([]);
  const supportingThumbBlobsRef = useRef<string[]>([]);

  const supportingMetaList = useMemo(() => {
    const docs = order.documents;
    if (Array.isArray(docs) && docs.length > 0) {
      return docs.map((d, i) => ({
        name: normalizeInline(d?.name) || normalizeInline((d as { filename?: string })?.filename) || `Attachment ${i + 1}`,
        contentType: d?.contentType || (d as { type?: string })?.type,
      }));
    }
    if (order.document && (order.document.name || order.document.contentType)) {
      return [
        {
          name: normalizeInline(order.document.name) || 'Attachment',
          contentType: order.document.contentType,
        },
      ];
    }
    return [];
  }, [order.documents, order.document]);

  const hasSupportingDocument = supportingMetaList.length > 0;

  useEffect(() => {
    supportingThumbBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
    supportingThumbBlobsRef.current = [];
    setSupportingThumbUris([]);

    if (Platform.OS !== 'web' || typeof window === 'undefined' || !order._id || supportingMetaList.length === 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token || cancelled) return;
        const uris: string[] = [];
        for (let i = 0; i < supportingMetaList.length; i++) {
          const ct = (supportingMetaList[i].contentType || '').toLowerCase();
          if (!ct.startsWith('image/')) {
            uris.push('');
            continue;
          }
          try {
            const res = await fetch(
              `${API_URL}/travel-orders/${order._id}/supporting-document?index=${i}`,
              { headers: { 'x-auth-token': token } }
            );
            if (!res.ok || cancelled) {
              uris.push('');
              continue;
            }
            const blob = await res.blob();
            const u = URL.createObjectURL(blob);
            supportingThumbBlobsRef.current.push(u);
            uris.push(u);
          } catch {
            uris.push('');
          }
        }
        if (!cancelled) setSupportingThumbUris(uris);
      } catch {
        if (!cancelled) setSupportingThumbUris([]);
      }
    })();

    return () => {
      cancelled = true;
      supportingThumbBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      supportingThumbBlobsRef.current = [];
    };
  }, [order._id, supportingMetaList]);

  const openSupportingDocumentAtIndex = useCallback(
    async (fileIndex: number) => {
      if (!order._id || fileIndex < 0 || fileIndex >= supportingMetaList.length) return;
      setSupportingDocLoadingIndex(fileIndex);

      // Browsers block window.open() after an await unless a tab was opened in the same synchronous
      // user gesture. Open a placeholder first, then navigate it to the blob URL once the file loads.
      let preOpenedTab: Window | null = null;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        preOpenedTab = window.open('about:blank', '_blank', 'noopener,noreferrer');
      }

      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          if (preOpenedTab && !preOpenedTab.closed) preOpenedTab.close();
          Alert.alert('Session', 'You are not logged in.');
          return;
        }
        const res = await fetch(
          `${API_URL}/travel-orders/${order._id}/supporting-document?index=${fileIndex}`,
          {
            headers: { 'x-auth-token': token },
          }
        );
        if (!res.ok) {
          if (preOpenedTab && !preOpenedTab.closed) preOpenedTab.close();
          let detail = '';
          try {
            detail = (await res.text()).trim().slice(0, 240);
          } catch {
            /* ignore */
          }
          Alert.alert(
            'Could not open',
            detail
              ? `Server responded (${res.status}): ${detail}`
              : `HTTP ${res.status}. The file may be missing or you may not have permission to view it.`
          );
          return;
        }
        const meta = supportingMetaList[fileIndex];
        const headerCt = res.headers.get('content-type')?.split(';')[0]?.trim();
        const blob = await res.blob();
        const mime =
          (blob.type && blob.type !== 'application/octet-stream' ? blob.type : null) ||
          headerCt ||
          meta?.contentType ||
          'application/octet-stream';
        const typedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime });
        const objectUrl = URL.createObjectURL(typedBlob);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          if (preOpenedTab && !preOpenedTab.closed) {
            preOpenedTab.location.href = objectUrl;
          } else if (typeof document !== 'undefined') {
            const a = document.createElement('a');
            a.href = objectUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
          setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
        } else {
          if (preOpenedTab && !preOpenedTab.closed) preOpenedTab.close();
          const canOpen = await Linking.canOpenURL(objectUrl);
          if (canOpen) {
            await Linking.openURL(objectUrl);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
          } else {
            URL.revokeObjectURL(objectUrl);
            Alert.alert('Open file', 'Unable to open the file on this device.');
          }
        }
      } catch (e) {
        if (preOpenedTab && !preOpenedTab.closed) preOpenedTab.close();
        console.error(e);
        Alert.alert('Error', 'Could not open the supporting document.');
      } finally {
        setSupportingDocLoadingIndex(null);
      }
    },
    [order._id, supportingMetaList]
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
    if (viewOnly) {
      setGeneratedTravelOrderNo('');
      return;
    }

    let cancelled = false;

    const ensureTravelOrderNo = async () => {
      if (normalizeInline(order.travelOrderNo)) {
        if (!cancelled) setGeneratedTravelOrderNo('');
        return;
      }

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
  }, [order._id, order.travelOrderNo, monthKey, dateForNo, viewOnly]);

  const toNames = [
    order.employee?.name || '',
    ...(order.participants || []).filter((p) => !!p),
  ];

  const travelOrderNoDisplay =
    travelOrderNoDraft !== undefined
      ? normalizeInline(travelOrderNoDraft) || formatTravelOrderNoDisplay('', order.date)
      : normalizeInline(order.travelOrderNo) ||
        generatedTravelOrderNo ||
        formatTravelOrderNoDisplay(order.travelOrderNo, order.date);

  const chiefList: Recommender[] =
    order.recommendedBy && order.recommendedBy.length > 0
      ? order.recommendedBy
      : [{ _id: 'fallback', name: order.approvedBy?.name || 'Immediate Chief' }];

  const findRecommenderSignatureEntry = (recommenderId: string, index: number) => {
    if (!recommenderId && !order.recommenderSignatures?.length) return undefined;
    return order.recommenderSignatures?.find((rs) => {
      const oic = typeof rs.signedAsOicFor === 'object' && rs.signedAsOicFor ? rs.signedAsOicFor._id : rs.signedAsOicFor;
      if (oic && recommenderId && String(oic) === recommenderId) return true;
      const u = typeof rs.user === 'object' && rs.user ? rs.user._id : rs.user;
      return !!u && !!recommenderId && String(u) === recommenderId;
    }) || (index === 0 ? undefined : undefined);
  };

  const renderRecommenderSignatures = () =>
    chiefList.map((recommender, index) => {
      const recommenderId = String(recommender._id || recommender.id || '');
      const sigEntry = findRecommenderSignatureEntry(recommenderId, index);

      const existingSignature =
        order.recommendedBy && order.recommendedBy.length > 0
          ? sigEntry?.signature || (index === 0 ? order.approverSignature || null : null)
          : index === 0
            ? order.approverSignature || null
            : null;

      const oicSignedFor = sigEntry?.signedAsOicFor;
      const oicSignedForName = typeof oicSignedFor === 'object' && oicSignedFor ? oicSignedFor.name : null;
      const oicSigner = sigEntry?.user;
      const oicSignerName = typeof oicSigner === 'object' && oicSigner ? oicSigner.name : null;
      const isOicSigned = !!oicSignedForName;
      const displayName = isOicSigned ? (oicSignerName || recommender.name || '—') : (recommender.name || '—');

      if (viewOnly) {
        return (
          <View key={recommenderId || `${recommender.name}-${index}`} style={styles.signatureBlockLeft}>
            <Text style={styles.signatureHeader}>RECOMMENDED BY {index + 1}:</Text>
            <View style={styles.docSignatureDisplay}>
              {existingSignature ? (
                <View style={styles.signatureImageContainer}>
                  <Image source={{ uri: existingSignature }} style={styles.docSignatureImage} />
                </View>
              ) : (
                <View style={styles.placeholderSignature}>
                  <Text style={styles.placeholderText}>Pending</Text>
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
      }

      const currentApprovedCount = order.recommendersWhoApproved?.length || 0;
      const hasSigned = order.recommendersWhoApproved?.some((id) => String(id) === recommenderId);
      const isUserCandidate = !!currentUserId && String(recommender._id || recommender.id) === String(currentUserId);
      const isTurn = index === currentApprovedCount && isUserCandidate;

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
                  <Pressable style={styles.signatureButton} onPress={() => onChooseSignature?.('draw')}>
                    <FontAwesome name="pencil" size={24} color="#003366" />
                  </Pressable>
                  <Pressable style={styles.signatureButton} onPress={() => onChooseSignature?.('upload')}>
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
    });

  return (
    <View style={styles.a4Stack}>
      <View style={[styles.supportingAttachmentsOutside, { width: a4PageWidth }]}>
        <Text style={styles.supportingOutsideTitle}>Supporting documents</Text>
        <Text style={styles.supportingOutsideHint}>
          Submitted with this request for HR review only — not part of the official printed travel order (FM-DOrSU-HRMO-01).
        </Text>
        {hasSupportingDocument ? (
          <View style={styles.supportingAttachmentsWeb}>
            {supportingMetaList.map((meta, i) => (
              <View key={`${meta.name || 'file'}-${i}`} style={styles.supportingDocBlock}>
                <Pressable
                  onPress={() => void openSupportingDocumentAtIndex(i)}
                  disabled={supportingDocLoadingIndex !== null}
                  style={({ pressed }) => [styles.supportingDocRow, pressed && styles.supportingDocRowPressed]}
                >
                  <FontAwesome name="paperclip" size={12} color="#011a6b" style={{ marginRight: 8 }} />
                  <Text style={styles.supportingDocText} numberOfLines={1}>
                    {supportingMetaList.length > 1 ? `File ${i + 1}: ` : ''}
                    {meta.name || 'Attachment'}
                  </Text>
                  {supportingDocLoadingIndex === i ? (
                    <ActivityIndicator size="small" color="#011a6b" />
                  ) : (
                    <Text style={styles.supportingDocAction}>View</Text>
                  )}
                </Pressable>
                {Platform.OS === 'web' && supportingThumbUris[i] ? (
                  <Image
                    source={{ uri: supportingThumbUris[i] }}
                    style={styles.supportingThumbImage}
                    resizeMode="contain"
                  />
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.supportingOutsideEmpty}>No supporting documents were uploaded for this travel order.</Text>
        )}
      </View>

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
          <Image
            source={require('../../assets/dorsulogo-removebg-preview (1).png')}
            style={styles.logo}
          />
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
          <Text style={styles.formValueUnderlined}>{travelOrderNoDisplay}</Text>
          <Text style={styles.formLabelRight}>Date</Text>
          <Text style={styles.formValueUnderlined}>{formatDate(order.date)}</Text>
        </View>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>TO:</Text>
          <Text style={styles.formValueUnderlined}>{formatNamesList(toNames)}</Text>
        </View>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>POSITION:</Text>
          <Text style={styles.formValueUnderlined}>{order.employee?.role || '—'}</Text>
        </View>
        <View style={styles.addressSalaryRow}>
          <View style={styles.addressGroup}>
            <Text style={styles.formLabel}>ADDRESS:</Text>
            <Text style={styles.formValueUnderlined}>{normalizeInline(order.employeeAddress) || '—'}</Text>
          </View>
          <View style={styles.salaryGroup}>
            <Text style={styles.formLabelRight}>SALARY:</Text>
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

        {onViewMap && order.latitude != null && order.longitude != null && (
          <Pressable style={styles.viewMapBtn} onPress={onViewMap}>
            <Text style={styles.viewMapBtnText}>View on Map</Text>
          </Pressable>
        )}

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

        <View style={styles.signatureSection}>{renderRecommenderSignatures()}</View>

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlockLeft}>
            <Text style={styles.signatureHeader}>APPROVED BY:</Text>
            <View style={styles.docSignatureDisplay}>
              {order.presidentSignature ? (
                <View style={styles.signatureImageContainer}>
                  <Image source={{ uri: order.presidentSignature }} style={styles.docSignatureImage} />
                </View>
              ) : null}
              <View style={[styles.signatureNameContainer, order.presidentSignature ? { marginTop: 44 } : undefined]}>
                <Text style={styles.signatureName}>{order.presidentApprovedBy?.name || presidentName}</Text>
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
    width: '100%',
  },
  a4Page: {
    backgroundColor: '#fff',
    aspectRatio: 1 / 1.65421356237,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 10,
    overflow: 'hidden',
    maxWidth: '100%',
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
    minWidth: 0,
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
    width: 56,
    height: 56,
    resizeMode: 'contain',
    marginHorizontal: 8,
  },
  docCodeCard: {
    width: 100,
    borderWidth: 1,
    borderColor: '#616a78',
    backgroundColor: '#fff',
    flexShrink: 0,
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
    flexWrap: 'wrap',
  },
  addressSalaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  addressGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: '58%',
  },
  salaryGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexShrink: 0,
    minWidth: '34%',
  },
  formLabel: {
    fontSize: 9,
    marginRight: 5,
  },
  formLabelRight: {
    fontSize: 9,
    marginLeft: 10,
    marginRight: 5,
  },
  formValueUnderlined: {
    fontSize: 9,
    fontWeight: 'bold',
    flex: 1,
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
    minWidth: 80,
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
  supportingAttachmentsOutside: {
    marginTop: 0,
    marginBottom: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.28)',
    backgroundColor: 'rgba(1,26,107,0.06)',
    alignSelf: 'center',
  },
  supportingOutsideTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#011a6b',
    marginBottom: 6,
  },
  supportingOutsideHint: {
    fontSize: 11,
    color: 'rgba(1,26,107,0.78)',
    lineHeight: 16,
    marginBottom: 10,
  },
  supportingOutsideEmpty: {
    fontSize: 12,
    fontStyle: 'italic',
    color: 'rgba(1,26,107,0.55)',
  },
  supportingAttachmentsWeb: {
    gap: 8,
  },
  supportingDocBlock: {
    marginBottom: 4,
  },
  supportingThumbImage: {
    width: '100%' as const,
    maxHeight: 160,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  supportingDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(1,26,107,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(1,26,107,0.2)',
  },
  supportingDocRowPressed: {
    opacity: 0.9,
  },
  supportingDocText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: '#011a6b',
  },
  supportingDocAction: {
    fontSize: 11,
    fontWeight: '700',
    color: '#011a6b',
    textDecorationLine: 'underline',
  },
  viewMapBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#011a6b',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  viewMapBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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

export default TravelOrderFormWeb;
