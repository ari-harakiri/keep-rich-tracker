import { extractText } from './paystub-reader-core.mjs?v=31';

const STORAGE_KEY = 'keepRichPaystubsV1';
const $ = selector => document.querySelector(selector);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
let paystubs = readSaved();
let activePaystubFile = null;

function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveAll() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paystubs));
  window.KeepRichCloud?.changed('Paystub data');
  window.dispatchEvent(new Event('paystubs:changed'));
}

function safeText(value) {
  return String(value ?? '').replace(/[<>&"']/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function moneyOrDash(value) {
  return value === null || value === undefined ? '—' : money.format(value);
}

function numberOrDash(value) {
  return value === null || value === undefined ? '—' : Number(value).toFixed(2);
}

function toIso(usDate) {
  if (!usDate) return '';
  const match = usDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : '';
}

function compact(text) {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstNumber(text, patterns, group = 1) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[group]) return numberOrNull(match[group]);
  }
  return null;
}

function parsePaystub(rawText) {
  const text = compact(rawText);
  const payDate = text.match(/Pay\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] || '';
  const period = text.match(/Pay\s*Period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const hours = firstNumber(text, [
    /Hours\s*Worked\s+([\d,.]+)/i,
    /Regular\s+[\d,.]+\s+([\d,.]+)\s+[\d,.]+/i,
    /Hours\s*Paid\s+([\d,.]+)/i
  ]);
  const commission = firstNumber(text, [
    /Commission\s+([\d,.]+)\s+[\d,.]+/i,
    /Commission\s+(?:Current\s+)?([\d,.]+)/i
  ]);
  const gross = firstNumber(text, [/Gross\s*Pay\s+([\d,.]+)/i, /Gross\s+([\d,.]+)/i]);
  const net = firstNumber(text, [/Net\s*Pay\s+([\d,.]+)/i, /Net\s+([\d,.]+)/i]);
  return {
    payDate: toIso(payDate),
    periodStart: toIso(period?.[1] || ''),
    periodEnd: toIso(period?.[2] || ''),
    hours,
    commission,
    gross,
    net
  };
}

function setField(id, value) {
  $(id).value = value ?? '';
}

function populateForm(data, filename) {
  setField('#stub-pay-date', data.payDate);
  setField('#stub-period-start', data.periodStart);
  setField('#stub-period-end', data.periodEnd);
  setField('#stub-hours', data.hours);
  setField('#stub-commission', data.commission);
  setField('#stub-gross', data.gross);
  setField('#stub-net', data.net);
  setField('#stub-source', filename);
  $('#paystub-form').hidden = false;
}

function renderPaystubs() {
  const rows = [...paystubs].sort((a, b) => b.payDate.localeCompare(a.payDate));
  $('#paystub-body').innerHTML = rows.map(stub => `
    <tr>
      <td>${safeText(stub.payDate)}</td>
      <td>${stub.periodStart || stub.periodEnd ? `${safeText(stub.periodStart || '—')} – ${safeText(stub.periodEnd || '—')}` : '—'}</td>
      <td>${numberOrDash(stub.hours)}</td>
      <td>${moneyOrDash(stub.commission)}</td>
      <td>${moneyOrDash(stub.gross)}</td>
      <td>${moneyOrDash(stub.net)}</td>
      <td class="paystub-row-source" title="${safeText(stub.source)}">${safeText(stub.source)}</td>
      <td><button class="delete-row" type="button" data-delete-stub="${safeText(stub.id)}" aria-label="Delete paystub from ${safeText(stub.payDate)}">×</button></td>
    </tr>`).join('');
  $('#paystub-empty').style.display = rows.length ? 'none' : 'block';
}

async function processPaystubFile(file) {
  if (!file || activePaystubFile === file) return;
  activePaystubFile = file;
  const input = $('#paystub-file');
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    $('#paystub-status').textContent = 'Please choose a PDF file.';
    if (window.KeepRichPendingPaystubFile === file) window.KeepRichPendingPaystubFile = null;
    input.value = '';
    activePaystubFile = null;
    return;
  }
  input.disabled = true;
  const status = $('#paystub-status');
  delete status.dataset.readerError;
  status.textContent = `Scanning ${file.name} locally…`;
  $('#paystub-form').hidden = true;
  try {
    const data = parsePaystub(await extractText(file));
    populateForm(data, file.name);
    const found = [data.payDate, data.periodStart, data.periodEnd, data.hours, data.commission, data.gross, data.net].filter(value => value !== '' && value !== null).length;
    status.textContent = found
      ? `Found ${found} fields. Review anything missing, then save.`
      : 'No familiar fields were found. You can enter the values manually before saving.';
  } catch (error) {
    console.error(error);
    status.dataset.readerError = String(error?.message || error || 'Unknown PDF reading error');
    populateForm({
      payDate: '', periodStart: '', periodEnd: '', hours: null,
      commission: null, gross: null, net: null
    }, file.name);
    status.textContent = `Automatic reading failed (${error?.message || 'unknown reader error'}). You can enter the paystub totals below and save them.`;
  } finally {
    if (window.KeepRichPendingPaystubFile === file) window.KeepRichPendingPaystubFile = null;
    input.value = '';
    input.disabled = false;
    activePaystubFile = null;
  }
}

$('#paystub-file').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  window.KeepRichPendingPaystubFile = file;
  void processPaystubFile(file);
});

$('#paystub-form').addEventListener('submit', event => {
  event.preventDefault();
  const payDate = $('#stub-pay-date').value;
  if (!payDate) {
    $('#paystub-status').textContent = 'A pay date is required before saving.';
    return;
  }
  const record = {
    id: crypto.randomUUID(),
    payDate,
    periodStart: $('#stub-period-start').value || null,
    periodEnd: $('#stub-period-end').value || null,
    hours: numberOrNull($('#stub-hours').value),
    commission: numberOrNull($('#stub-commission').value),
    gross: numberOrNull($('#stub-gross').value),
    net: numberOrNull($('#stub-net').value),
    source: $('#stub-source').value.trim() || 'paystub.pdf'
  };
  paystubs.push(record);
  saveAll();
  renderPaystubs();
  $('#paystub-status').textContent = `Saved paystub dated ${record.payDate}.`;
  event.target.reset();
  event.target.hidden = true;
  $('#paystub-file').value = '';
});

$('#use-stub-date').addEventListener('click', () => {
  const date = $('#stub-pay-date').value;
  if (!date) {
    $('#paystub-status').textContent = 'No pay date is available to copy.';
    return;
  }
  $('#pay-date').value = date;
  window.dispatchEvent(new CustomEvent('tracker:navigate', { detail: 'log-shift' }));
  $('#entry').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#entry-status').textContent = `Pay date ${date} copied from the paystub. Add shift details before saving.`;
});

$('#paystub-body').addEventListener('click', event => {
  const id = event.target.dataset.deleteStub;
  if (!id) return;
  if (!confirm('Delete this saved paystub summary from this browser?')) return;
  paystubs = paystubs.filter(stub => stub.id !== id);
  saveAll();
  renderPaystubs();
});

window.addEventListener('tracker:data-loaded', () => {
  paystubs = readSaved();
  renderPaystubs();
  window.dispatchEvent(new Event('paystubs:changed'));
});

renderPaystubs();
window.KeepRichPdfReaderReady = true;
const pendingPaystubFile = window.KeepRichPendingPaystubFile;
if (pendingPaystubFile) void processPaystubFile(pendingPaystubFile);
