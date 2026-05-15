/**
 * HTML for expo-print PDF — matches mobile TravelOrderForm / web travel order layout.
 */

export interface TravelOrderPrintItem {
  _id: string;
  travelOrderNo?: string;
  date: string;
  employee?: { name?: string; role?: string };
  employeeRole?: string;
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
    signedAsOicFor?: string | { _id?: string; name?: string } | null;
  }>;
  approverSignature?: string;
  approvedBy?: { _id?: string; name?: string };
  presidentApprovedBy?: { name?: string };
  presidentSignature?: string;
  presidentSignedAsOicFor?: { name?: string } | null;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatSalary = (salary: string | undefined) =>
  !salary ? '' : salary.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const normalizeInline = (value: string | undefined | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const travelOrderPositionLabel = (item: TravelOrderPrintItem) =>
  normalizeInline(item.employeeRole) || normalizeInline(item.employee?.role) || 'N/A';

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

export function getTravelOrderPrintHtml(
  item: TravelOrderPrintItem,
  presidentNameFallback: string,
  options?: { logoDataUri?: string }
): string {
  const salaryStr = formatSalary(item.salary);
  const recs = Array.isArray(item.recommendedBy) ? item.recommendedBy : [];
  const immediateChiefCount = recs.length > 0 ? recs.length : 1;
  const chiefsSideBySideClass = immediateChiefCount > 2 ? 'chiefs-grid' : 'chiefs-stack';
  const toNames = [item.employee?.name || '', ...((item.participants || []).filter(Boolean))];
  const recommenderBlocks = recs
    .map((chief, index) => {
      const chiefId = chief._id ? String(chief._id) : '';
      const sigEntry =
        item.recommenderSignatures?.find((s) => {
          const oic = typeof s.signedAsOicFor === 'object' && s.signedAsOicFor ? s.signedAsOicFor._id : s.signedAsOicFor;
          if (oic && chiefId && String(oic) === chiefId) return true;
          const u = typeof s.user === 'object' && s.user ? s.user._id : s.user;
          return !!u && !!chiefId && String(u) === chiefId;
        }) ?? item.recommenderSignatures?.[index];
      const sig = sigEntry?.signature ?? (index === 0 ? item.approverSignature : undefined);
      const oicSignedFor = sigEntry?.signedAsOicFor;
      const oicSignedForName = typeof oicSignedFor === 'object' && oicSignedFor ? oicSignedFor.name : null;
      const oicSigner = sigEntry?.user;
      const oicSignerName = typeof oicSigner === 'object' && oicSigner ? oicSigner.name : null;
      const isOicSigned = !!oicSignedForName;
      const displayName = isOicSigned ? (oicSignerName || chief?.name || '') : (chief?.name || '');
      const safeName = escapeHtml(displayName || '—');
      const oicLine = isOicSigned
        ? `<div class="sig-oic-note">(OIC for ${escapeHtml(oicSignedForName || '')})</div>`
        : '';
      return `
      <div class="sig-col">
        <div class="sig-header">RECOMMENDED BY ${index + 1}:</div>
        <div class="sig-box">
          ${sig ? `<div class="sig-img-wrap"><img src="${sig}" class="sig-img" alt="" /></div>` : `<div class="sig-placeholder">Pending</div>`}
          <div class="sig-name-line"><span class="sig-name">${safeName}</span></div>
        </div>
        <div class="sig-role">Immediate Chief</div>
        ${oicLine}
      </div>`;
    })
    .join('');

  const fallbackRecommenderBlock = (() => {
    const fallbackName = item.approvedBy?.name || recs[0]?.name || 'Immediate Chief';
    const sig = item.approverSignature;
    const safe = escapeHtml(fallbackName);
    return `
              <div class="sig-col">
                <div class="sig-header">RECOMMENDED BY 1:</div>
                <div class="sig-box">
                  ${sig ? `<div class="sig-img-wrap"><img src="${sig}" class="sig-img" alt="" /></div>` : `<div class="sig-placeholder">Pending</div>`}
                  <div class="sig-name-line"><span class="sig-name">${safe}</span></div>
                </div>
                <div class="sig-role">Immediate Chief</div>
              </div>`;
  })();

  // When the President's slot was signed by an OIC, show the actual signer's name (presidentApprovedBy)
  // and add an "(OIC for ...)" line below.
  const presidentSignedByOicFor = item.presidentSignedAsOicFor?.name || null;
  const presidentDisplayName =
    presidentSignedByOicFor && item.presidentApprovedBy?.name
      ? item.presidentApprovedBy.name
      : item.presidentApprovedBy?.name || presidentNameFallback || '—';
  const presidentName = escapeHtml(presidentDisplayName);
  const presidentOicLine = presidentSignedByOicFor
    ? `<div class="sig-oic-note">(OIC for ${escapeHtml(presidentSignedByOicFor)})</div>`
    : '';
  const docTitle = escapeHtml(String(item.travelOrderNo || item._id));
  const logoSlot =
    options?.logoDataUri != null && options.logoDataUri.length > 0
      ? `<img class="logo-img" src="${options.logoDataUri}" alt="" />`
      : `<div class="logo-box">LOGO</div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Travel Order - ${docTitle}</title>
  <style>
    /* A4 (210mm × 297mm) — PDF page size for print / expo-print */
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
    }
    body {
      font-family: sans-serif;
      background: #fff;
      color: #000;
      width: 210mm;
      min-height: 297mm;
    }

    .a4-stack { width: 100%; display: flex; justify-content: center; }
    .a4-page {
      width: 100%;
      max-width: 190mm;
      background: #fff;
      border: 1px solid #e6e6e6;
      border-radius: 10px;
      padding: 14px;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .doc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 10px; }
    .university-name-container { flex: 1; min-width: 0; }
    .header-rule { height: 2px; width: 92%; background: #7f93ad; margin: 3px 0; }
    .university-name { font-size: 12px; font-weight: 800; text-align: left; color: #8da2bf; line-height: 14px; letter-spacing: 0.25px; white-space: pre-line; }
    .university-motto { font-size: 7px; color: #6f7f95; font-style: italic; margin-top: 2px; }

    .logo-box { width: 56px; height: 56px; border: 1px solid #d0d5dd; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #667085; font-size: 9px; flex-shrink: 0; }
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

    .form-row { display: flex; flex-wrap: wrap; align-items: flex-start; margin-bottom: 6px; gap: 6px; }
    .label { font-size: 11px; margin-right: 4px; }
    .label-right { font-size: 11px; margin-left: 10px; margin-right: 4px; }
    .value-u { font-size: 11px; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; flex: 1; min-width: 120px; }
    .salary-u { font-size: 11px; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }

    .directive { font-size: 11px; margin: 10px 0 8px; }
    .info { font-size: 11px; margin: 0 0 6px; }
    .inline-u { font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }

    .sig-section { margin-top: 18px; }
    /* Blocks start from the left of the page; image is centered only over the name column below */
    .chiefs-grid { display: flex; flex-wrap: wrap; justify-content: flex-start; align-items: flex-start; gap: 20px; }
    .chiefs-stack { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
    .chiefs-stack .sig-col { width: 200px; max-width: 100%; }
    .chiefs-grid .sig-col { flex: 0 1 auto; width: 200px; max-width: 48%; min-width: 160px; }
    .sig-col {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
    }
    .president-row { margin-top: 16px; display: flex; justify-content: flex-start; }
    .president-row .sig-col { width: 200px; max-width: 100%; }
    .sig-header { font-size: 11px; font-weight: 800; margin-bottom: 8px; width: 100%; text-align: left; }
    .sig-box {
      width: 200px;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .sig-img-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      min-height: 52px;
      margin-bottom: -25px;
    }
    .sig-img { max-width: 170px; width: 100%; height: 50px; object-fit: contain; }
    .sig-placeholder {
      min-height: 48px;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #667085;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .sig-name-line {
      width: 100%;
      border-bottom: 1px solid #000;
      padding-bottom: 4px;
    }
    .sig-name { font-size: 12px; font-weight: 800; display: block; text-align: center; }
    .sig-role { font-size: 10px; margin-top: 8px; text-align: center; width: 100%; }
    .sig-oic-note { font-size: 8px; font-style: italic; color: #555; margin-top: 2px; text-align: center; width: 100%; }

    @media print {
      body { width: auto; min-height: auto; }
      .a4-page { border: none; border-radius: 0; max-width: 100%; }
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

      <div class="form-row">
        <span class="label">Travel Order No.</span>
        <span class="value-u">${escapeHtml(formatTravelOrderNoDisplay(item.travelOrderNo, item.date))}</span>
        <span class="label-right">Date</span>
        <span class="value-u">${escapeHtml(formatDate(item.date))}</span>
      </div>

      <div class="form-row">
        <span class="label">TO:</span>
        <span class="value-u">${escapeHtml(formatNamesList(toNames) || '—')}</span>
      </div>

      <div class="form-row">
        <span class="label">POSITION:</span>
        <span class="value-u">${escapeHtml(travelOrderPositionLabel(item))}</span>
      </div>

      <div class="form-row">
        <span class="label">ADDRESS:</span>
        <span class="value-u">${escapeHtml(normalizeInline(item.employeeAddress) || '—')}</span>
        <span class="label-right">SALARY:</span>
        <span class="salary-u">₱${escapeHtml(salaryStr || '—')}</span>
      </div>

      <div class="directive">You are hereby directed to travel on official business:</div>

      <div class="form-row">
        <span class="label">TO:</span>
        <span class="value-u">${escapeHtml(normalizeInline(item.to) || '—')}</span>
      </div>
      <div class="form-row">
        <span class="label">PURPOSE/S:</span>
        <span class="value-u">${escapeHtml(normalizeInline(item.purpose) || '—')}</span>
      </div>

      <div class="directive">You will leave and return to your official station</div>

      <div class="form-row">
        <span class="label">Date of Departure:</span>
        <span class="value-u">${escapeHtml(formatDate(item.departureDate, true))}</span>
      </div>
      <div class="form-row">
        <span class="label">Date of Arrival:</span>
        <span class="value-u">${escapeHtml(formatDate(item.arrivalDate, true))}</span>
      </div>

      <p class="info">
        You shall be guided further by the following additional instruction and information on
        <span class="inline-u"> ${escapeHtml(normalizeInline(item.additionalInfo) || '—')}</span>
      </p>
      <p class="info">
        Upon completion of your travel, you are required to submit your full report through proper channel; no travel order shall be issued for the succeeding work unless a copy of your accomplishment in the immediate past is herewith attached or presented.
      </p>

      <div class="sig-section">
        <div class="${chiefsSideBySideClass}">
          ${recommenderBlocks || fallbackRecommenderBlock}
        </div>

        <div class="president-row">
          <div class="sig-col">
            <div class="sig-header">APPROVED BY:</div>
            <div class="sig-box">
              ${item.presidentSignature ? `<div class="sig-img-wrap"><img src="${item.presidentSignature}" class="sig-img" alt="" /></div>` : `<div class="sig-placeholder">Pending</div>`}
              <div class="sig-name-line"><span class="sig-name">${presidentName}</span></div>
            </div>
            <div class="sig-role">President</div>
            ${presidentOicLine}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
