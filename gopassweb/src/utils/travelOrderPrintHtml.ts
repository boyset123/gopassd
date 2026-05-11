/**
 * Generates full HTML for printing a travel order (matches slips.tsx layout and styling).
 */

import { DORSU_LOGO_DATA_URI } from './dorsuLogoDataUri';

export interface TravelOrderPrintItem {
  _id: string;
  travelOrderNo?: string;
  date: string;
  employee?: { name?: string; role?: string };
  employeeAddress?: string;
  salary?: string;
  to?: string;
  purpose?: string;
  departureDate?: string;
  arrivalDate?: string;
  additionalInfo?: string;
  participants?: string[];
  recommendedBy?: Array<{ _id?: string; name?: string }>;
  recommenderSignatures?: Array<{
    user?: string | { _id?: string; name?: string };
    signature?: string;
    /** When set, this recommender slot was actually signed by an OIC standing in for this original user. */
    signedAsOicFor?: { _id?: string; name?: string } | null;
  }>;
  approverSignature?: string;
  approvedBy?: { _id?: string; name?: string };
  presidentApprovedBy?: { _id?: string; name?: string };
  presidentSignature?: string;
  /** When set, the president slot was actually signed by an OIC for this original user. */
  presidentSignedAsOicFor?: { _id?: string; name?: string } | null;
}

