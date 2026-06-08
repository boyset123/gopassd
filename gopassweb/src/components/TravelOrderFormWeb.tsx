import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  useWindowDimensions,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL } from '../config/api';
import SupportingAttachmentFileCard from './SupportingAttachmentFileCard';

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
  /** Snapshot of submitter role from server (present when API omits populated `employee.role`). */
  employeeRole?: string;
  purpose: string;
  to: string;
  date: string;
  travelOrderNo?: string;
  employeeAddress?: string;
  salary: string;
  departureDate: string;
  arrivalDate: string;
  additionalInfo: string;
  officialBusinessNote?: string;
  chargeableAgainstNote?: string;
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

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
};

const formatTravelPeriodDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const period = date.getHours() < 12 ? 'AM' : 'PM';
  return `${formatDate(dateString)} (${period})`;
};

const normalizeTravelOrderNo = (value: string | undefined | null) => {
  const no = normalizeInline(value);
  if (!no) return '';
  return no.replace(/\s*[-–—]\s*/g, '-');
};

const formatSalary = (salary: string | undefined) =>
  !salary ? '' : salary.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const normalizeInline = (value: string | undefined | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const BLANK_OPTIONAL_NOTE_LINE = '\u2003'.repeat(52);

const displayOptionalNote = (value: string | undefined | null) =>
  normalizeInline(value) || BLANK_OPTIONAL_NOTE_LINE;

/** Stored names are often URL-encoded (`%20` for space). */
function decodeFilenameForDisplay(name: string | undefined): string {
  const raw = normalizeInline(name);
  if (!raw) return '';
  try {
    return normalizeInline(decodeURIComponent(raw.replace(/\+/g, ' ')));
  } catch {
    return raw;
  }
}

function isWordAttachment(contentType: string | undefined, fileName: string | undefined): boolean {
  const nameLower = (fileName || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  return ct.includes('wordprocessingml') || ct.includes('officedocument') || nameLower.endsWith('.docx');
}

function previewKindFromMeta(
  contentType: string | undefined,
  fileName: string | undefined
): 'image' | 'pdf' | 'other' {
  const ct = (contentType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  return 'other';
}

type SupportingWebViewer =
  | null
  | { status: 'loading'; title: string }
  | { status: 'ready'; title: string; objectUrl: string; previewKind: 'image' | 'pdf' | 'other' };

/** Browser iframe preview for PDF/other blobs (react-native-webview does not run on web). */
function SupportingDocumentEmbed({ uri }: { uri: string }) {
  return (
    <View style={styles.supportingWebView}>
      {React.createElement('iframe', {
        src: uri,
        title: 'Document preview',
        style: {
          width: '100%',
          height: '100%',
          border: 'none',
          flex: 1,
          minHeight: 280,
          backgroundColor: '#fff',
        },
      })}
    </View>
  );
}

function supportingWebFileKindLabel(meta: { contentType?: string; name?: string }): string {
  const ct = (meta.contentType || '').toLowerCase();
  const name = (meta.name || '').toLowerCase();
  if (ct.includes('wordprocessingml') || name.endsWith('.docx')) return 'Word document';
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'PDF document';
  if (ct.startsWith('image/')) return 'Image';
  return 'Attachment';
}

const travelOrderPositionLabel = (order: TravelOrderWebOrder) =>
  normalizeInline(order.employeeRole) || normalizeInline(order.employee?.role) || 'N/A';

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
  const no = normalizeTravelOrderNo(travelOrderNo);
  if (no) return no;

  const date = new Date(dateString || '');
  if (Number.isNaN(date.getTime())) return 'TBD';

  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}-____-${yy}`;
};

const RECOMMENDER_ROLE_LABEL = 'Supervising Administrative Officer';
const PRESIDENT_ROLE_LABEL = 'SUC President III';

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const supportingViewerPanelHeight = Math.min(Math.round(windowHeight * 0.92), 900);
  /** Wide HR modal: travel order (left) + supporting files (right). */
  const sideBySideLayout = windowWidth >= 720;
  const layoutMaxWidth = Math.min(Math.max(windowWidth - 80, 280), 880);
  const layoutGap = 16;
  const supportingPanelWidth = sideBySideLayout
    ? Math.min(340, Math.max(260, Math.floor(layoutMaxWidth * 0.34)))
    : Math.min(Math.max(windowWidth - 48, 280), 440);
  const a4PageWidth = sideBySideLayout
    ? Math.min(440, layoutMaxWidth - supportingPanelWidth - layoutGap)
    : Math.min(Math.max(windowWidth - 48, 280), 440);

  const [generatedTravelOrderNo, setGeneratedTravelOrderNo] = useState<string>('');
  const [supportingDocLoadingIndex, setSupportingDocLoadingIndex] = useState<number | null>(null);
  const [supportingViewer, setSupportingViewer] = useState<SupportingWebViewer>(null);
  const supportingObjectUrlRef = useRef<string | null>(null);
  const supportingOpenInFlightRef = useRef(false);

  const supportingMetaList = useMemo(() => {
    const docs = order.documents;
    if (Array.isArray(docs) && docs.length > 0) {
      return docs.map((d, i) => ({
        name:
          decodeFilenameForDisplay(d?.name) ||
          decodeFilenameForDisplay((d as { filename?: string })?.filename) ||
          `Attachment ${i + 1}`,
        contentType: d?.contentType || (d as { type?: string })?.type,
      }));
    }
    if (order.document && (order.document.name || order.document.contentType)) {
      return [
        {
          name: decodeFilenameForDisplay(order.document.name) || 'Attachment',
          contentType: order.document.contentType,
        },
      ];
    }
    return [];
  }, [order.documents, order.document]);

  const hasSupportingDocument = supportingMetaList.length > 0;
  const supportingDocBusy = supportingDocLoadingIndex !== null;

  const closeSupportingViewer = useCallback(() => {
    if (supportingObjectUrlRef.current) {
      URL.revokeObjectURL(supportingObjectUrlRef.current);
      supportingObjectUrlRef.current = null;
    }
    setSupportingViewer(null);
    setSupportingDocLoadingIndex(null);
    supportingOpenInFlightRef.current = false;
  }, []);

  const openSupportingDocumentAtIndex = useCallback(
    async (fileIndex: number) => {
      if (!order._id || fileIndex < 0 || fileIndex >= supportingMetaList.length) return;
      if (supportingOpenInFlightRef.current) return;

      const meta = supportingMetaList[fileIndex];
      const title = meta.name || `Attachment ${fileIndex + 1}`;

      if (isWordAttachment(meta.contentType, meta.name)) {
        Alert.alert(
          'Word attachment',
          'Word (.docx) files cannot be previewed in the browser. Use Download on your computer after HR exports the file, or ask the employee for a PDF copy.'
        );
        return;
      }

      supportingOpenInFlightRef.current = true;
      setSupportingDocLoadingIndex(fileIndex);
      setSupportingViewer({ status: 'loading', title });

      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          closeSupportingViewer();
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
          let detail = '';
          try {
            detail = (await res.text()).trim().slice(0, 240);
          } catch {
            /* ignore */
          }
          closeSupportingViewer();
          Alert.alert(
            'Could not open',
            detail
              ? `Server responded (${res.status}): ${detail}`
              : `HTTP ${res.status}. The file may be missing or you may not have permission to view it.`
          );
          return;
        }
        const headerCt = res.headers.get('content-type')?.split(';')[0]?.trim();
        const blob = await res.blob();
        const mime =
          (blob.type && blob.type !== 'application/octet-stream' ? blob.type : null) ||
          headerCt ||
          meta?.contentType ||
          'application/octet-stream';
        const typedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime });
        if (supportingObjectUrlRef.current) {
          URL.revokeObjectURL(supportingObjectUrlRef.current);
        }
        const objectUrl = URL.createObjectURL(typedBlob);
        supportingObjectUrlRef.current = objectUrl;
        setSupportingViewer({
          status: 'ready',
          title,
          objectUrl,
          previewKind: previewKindFromMeta(meta.contentType, meta.name),
        });
        setSupportingDocLoadingIndex(null);
      } catch (e) {
        console.error(e);
        closeSupportingViewer();
        Alert.alert('Error', 'Could not open the supporting document.');
      } finally {
        supportingOpenInFlightRef.current = false;
      }
    },
    [order._id, supportingMetaList, closeSupportingViewer]
  );

  useEffect(() => () => closeSupportingViewer(), [closeSupportingViewer]);

  const renderSupportingAttachmentCards = () =>
    supportingMetaList.map((meta, i) => (
      <SupportingAttachmentFileCard
        key={`${meta.name || 'file'}-${i}`}
        name={meta.name || `Attachment ${i + 1}`}
        contentType={meta.contentType}
        subtitle={supportingWebFileKindLabel(meta)}
        onPress={() => void openSupportingDocumentAtIndex(i)}
        disabled={supportingDocBusy}
        loading={supportingDocLoadingIndex === i}
      />
    ));

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
      const fullNo = `${mm}-${seq4}-${yy}`;

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
      ? normalizeTravelOrderNo(travelOrderNoDraft) || formatTravelOrderNoDisplay('', order.date)
      : normalizeTravelOrderNo(order.travelOrderNo) ||
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

      const recHeader =
        chiefList.length > 1 ? `RECOMMENDED BY ${index + 1}:` : 'RECOMMENDED BY:';

      if (viewOnly) {
        return (
          <View key={recommenderId || `${recommender.name}-${index}`} style={styles.signatureBlockLeft}>
            <Text style={styles.signatureHeader}>{recHeader}</Text>
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
            <Text style={styles.signatureTitle}>{RECOMMENDER_ROLE_LABEL}</Text>
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
          <Text style={styles.signatureHeader}>{recHeader}</Text>
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
          <Text style={styles.signatureTitle}>{RECOMMENDER_ROLE_LABEL}</Text>
          {isOicSigned && (
            <Text style={styles.oicNote}>(OIC for {oicSignedForName})</Text>
          )}
        </View>
      );
    });

  return (
    <>
    <View style={[styles.a4Stack, sideBySideLayout ? styles.a4LayoutRow : styles.a4LayoutColumn]}>
      {!sideBySideLayout ? (
        <View style={[styles.supportingAttachmentsOutside, { width: supportingPanelWidth }]}>
          <Text style={styles.supportingOutsideTitle}>Supporting documents</Text>
          <Text style={styles.supportingOutsideHint}>
            Submitted with this request for HR review only — not part of the official printed travel order (FM-DOrSU-HRMO-01).
          </Text>
          {hasSupportingDocument ? (
            <View style={styles.supportingAttachmentsWeb}>{renderSupportingAttachmentCards()}</View>
          ) : (
            <Text style={styles.supportingOutsideEmpty}>No supporting documents were uploaded for this travel order.</Text>
          )}
        </View>
      ) : null}

      <View style={[styles.a4PageWrap, sideBySideLayout && styles.a4PageWrapSide]}>
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
          <Text style={styles.formValueUnderlined}>{travelOrderPositionLabel(order)}</Text>
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
          Your travelling expenses in the field will be authorized or allowed under Official Business,{' '}
          <Text style={styles.inlineUnderlinedText}>
            {displayOptionalNote(order.officialBusinessNote)}
          </Text>
          .
        </Text>
        <Text style={styles.infoText}>
          Chargeable against Higher Education,{' '}
          <Text style={styles.inlineUnderlinedText}>
            {displayOptionalNote(order.chargeableAgainstNote)}
          </Text>
          .
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

      {sideBySideLayout ? (
        <View
          style={[
            styles.supportingAttachmentsOutside,
            styles.supportingAttachmentsSidebar,
            { width: supportingPanelWidth },
          ]}
        >
          <Text style={styles.supportingOutsideTitle}>Supporting documents</Text>
          <Text style={styles.supportingOutsideHint}>
            Submitted with this request for HR review only — not part of the official printed travel order (FM-DOrSU-HRMO-01).
          </Text>
          {hasSupportingDocument ? (
            <View style={styles.supportingAttachmentsWeb}>{renderSupportingAttachmentCards()}</View>
          ) : (
            <Text style={styles.supportingOutsideEmpty}>No supporting documents were uploaded for this travel order.</Text>
          )}
        </View>
      ) : null}
    </View>

    <Modal
      visible={supportingViewer !== null}
      animationType="fade"
      transparent
      onRequestClose={closeSupportingViewer}
    >
      <View style={styles.supportingViewerOverlay}>
        <View style={[styles.supportingViewerPanel, { maxHeight: supportingViewerPanelHeight }]}>
          <View style={styles.supportingViewerToolbar}>
            <Text style={styles.supportingViewerTitle} numberOfLines={1}>
              {supportingViewer?.status === 'loading' || supportingViewer?.status === 'ready'
                ? supportingViewer.title
                : ''}
            </Text>
            <Pressable
              onPress={closeSupportingViewer}
              hitSlop={12}
              style={({ pressed }) => [styles.supportingViewerCloseBtn, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.supportingViewerCloseText}>Close</Text>
            </Pressable>
          </View>
          {supportingViewer?.status === 'loading' ? (
            <View style={styles.supportingViewerBodyLoading}>
              <ActivityIndicator size="large" color="#011a6b" />
              <Text style={styles.supportingLoadingHint}>Loading preview…</Text>
            </View>
          ) : supportingViewer?.status === 'ready' ? (
            supportingViewer.previewKind === 'image' ? (
              <Image
                source={{ uri: supportingViewer.objectUrl }}
                style={styles.supportingPreviewImage}
                resizeMode="contain"
              />
            ) : (
              <SupportingDocumentEmbed uri={supportingViewer.objectUrl} />
            )
          ) : null}
        </View>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  a4Stack: {
    alignItems: 'center',
    width: '100%',
  },
  a4LayoutRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 16,
  },
  a4LayoutColumn: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  a4PageWrap: {
    flexShrink: 0,
    alignItems: 'center',
  },
  a4PageWrapSide: {
    flex: 1,
    maxWidth: 440,
    minWidth: 0,
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
  supportingAttachmentsSidebar: {
    marginBottom: 0,
    alignSelf: 'flex-start',
    flexShrink: 0,
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
    gap: 10,
  },
  supportingViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  supportingViewerPanel: {
    width: '100%',
    maxWidth: 920,
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  supportingViewerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.2)',
    gap: 12,
  },
  supportingViewerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  supportingViewerCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  supportingViewerCloseText: {
    color: '#93c5fd',
    fontSize: 16,
    fontWeight: '700',
  },
  supportingViewerBodyLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    minHeight: 280,
  },
  supportingLoadingHint: {
    marginTop: 12,
    fontSize: 14,
    color: '#475569',
  },
  supportingPreviewImage: {
    flex: 1,
    width: '100%',
    backgroundColor: '#f8fafc',
    minHeight: 280,
  },
  supportingWebView: {
    flex: 1,
    width: '100%',
    backgroundColor: '#fff',
    minHeight: 280,
  },
  supportingWebViewLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
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
