import { DORSU_LOGO_DATA_URI } from './dorsuLogoDataUri';

export interface PassSlipPrintItem {
  _id: string;
  date: string;
  status?: string;
  trackingNo?: string;
  destination?: string;
  purpose?: string;
  timeOut?: string;
  estimatedTimeBack?: string;
  arrivalTime?: string;
  overdueMinutes?: number;
  employee?: { name?: string; role?: string };
  approvedBy?: { name?: string };
  /** Populated when the first-line approver slot was actually signed by an OIC standing in for this user. */
  approvedBySignedAsOicFor?: { _id?: string; name?: string } | null;
  signature?: string;
  approverSignature?: string;
  arrivalStatus?: string;
}

interface PassSlipPrintOptions {
  logoSrc?: string;
  logoFallbackSrc?: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeInline = (value: string | undefined | null) => (value ?? '').replace(/\s+/g, ' ').trim();

const formatDate = (dateString: string | undefined) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const requestedRoleLabel = (role: string | undefined) => {
  if (role === 'Program Head') return 'Program Head';
  if (role === 'Faculty Dean') return 'Faculty Dean';
  return 'Faculty Staff';
};

const approvedRoleLabel = (role: string | undefined) => {
  if (role === 'Faculty Dean') return 'President';
  if (role === 'Program Head') return 'Faculty Dean';
  return 'Immediate Head';
};

const statusStamp = (item: PassSlipPrintItem) => {
  const raw = String(item.arrivalStatus || item.status || '').toLowerCase();
  if (raw.includes('overdue') || (typeof item.overdueMinutes === 'number' && item.overdueMinutes > 0)) {
    return '<div class="stamp overdue">OVERDUE</div>';
  }
  if (raw.includes('on time')) return '<div class="stamp ontime">ON TIME</div>';
  if (raw.includes('approved') || raw.includes('verified') || raw.includes('completed')) {
    return '<div class="stamp approved">APPROVED</div>';
  }
  if (raw.includes('rejected')) return '<div class="stamp rejected">REJECTED</div>';
  return '';
};

const formatPrintTime = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const renderSlipCard = (item: PassSlipPrintItem, options?: PassSlipPrintOptions) => {
  const employeeRole = item.employee?.role;
  const resolvedLogoSrc = options?.logoSrc && options.logoSrc.length > 0 ? options.logoSrc : DORSU_LOGO_DATA_URI;
  const fallbackSrcAttr =
    options?.logoFallbackSrc && options.logoFallbackSrc.length > 0
      ? ` data-fallback-src="${escapeHtml(options.logoFallbackSrc)}"`
      : '';
  const logoSlot =
    resolvedLogoSrc && resolvedLogoSrc.length > 0
      ? `<img class="logo-img" src="${escapeHtml(resolvedLogoSrc)}" alt="DOrSU Logo"${fallbackSrcAttr} onerror="if(this.dataset.fallbackSrc && this.src!==this.dataset.fallbackSrc){this.src=this.dataset.fallbackSrc;}else{this.classList.add('logo-img-failed');}" />`
      : `<div class="logo-box">LOGO</div>`;
  return `
    <article class="slip-card">
      <div class="header-row">
        <div class="uni-wrap">
          <div class="rule"></div>
          <div class="uni-name">DAVAO ORIENTAL</div>
          <div class="uni-name">STATE UNIVERSITY</div>
          <div class="motto">"A university of excellence, innovation, and inclusion"</div>
          <div class="rule"></div>
          <div class="mini-title">PASS SLIP</div>
        </div>
        ${logoSlot}
      </div>

      <div class="meta-row">
        <div><strong>Tracking No.:</strong> ${escapeHtml(normalizeInline(item.trackingNo) || 'N/A')}</div>
        <div><strong>Date:</strong> ${escapeHtml(formatDate(item.date))}</div>
      </div>

      <div class="main-title">PASS SLIP</div>
      <div class="subtitle">(Within Mati City)</div>

      <div class="field data-field"><strong>Name of Employee:</strong> ${escapeHtml(normalizeInline(item.employee?.name) || 'N/A')}</div>
      <div class="field data-field"><strong>Time Out:</strong> ${escapeHtml(normalizeInline(item.timeOut) || 'N/A')}</div>
      <div class="field data-field"><strong>Estimated Time to be Back:</strong> ${escapeHtml(normalizeInline(item.estimatedTimeBack) || 'N/A')}</div>
      ${formatPrintTime(item.arrivalTime)
        ? `<div class="field data-field"><strong>Actual Time Back:</strong> ${escapeHtml(formatPrintTime(item.arrivalTime))}</div>`
        : ''}
      ${typeof item.overdueMinutes === 'number' && item.overdueMinutes > 0
        ? `<div class="field data-field overdue-field"><strong>Overdue:</strong> ${Math.round(item.overdueMinutes)} min</div>`
        : ''}
      <div class="field data-field"><strong>Destination:</strong> ${escapeHtml(normalizeInline(item.destination) || 'N/A')}</div>
      <div class="field data-field"><strong>Purpose/s:</strong> ${escapeHtml(normalizeInline(item.purpose) || 'N/A')}</div>

      ${statusStamp(item)}

      <div class="sig-row">
        <div class="sig-col">
          <div class="sig-label">Requested by:</div>
          <div class="sig-box">
            ${item.signature ? `<img src="${item.signature}" class="sig-img" alt="" />` : '<div class="sig-empty"></div>'}
            <div class="sig-name">${escapeHtml(normalizeInline(item.employee?.name) || 'N/A')}</div>
          </div>
          <div class="sig-role">${escapeHtml(requestedRoleLabel(employeeRole))}</div>
        </div>
        <div class="sig-col">
          <div class="sig-label">Approved by:</div>
          <div class="sig-box">
            ${item.approverSignature ? `<img src="${item.approverSignature}" class="sig-img" alt="" />` : '<div class="sig-empty"></div>'}
            <div class="sig-name">${escapeHtml(normalizeInline(item.approvedBy?.name) || 'N/A')}</div>
          </div>
          ${item.approvedBySignedAsOicFor?.name ? `<div class="sig-oic-note">(OIC for ${escapeHtml(normalizeInline(item.approvedBySignedAsOicFor.name))})</div>` : ''}
          <div class="sig-role">${escapeHtml(approvedRoleLabel(employeeRole))}</div>
        </div>
      </div>
    </article>
  `;
};

export function getPassSlipPrintHtml(item: PassSlipPrintItem, options?: PassSlipPrintOptions): string {
  const slipCards = Array.from({ length: 4 }, () => renderSlipCard(item, options)).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Pass Slip - ${escapeHtml(item._id)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm;
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: "Times New Roman", Times, serif; color: #000; }

    .page {
      width: 194mm; /* A4 width (210) - page margins (8mm * 2) */
      height: 281mm; /* A4 height (297) - page margins (8mm * 2) */
      margin: 4mm auto 0;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(2, calc((281mm - 6mm) / 2));
      gap: 6mm;
    }

    .slip-card {
      border: 1px solid #222;
      border-radius: 4px;
      padding: 4mm;
      display: flex;
      flex-direction: column;
      break-inside: avoid;
      overflow: hidden;
      height: 100%;
      min-height: 0;
    }

    .header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
    .uni-wrap { flex: 1; min-width: 0; }
    .rule { height: 1px; background: #111; margin: 1px 0 2px; width: 78%; }
    .uni-name { font-size: 12px; font-weight: 700; line-height: 1.14; font-family: Arial, sans-serif; }
    .motto { font-size: 8.5px; font-style: italic; color: #444; margin-top: 1px; }
    .mini-title { margin-top: 3px; font-size: 11px; font-weight: 700; }
    .logo-box {
      width: 40px;
      height: 40px;
      border: 1px solid #999;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: #666;
      flex-shrink: 0;
    }
    .logo-img {
      width: 40px;
      height: 40px;
      object-fit: contain;
      flex-shrink: 0;
      display: block;
    }
    .logo-img-failed {
      display: block;
      border: 1px dashed #999;
      background: #f3f4f6;
    }

    .meta-row {
      margin-top: 4px;
      font-size: 10.6px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .main-title { margin-top: 5px; text-align: center; font-size: 16.5px; font-weight: 800; text-decoration: underline; }
    .subtitle { text-align: center; font-size: 9.8px; margin-bottom: 5px; }

    .field { font-size: 9.8px; margin-bottom: 2px; line-height: 1.24; }
    .data-field { font-size: 11.8px; line-height: 1.32; margin-bottom: 3px; }
    .overdue-field { color: #c53030; }
    .overdue-field strong { color: #c53030; }

    .stamp {
      align-self: center;
      margin: 4px 0 3px;
      padding: 1px 6px;
      border: 1px solid currentColor;
      font-size: 12px;
      font-weight: 800;
      transform: rotate(-12deg);
      opacity: 0.88;
    }
    .stamp.approved { color: #2f855a; }
    .stamp.rejected { color: #c53030; }
    .stamp.overdue { color: #c53030; }
    .stamp.ontime { color: #2b6cb0; }

    .sig-row {
      margin-top: auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .sig-label { font-size: 10.8px; margin-bottom: 4px; font-weight: 700; }
    .sig-box { min-height: 66px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
    .sig-empty { height: 34px; }
    .sig-img { max-width: 120px; max-height: 38px; object-fit: contain; }
    .sig-name {
      width: 100%;
      margin-top: 1px;
      border-bottom: 1px solid #111;
      text-align: center;
      font-size: 11.4px;
      font-weight: 700;
      padding-bottom: 1px;
      line-height: 1.1;
    }
    .sig-role { text-align: center; font-size: 9.6px; margin-top: 2px; color: #333; }
    .sig-oic-note { text-align: center; font-size: 8.6px; font-style: italic; color: #555; margin-top: 1px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page {
        width: 194mm;
        height: 281mm;
        margin: 4mm auto 0;
      }
    }
  </style>
</head>
<body>
  <section class="page">
    ${slipCards}
  </section>
</body>
</html>`;
}