const escapeHtml = (value: string | undefined | null) => {
  const s = (value ?? '').toString();
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const recommenderUserId = (user: string | { _id?: string; name?: string } | undefined): string | null => {
  if (!user) return null;
  if (typeof user === 'string') return user;
  return user._id ? String(user._id) : null;
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

// Match TravelOrderFormWeb formatting: "March 18, 2026 : 3:45 PM"
const formatDate = (dateString: string | undefined, includeTime = false) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';

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

export function getTravelOrderPrintHtml(item: TravelOrderPrintItem, presidentNameFallback: string): string {
  const salaryStr = formatSalary(item.salary);
  const recs = Array.isArray(item.recommendedBy) ? item.recommendedBy : [];
  const immediateChiefCount = recs.length > 0 ? recs.length : 1;
  const chiefsSideBySideClass = immediateChiefCount > 2 ? 'chiefs-grid' : 'chiefs-stack';
  const toNames = [
    item.employee?.name || '',
    ...((item.participants || []).filter(Boolean)),
  ];
  const recommenderBlocks = recs.map((chief, index) => {
    const chiefId = chief._id ? String(chief._id) : '';
    const sigEntry = item.recommenderSignatures?.find((s) => {
      const oic = s.signedAsOicFor && typeof s.signedAsOicFor === 'object' ? s.signedAsOicFor._id : null;
      if (oic && chiefId && String(oic) === chiefId) return true;
      const sUid = recommenderUserId(s.user);
      return !!sUid && !!chiefId && sUid === chiefId;
    }) ?? item.recommenderSignatures?.[index];
    const sig = sigEntry?.signature ?? (index === 0 ? item.approverSignature : undefined);
    const oicSignedForName = sigEntry?.signedAsOicFor && typeof sigEntry.signedAsOicFor === 'object'
      ? sigEntry.signedAsOicFor.name
      : null;
    const oicSignerName = sigEntry?.user && typeof sigEntry.user === 'object' ? sigEntry.user.name : null;
    const isOicSigned = !!oicSignedForName;
    const displayName = isOicSigned ? (oicSignerName || chief?.name || '') : (chief?.name || '');
    const oicNoteHtml = isOicSigned
      ? `<div class="sig-oic-note">(OIC for ${escapeHtml(oicSignedForName || '')})</div>`
      : '';
    return `
      <div class="sig-col">
        <div class="sig-header">RECOMMENDED BY ${index + 1}:</div>
        <div class="sig-box">
          ${sig ? `<div class="sig-img-wrap"><img src="${sig}" class="sig-img" alt="" /></div>` : `<div class="sig-placeholder">Pending</div>`}
          <div class="sig-name-underline"><span class="sig-name">${escapeHtml(displayName) || '—'}</span></div>
        </div>
        ${oicNoteHtml}
        <div class="sig-role">Immediate Chief</div>
      </div>`;
  }).join('');
  const presidentOicOriginalName = item.presidentSignedAsOicFor?.name || null;
  const presidentDisplayName = item.presidentApprovedBy?.name || presidentNameFallback || '—';
  const presidentOicNoteHtml = presidentOicOriginalName
    ? `<div class="sig-oic-note">(OIC for ${escapeHtml(presidentOicOriginalName)})</div>`
    : '';
  const logoSlot = `<img class="logo-img" src="${DORSU_LOGO_DATA_URI}" alt="DOrSU Logo" />`;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Travel Order - ${item.travelOrderNo || item._id}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 24px; background: #fff; color: #000; }

    /* A4-ish page container (mirrors TravelOrderFormWeb a4Page) */
    .a4-stack { width: 100%; display: flex; justify-content: center; }
    .a4-page {
      width: 100%;
      max-width: 720px;
      background: #fff;
      border: 1px solid #e6e6e6;
      border-radius: 10px;
      padding: 14px;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Header (mirrors TravelOrderFormWeb styles) */
    .doc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 10px; }
    .university-name-container { flex: 1; min-width: 0; }
    .header-rule { height: 2px; width: 92%; background: #7f93ad; margin: 3px 0; }
    .university-name { font-size: 12px; font-weight: 800; text-align: left; color: #8da2bf; line-height: 14px; letter-spacing: 0.25px; white-space: pre-line; font-family: Arial, sans-serif; }
    .university-motto { font-size: 7px; color: #6f7f95; font-style: italic; margin-top: 2px; }

    .logo-img { width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; display: block; }

    .doc-code-card { width: 110px; border: 1px solid #616a78; background: #fff; flex-shrink: 0; }
    .doc-code-topbar { background: #7c879a; padding: 2px 3px; border-bottom: 1px solid #616a78; }
    .doc-code-topbar-text { font-size: 8px; font-weight: bold; color: #fff; text-align: center; }
    .doc-code-value-row { padding: 4px 3px; border-bottom: 1px solid #616a78; }
    .doc-code-value-text { font-size: 10px; font-weight: 800; text-align: center; color: #6c6c6c; line-height: 10px; }
    .doc-code-table { width: 100%; }
    .doc-code-table-header, .doc-code-table-values { display: flex; }
    .doc-code-table-header { background: #7c879a; border-bottom: 1px solid #616a78; }
    .doc-code-th { flex: 1; text-align: center; font-size: 8px; font-weight: bold; color: #fff; padding: 2px 1px; border-right: 1px solid #616a78; }
    .doc-code-td { flex: 1; text-align: center; font-size: 8px; font-weight: bold; color: #666; padding: 2px 1px; border-right: 1px solid #616a78; }
    .doc-code-last { border-right: 0; }
    .doc-code-narrow { flex: 0.6; }

    .doc-title { text-align: center; font-weight: bold; font-size: 16px; margin: 6px 0 4px; text-decoration: underline; }
    .revised-text { text-align: left; font-size: 11px; margin-bottom: 8px; }

    /* Form rows (underline style like TravelOrderFormWeb) */
    .form-row { display: flex; flex-wrap: wrap; align-items: flex-start; margin-bottom: 6px; gap: 6px; }
    .form-row-top { justify-content: space-between; align-items: center; }
    .form-row-left { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; }
    .form-row-right { display: flex; align-items: center; gap: 6px; margin-left: auto; text-align: right; }
    .label { font-size: 11px; margin-right: 4px; }
    .label-right { font-size: 11px; margin-left: 10px; margin-right: 4px; }
    .value-u { font-size: 11px; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; flex: 1; min-width: 120px; }
    .salary-u { font-size: 11px; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }

    .directive { font-size: 11px; margin: 10px 0 8px; }
    .info { font-size: 11px; margin: 0 0 6px; }
    .inline-u { font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }

    /* Signatures */
    .sig-section { margin-top: 14px; }
    .chiefs-grid { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
    .chiefs-stack { display: block; }
    .chiefs-stack .sig-col { max-width: 100%; margin-bottom: 10px; }
    .chiefs-grid .sig-col { flex-basis: 32%; max-width: 32%; min-width: 180px; }
    .president-row { margin-top: 10px; }
    .president-row .sig-col { max-width: 100%; }
    .sig-header { font-size: 11px; font-weight: 800; margin-bottom: 2px; }
    .sig-box { position: relative; width: 120px; min-height: 58px; display: flex; align-items: flex-end; justify-content: flex-start; }
    .sig-img-wrap { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: center; }
    .sig-img { width: 120px; height: 48px; object-fit: contain; }
    .sig-placeholder { position: absolute; top: 0; left: 0; right: 0; font-size: 10px; color: #667085; font-weight: 600; }
    .sig-name-underline { margin-top: 42px; border-bottom: 1px solid #000; padding-bottom: 2px; }
    .sig-name { font-size: 12px; font-weight: 800; }
    .sig-oic-note { font-size: 9px; font-style: italic; color: #555; margin-top: 1px; }
    .sig-role { font-size: 10px; margin-top: 2px; }

    @media print {
      body { padding: 0; }
      .a4-page { border: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="a4-stack">
    <div class="a4-page">
      <div class="doc-header">
        <div class="university-name-container">
          <div class="header-rule"></div>
          <div class="university-name">DAVAO ORIENTAL\nSTATE UNIVERSITY</div>
          <div class="university-motto">"A University of excellence, innovation, and inclusion"</div>
          <div class="header-rule"></div>
        </div>
        ${logoSlot}
        <div class="doc-code-card">
          <div class="doc-code-topbar"><div class="doc-code-topbar-text">Document Code No.</div></div>
          <div class="doc-code-value-row"><div class="doc-code-value-text">FM-DOrSU-HRMO-01</div></div>
          <div class="doc-code-table">
            <div class="doc-code-table-header">
              <div class="doc-code-th">Issue Status</div>
              <div class="doc-code-th doc-code-narrow">Rev No.</div>
              <div class="doc-code-th">Effective Date</div>
              <div class="doc-code-th doc-code-narrow doc-code-last">Page No.</div>
            </div>
            <div class="doc-code-table-values">
              <div class="doc-code-td">01</div>
              <div class="doc-code-td doc-code-narrow">00</div>
              <div class="doc-code-td">07.22.2022</div>
              <div class="doc-code-td doc-code-narrow doc-code-last">1 of 1</div>
            </div>
          </div>
        </div>
      </div>

      <div class="doc-title">TRAVEL ORDER FORM</div>
      <div class="revised-text">Revised 1996</div>

      <div class="form-row form-row-top">
        <div class="form-row-left">
          <span class="label">Travel Order No.</span>
          <span class="value-u">${formatTravelOrderNoDisplay(item.travelOrderNo, item.date)}</span>
        </div>
        <div class="form-row-right">
          <span class="label-right">Date</span>
          <span class="value-u">${formatDate(item.date)}</span>
        </div>
      </div>

      <div class="form-row">
        <span class="label">TO:</span>
        <span class="value-u">${formatNamesList(toNames) || '—'}</span>
      </div>

      <div class="form-row">
        <span class="label">POSITION:</span>
        <span class="value-u">${normalizeInline(item.employee?.role) || '—'}</span>
      </div>

      <div class="form-row">
        <span class="label">ADDRESS:</span>
        <span class="value-u">${normalizeInline(item.employeeAddress) || '—'}</span>
        <span class="label-right">SALARY:</span>
        <span class="salary-u">₱${salaryStr || '—'}</span>
      </div>

      <div class="directive">You are hereby directed to travel on official business:</div>

      <div class="form-row">
        <span class="label">TO:</span>
        <span class="value-u">${normalizeInline(item.to) || '—'}</span>
      </div>
      <div class="form-row">
        <span class="label">PURPOSE/S:</span>
        <span class="value-u">${normalizeInline(item.purpose) || '—'}</span>
      </div>

      <div class="directive">You will leave and return to your official station</div>

      <div class="form-row">
        <span class="label">Date of Departure:</span>
        <span class="value-u">${formatDate(item.departureDate, true)}</span>
      </div>
      <div class="form-row">
        <span class="label">Date of Arrival:</span>
        <span class="value-u">${formatDate(item.arrivalDate, true)}</span>
      </div>

      <p class="info">
        You shall be guided further by the following additional instruction and information on
        <span class="inline-u"> ${normalizeInline(item.additionalInfo) || '—'}</span>
      </p>
      <p class="info">
        Upon completion of your travel, you are required to submit your full report through proper channel; no travel order shall be issued for the succeeding work unless a copy of your accomplishment in the immediate past is herewith attached or presented.
      </p>

      <div class="sig-section">
        <div class="${chiefsSideBySideClass}">
          ${recommenderBlocks || (() => {
            const fallbackName = item.approvedBy?.name || recs[0]?.name || 'Immediate Chief';
            const sig = item.approverSignature;
            return `
              <div class="sig-col">
                <div class="sig-header">RECOMMENDED BY 1:</div>
                <div class="sig-box">
                  ${sig ? `<div class="sig-img-wrap"><img src="${sig}" class="sig-img" alt="" /></div>` : `<div class="sig-placeholder">Pending</div>`}
                  <div class="sig-name-underline"><span class="sig-name">${fallbackName}</span></div>
                </div>
                <div class="sig-role">Immediate Chief</div>
              </div>`;
          })()}
        </div>

        <div class="president-row">
          <div class="sig-col">
            <div class="sig-header">APPROVED BY:</div>
            <div class="sig-box">
              ${item.presidentSignature ? `<div class="sig-img-wrap"><img src="${item.presidentSignature}" class="sig-img" alt="" /></div>` : `<div class="sig-placeholder">Pending</div>`}
              <div class="sig-name-underline"><span class="sig-name">${escapeHtml(presidentDisplayName)}</span></div>
            </div>
            ${presidentOicNoteHtml}
            <div class="sig-role">President</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
