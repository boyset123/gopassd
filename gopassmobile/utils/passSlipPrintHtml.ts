/**
 * HTML for expo-print PDF — matches slips.tsx View Details pass slip layout (primary blue theme).
 */

export interface PassSlipPrintItem {
  date: string;
  status: string;
  trackingNo?: string;
  destination?: string;
  employee?: { name?: string };
  timeOut?: string;
  estimatedTimeBack?: string;
  arrivalTime?: string;
  overdueMinutes?: number;
  additionalInfo?: string;
  purpose?: string;
  signature?: string;
  approverSignature?: string;
  approvedBy?: { name?: string };
  /** Populated when the first-line approver slot was signed by an OIC standing in for this user. */
  approvedBySignedAsOicFor?: { name?: string } | null;
  rejectionReason?: string;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeInline = (value: string | undefined | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim();

function formatPassSlipDate(dateString: string | undefined): string {
  if (!dateString) return 'No Date';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'No Date';
  return date.toLocaleDateString();
}

function requestedByRoleLabel(viewerRole?: string): string {
  if (viewerRole === 'Program Head') return 'Program Head';
  if (viewerRole === 'Faculty Dean') return 'Faculty Dean';
  return 'Faculty Staff';
}

function approvedByRoleLabel(viewerRole?: string): string {
  if (viewerRole === 'Program Head') return 'Faculty Dean';
  if (viewerRole === 'Faculty Dean') return 'President';
  return 'Immediate Head';
}

export function getPassSlipPrintHtml(
  item: PassSlipPrintItem,
  options?: { viewerRole?: string; logoDataUri?: string }
): string {
  const viewerRole = options?.viewerRole;
  const dest = normalizeInline(item.destination);
  const approved =
    item.status === 'Approved' || item.status === 'Completed' || item.status === 'Verified';
  const rejected = item.status === 'Rejected';

  const trackingRow =
    item.trackingNo != null && String(item.trackingNo).trim() !== ''
      ? `<div class="meta-item"><span class="field">Tracking No.: </span><span class="val">${escapeHtml(String(item.trackingNo))}</span></div>`
      : '';

  const formatTimeOnly = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const arrivalDisplay = formatTimeOnly(item.arrivalTime);
  const arrivalRow = arrivalDisplay
    ? `<div class="row"><span class="field">Actual Time Back: </span><span class="val">${escapeHtml(arrivalDisplay)}</span></div>`
    : '';
  const overdueRow =
    typeof item.overdueMinutes === 'number' && item.overdueMinutes > 0
      ? `<div class="row overdue-row"><span class="field">Overdue: </span><span class="val overdue-val">${Math.round(item.overdueMinutes)} min</span></div>`
      : '';

  const logoSlot =
    options?.logoDataUri != null && options.logoDataUri.length > 0
      ? `<img class="logo-img" src="${options.logoDataUri}" alt="" />`
      : `<div class="logo-box">LOGO</div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pass Slip</title>
  <style>
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
      color: #011a6b;
      width: 210mm;
      min-height: 297mm;
    }
    .page {
      max-width: 190mm;
      margin: 0 auto;
      padding: 0 2mm;
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .blue-line {
      height: 2px;
      background: #011a6b;
      width: 80%;
      margin: 2px 0 5px 0;
    }
    .uni-name { font-size: 18px; font-weight: bold; color: #011a6b; line-height: 1.2; margin: 0; }
    .motto { font-size: 10px; font-style: italic; color: rgba(1, 26, 107, 0.75); margin: 4px 0 0 0; }
    .pass-type { font-size: 14px; font-weight: bold; color: #011a6b; margin-top: 5px; }
    .logo-box {
      width: 60px;
      height: 60px;
      border: 1px solid rgba(1, 26, 107, 0.22);
      border-radius: 8px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: #667085;
    }
    .logo-img {
      width: 60px;
      height: 60px;
      object-fit: contain;
      flex-shrink: 0;
      display: block;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .meta-item { color: #011a6b; }
    .field { color: #011a6b; }
    .val { font-weight: bold; text-decoration: underline; color: #011a6b; }
    .main-title { text-align: center; margin-bottom: 20px; }
    .main-title h1 {
      font-size: 20px;
      font-weight: bold;
      text-decoration: underline;
      margin: 0;
      color: #011a6b;
    }
    .sub { font-size: 14px; margin: 6px 0 0 0; color: #011a6b; }
    .row { margin-bottom: 15px; font-size: 14px; color: #011a6b; }
    .stamp {
      text-align: center;
      margin: 16px 0;
      font-size: 22px;
      font-weight: bold;
      color: #22c55e;
    }
    .rejected-banner {
      text-align: center;
      margin: 16px 0;
      font-size: 22px;
      font-weight: bold;
      color: #dc3545;
    }
    .reason-block { margin: 12px 0; font-size: 13px; color: #011a6b; }
    .overdue-row { color: #dc3545; }
    .overdue-val { color: #dc3545; }
    .sig-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 40px;
      gap: 16px;
      flex-wrap: wrap;
    }
    .sig-box {
      flex: 0 1 220px;
      width: 220px;
      max-width: 46%;
      min-width: 160px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      text-align: left;
    }
    .sig-label {
      font-size: 14px;
      color: #011a6b;
      font-weight: 600;
      margin-bottom: 10px;
      width: 100%;
      text-align: left;
    }
    /* Signature image centered only over the name strip below, not the full page */
    .sig-img-area {
      width: 100%;
      min-height: 56px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 5px;
    }
    .sig-img { max-width: 120px; max-height: 52px; width: auto; height: auto; object-fit: contain; }
    .sig-name-line {
      font-size: 14px;
      font-weight: bold;
      color: #011a6b;
      width: 100%;
      text-align: center;
      border-bottom: 1px solid #011a6b;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .sig-role-line {
      font-size: 12px;
      color: rgba(1, 26, 107, 0.75);
      width: 100%;
      text-align: center;
    }
    .sig-oic-note {
      font-size: 11px;
      font-style: italic;
      color: rgba(1, 26, 107, 0.75);
      width: 100%;
      text-align: center;
      margin-top: 2px;
    }
    @media print {
      body { width: auto; min-height: auto; }
      .page { max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="doc-header">
      <div>
        <div class="blue-line"></div>
        <p class="uni-name">DAVAO ORIENTAL</p>
        <p class="uni-name">STATE UNIVERSITY</p>
        <p class="motto">"A university of excellence, innovation, and inclusion"</p>
        <div class="blue-line"></div>
        <div class="pass-type">PASS SLIP</div>
      </div>
      ${logoSlot}
    </div>

    <div class="meta-row">
      ${trackingRow}
      <div class="meta-item"><span class="field">Date: </span><span class="val">${escapeHtml(formatPassSlipDate(item.date))}</span></div>
    </div>

    <div class="main-title">
      <h1>PASS SLIP</h1>
      <p class="sub">(Within Mati City)</p>
    </div>

    <div class="row"><span class="field">Name of Employee: </span><span class="val">${escapeHtml(item.employee?.name || 'N/A')}</span></div>
    <div class="row"><span class="field">Time Out: </span><span class="val">${escapeHtml(item.timeOut || '')}</span></div>
    <div class="row"><span class="field">Estimated Time to be Back: </span><span class="val">${escapeHtml(item.estimatedTimeBack || '')}</span></div>
    ${arrivalRow}
    ${overdueRow}
    ${dest ? `<div class="row"><span class="field">Destination: </span><span class="val">${escapeHtml(dest)}</span></div>` : ''}
    <div class="row"><span class="field">Additional Information: </span><span class="val">${escapeHtml(normalizeInline(item.additionalInfo) || '')}</span></div>
    <div class="row"><span class="field">Purpose/s: </span><span class="val">${escapeHtml(normalizeInline(item.purpose) || '')}</span></div>

    ${approved ? '<div class="stamp">APPROVED</div>' : ''}
    ${
      rejected
        ? `<div class="rejected-banner">REJECTED</div>${
            item.rejectionReason != null && String(item.rejectionReason).trim() !== ''
              ? `<div class="reason-block"><strong>Reason:</strong> ${escapeHtml(String(item.rejectionReason).trim())}</div>`
              : ''
          }`
        : ''
    }

    <div class="sig-row">
      <div class="sig-box">
        <div class="sig-label">Requested by:</div>
        <div class="sig-img-area">
          ${item.signature ? `<img src="${item.signature}" class="sig-img" alt="" />` : ''}
        </div>
        <div class="sig-name-line">${escapeHtml(item.employee?.name || 'N/A')}</div>
        <div class="sig-role-line">${escapeHtml(requestedByRoleLabel(viewerRole))}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">Approved by:</div>
        <div class="sig-img-area">
          ${item.approverSignature ? `<img src="${item.approverSignature}" class="sig-img" alt="" />` : ''}
        </div>
        <div class="sig-name-line">${escapeHtml(item.approvedBy?.name || 'N/A')}</div>
        <div class="sig-role-line">${escapeHtml(approvedByRoleLabel(viewerRole))}</div>
        ${item.approvedBySignedAsOicFor?.name
          ? `<div class="sig-oic-note">(OIC for ${escapeHtml(item.approvedBySignedAsOicFor.name)})</div>`
          : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}
