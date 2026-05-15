import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import { Buffer } from 'buffer';
import Pdf from 'react-native-pdf';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  /** Submitter role snapshot from server */
  employeeRole?: string;
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

function trimSupportingMetaName(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Multipart / clients often store `originalname` URL-encoded (`%20` for space). Show a normal filename in UI.
 */
function decodeFilenameForDisplay(name: string | undefined): string {
  const raw = trimSupportingMetaName(name);
  if (!raw) return '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

/**
 * One entry per `documents[]` slot (same order / length as MongoDB) so `?index=` matches the API.
 * Do not filter by name/contentType — that skewed indices vs `GET …/supporting-document?index=`.
 */
function supportingAttachmentMetaList(order: Pick<TravelOrder, 'documents' | 'document'>): {
  name?: string;
  contentType?: string;
}[] {
  if (Array.isArray(order.documents) && order.documents.length > 0) {
    return order.documents.map((d, i) => ({
      name: decodeFilenameForDisplay(d?.name) || `Attachment ${i + 1}`,
      contentType: d?.contentType,
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
}

function isWordAttachment(contentType: string | undefined, fileName: string | undefined): boolean {
  const nameLower = (fileName || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  return ct.includes('wordprocessingml') || ct.includes('officedocument') || nameLower.endsWith('.docx');
}

/** Extension for a cached preview file (max size bounded by API upload limits). */
function cacheExtFromMeta(contentType: string | undefined, fileName: string | undefined): string {
  const nameLower = (fileName || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('pdf') || nameLower.endsWith('.pdf')) return 'pdf';
  if (nameLower.endsWith('.png')) return 'png';
  if (nameLower.endsWith('.webp')) return 'webp';
  if (nameLower.endsWith('.gif')) return 'gif';
  if (ct.includes('jpeg') || ct.includes('jpg') || nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg'))
    return 'jpg';
  return 'bin';
}

function toFileWebviewUri(localPath: string): string {
  if (localPath.startsWith('file:')) return localPath;
  const normalized = localPath.startsWith('/') ? localPath : `/${localPath}`;
  return `file://${normalized}`;
}

function previewKindFromMeta(contentType: string | undefined, fileName: string | undefined): 'image' | 'pdf' | 'other' {
  const ct = (contentType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  return 'other';
}

function supportingAttachmentIconName(meta: {
  contentType?: string;
  name?: string;
}): 'file-image-o' | 'file-pdf-o' | 'file-o' {
  if (isWordAttachment(meta.contentType, meta.name)) return 'file-o';
  const k = previewKindFromMeta(meta.contentType, meta.name);
  if (k === 'image') return 'file-image-o';
  if (k === 'pdf') return 'file-pdf-o';
  return 'file-o';
}

function supportingAttachmentKindLabel(meta: { contentType?: string; name?: string }): string {
  if (isWordAttachment(meta.contentType, meta.name)) return 'Word document';
  const k = previewKindFromMeta(meta.contentType, meta.name);
  if (k === 'pdf') return 'PDF document';
  if (k === 'image') return 'Image';
  return 'Attachment';
}

type SupportingViewerState =
  | null
  | { status: 'loading'; title: string }
  | { status: 'ready'; title: string; filePath: string; previewKind: 'image' | 'pdf' | 'other' };

interface TravelOrderFormProps {
  order: TravelOrder;
  presidentName: string;
  currentUserId?: string;
  approverSignature: string | null;
  onRedoApproverSignature: () => void;
  onChooseSignature: (type: SignatureType) => void;
  /** When true, show draw/upload controls in the APPROVED BY (President) section. */
  presidentCanSign?: boolean;
  /**
   * Signatory review: render supporting files below the A4 “paper” card instead of inside it
   * (clearer separation when signing).
   */
  supportingAttachmentsOutsidePaper?: boolean;
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

const travelOrderPositionLabel = (order: TravelOrder) =>
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
  supportingAttachmentsOutsidePaper = false,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const a4PageWidth = Math.min(windowWidth - 32, 420);

  const [generatedTravelOrderNo, setGeneratedTravelOrderNo] = useState<string>('');
  const [openingSupportingIndex, setOpeningSupportingIndex] = useState<number | null>(null);
  const [supportingViewer, setSupportingViewer] = useState<SupportingViewerState>(null);

  const attachmentMeta = useMemo(() => supportingAttachmentMetaList(order), [order]);

  const hasSupportingDocument = attachmentMeta.length > 0;

  const supportingFetchAbortRef = useRef<AbortController | null>(null);

  const closeSupportingViewer = useCallback(() => {
    supportingFetchAbortRef.current?.abort();
    supportingFetchAbortRef.current = null;
    setSupportingViewer((prev) => {
      if (
        prev?.status === 'ready' &&
        FileSystem.cacheDirectory &&
        prev.filePath.startsWith(FileSystem.cacheDirectory)
      ) {
        void FileSystem.deleteAsync(prev.filePath, { idempotent: true }).catch(() => {});
      }
      return null;
    });
  }, []);

  const openSupportingDocumentAtIndex = useCallback(
    async (fileIndex: number) => {
      if (!order._id || fileIndex < 0 || fileIndex >= attachmentMeta.length) return;
      const meta = attachmentMeta[fileIndex];
      if (isWordAttachment(meta.contentType, meta.name)) {
        Alert.alert(
          'Word attachment',
          'Word (.docx) files cannot be previewed inside the app. Open this travel order on a computer to view the document, or ask HR for a PDF copy.'
        );
        return;
      }
      const title = meta.name || `Attachment ${fileIndex + 1}`;
      setSupportingViewer({ status: 'loading', title });
      setOpeningSupportingIndex(fileIndex);
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          closeSupportingViewer();
          Alert.alert('Session', 'You are not logged in.');
          return;
        }
        const url = `${API_URL}/travel-orders/${order._id}/supporting-document?index=${fileIndex}`;
        const ext = cacheExtFromMeta(meta.contentType, meta.name);
        const cacheRoot = FileSystem.cacheDirectory;
        if (!cacheRoot) {
          closeSupportingViewer();
          Alert.alert('Preview', 'This device has no cache directory; preview is unavailable.');
          return;
        }
        const filePath = `${cacheRoot}travel-support-${order._id}-${fileIndex}.${ext}`;

        supportingFetchAbortRef.current?.abort();
        const ac = new AbortController();
        supportingFetchAbortRef.current = ac;

        const res = await fetch(url, {
          headers: { 'x-auth-token': token },
          signal: ac.signal,
        });
        if (!res.ok) {
          let detail = '';
          try {
            detail = (await res.text()).trim().slice(0, 240);
          } catch {
            /* ignore */
          }
          closeSupportingViewer();
          Alert.alert(
            'Could not load',
            detail
              ? `Server responded (${res.status}): ${detail}`
              : `HTTP ${res.status}. You may not have permission to view this file, or it may be missing.`
          );
          return;
        }

        const ab = await res.arrayBuffer();
        const b64 = Buffer.from(new Uint8Array(ab)).toString('base64');
        await FileSystem.writeAsStringAsync(filePath, b64, { encoding: FileSystem.EncodingType.Base64 });
        setSupportingViewer({
          status: 'ready',
          title,
          filePath,
          previewKind: previewKindFromMeta(meta.contentType, meta.name),
        });
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'name' in e && (e as { name?: string }).name === 'AbortError') {
          return;
        }
        console.error(e);
        closeSupportingViewer();
        Alert.alert('Could not load', 'The file could not be downloaded for preview. Check your connection and try again.');
      } finally {
        supportingFetchAbortRef.current = null;
        setOpeningSupportingIndex(null);
      }
    },
    [order._id, attachmentMeta, closeSupportingViewer]
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

  const supportingAttachmentBanners = hasSupportingDocument
    ? attachmentMeta.map((meta, i) => {
        const previewBusy = openingSupportingIndex !== null || supportingViewer !== null;
        const loadingHere = openingSupportingIndex === i;
        const iconName = supportingAttachmentIconName(meta);
        const kindLabel = supportingAttachmentKindLabel(meta);
        return (
          <View key={`${meta.name || 'file'}-${i}`} style={styles.supportingDocBanner}>
            <View style={styles.supportingDocIconWrap}>
              <FontAwesome name={iconName} size={16} color="#0d4f8c" />
            </View>
            <View style={styles.supportingDocTextCol}>
              <Text style={styles.supportingDocLabel} numberOfLines={2}>
                {meta.name || `Attachment ${i + 1}`}
              </Text>
              <Text style={styles.supportingDocKind} numberOfLines={1}>
                {kindLabel}
              </Text>
            </View>
            <Pressable
              onPress={() => void openSupportingDocumentAtIndex(i)}
              disabled={previewBusy}
              accessibilityRole="button"
              accessibilityLabel={`Preview ${meta.name || `attachment ${i + 1}`}`}
              style={({ pressed }) => [
                styles.supportingDocViewBtnWrap,
                pressed && !previewBusy && styles.supportingDocViewBtnWrapPressed,
                previewBusy && !loadingHere && styles.supportingDocViewBtnWrapDisabled,
              ]}
            >
              <View
                style={[
                  styles.supportingDocViewBtnInner,
                  loadingHere ? styles.supportingDocViewBtnInnerMuted : styles.supportingDocViewBtnInnerPrimary,
                ]}
              >
                {loadingHere ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="eye" size={13} color="#ffffff" style={styles.supportingDocViewBtnIcon} />
                    <Text style={styles.supportingDocViewBtnText}>Preview</Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>
        );
      })
    : null;

  return (
    <>
    <View style={styles.a4Stack}>
      <View style={[styles.a4Page, { width: a4PageWidth }]}>
        <View style={styles.docHeader}>
          <View style={styles.universityNameContainer}>
            <View style={styles.headerRule} />
            <Text style={styles.universityName}>
              DAVAO ORIENTAL{'\n'}STATE UNIVERSITY
            </Text>
            <Text style={styles.universityMotto}>{'"A University of excellence, innovation, and inclusion"'}</Text>
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
          <Text style={styles.formValueUnderlined}>{travelOrderPositionLabel(order)}</Text>
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

        {hasSupportingDocument && !supportingAttachmentsOutsidePaper ? (
          <View style={styles.supportingAttachmentsBlock}>{supportingAttachmentBanners}</View>
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
      {hasSupportingDocument && supportingAttachmentsOutsidePaper ? (
        <View
          style={[
            styles.supportingAttachmentsBlock,
            styles.supportingAttachmentsOutsidePaper,
            { width: a4PageWidth },
          ]}
        >
          {supportingAttachmentBanners}
        </View>
      ) : null}
    </View>

    <Modal
      visible={supportingViewer !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={closeSupportingViewer}
    >
      <SafeAreaView style={styles.supportingViewerRoot} edges={['top', 'left', 'right']}>
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
            <ExpoImage
              source={{ uri: toFileWebviewUri(supportingViewer.filePath) }}
              style={styles.supportingWebView}
              contentFit="contain"
              transition={0}
            />
          ) : supportingViewer.previewKind === 'pdf' && Platform.OS !== 'web' ? (
            <Pdf
              source={{ uri: toFileWebviewUri(supportingViewer.filePath), cache: true }}
              style={styles.supportingWebView}
              fitPolicy={0}
              onError={(err) => {
                console.error('TravelOrderForm Pdf preview error:', err);
                Alert.alert('Could not load', 'The PDF could not be displayed on this device.');
                closeSupportingViewer();
              }}
            />
          ) : (
            <WebView
              style={styles.supportingWebView}
              source={{ uri: toFileWebviewUri(supportingViewer.filePath) }}
              originWhitelist={['*']}
              startInLoadingState
              allowsInlineMediaPlayback
              mixedContentMode="always"
              allowingReadAccessToURL={Platform.OS === 'ios' ? FileSystem.cacheDirectory ?? undefined : undefined}
              androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
              renderLoading={() => (
                <View style={styles.supportingWebViewLoading}>
                  <ActivityIndicator size="large" color="#011a6b" />
                </View>
              )}
              onHttpError={(e) => {
                const code = e.nativeEvent.statusCode;
                if (code >= 400) {
                  Alert.alert('Could not load', `The preview could not be shown (HTTP ${code}).`);
                  closeSupportingViewer();
                }
              }}
              onError={(e) => {
                console.error('TravelOrderForm WebView preview error:', e?.nativeEvent);
                Alert.alert('Could not load', 'The preview could not be displayed. Try opening a PDF or image file.');
                closeSupportingViewer();
              }}
            />
          )
        ) : null}
      </SafeAreaView>
    </Modal>
    </>
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
  /** Below the A4 card; same width as paper for signatory review modals. */
  supportingAttachmentsOutsidePaper: {
    marginTop: 12,
    marginBottom: 4,
    alignSelf: 'center',
  },
  supportingDocBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#f0f7ff',
    borderWidth: 1,
    borderColor: 'rgba(13, 79, 140, 0.16)',
    shadowColor: '#0d4f8c',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  supportingDocIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d9e9fb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 79, 140, 0.12)',
  },
  supportingDocTextCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  supportingDocLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#082654',
    lineHeight: 15,
  },
  supportingDocKind: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3d6ea8',
    marginTop: 3,
    letterSpacing: 0.2,
  },
  supportingDocViewBtnWrap: {
    borderRadius: 999,
    overflow: 'hidden',
    minWidth: 102,
    shadowColor: '#082654',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 4,
  },
  supportingDocViewBtnWrapPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.94,
  },
  supportingDocViewBtnWrapDisabled: {
    opacity: 0.42,
  },
  supportingDocViewBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  supportingDocViewBtnInnerPrimary: {
    backgroundColor: '#0d4f8c',
  },
  supportingDocViewBtnInnerMuted: {
    backgroundColor: '#64748b',
  },
  supportingDocViewBtnIcon: {
    marginRight: 6,
  },
  supportingDocViewBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  supportingViewerRoot: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  supportingViewerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
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
  supportingWebView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  supportingViewerBodyLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  supportingWebViewLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  supportingLoadingHint: {
    marginTop: 12,
    fontSize: 14,
    color: '#475569',
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

