// 問題單建立工具 — 前端。串接 config.js 指定的 GAS Web App；
// 若 config.js 尚未填入真實網址，會自動退回「展示模式」（假資料、不呼叫後端），
// 方便在 GAS/Sheet/Drive 都還沒建立好之前，仍可預覽與操作畫面。

const MAX_IMAGES = 5;
const MAX_IMAGE_MB = 5;
const HISTORY_LIMIT = 20;

const DEMO_MODE = !window.APP_CONFIG?.GAS_API_URL || window.APP_CONFIG.GAS_API_URL.startsWith('PASTE_YOUR');

// 展示模式用的假選項（GAS 尚未部署時的備援），內容與正式「設定分頁」保持一致
const DEMO_OPTIONS = {
  site: ['委員端', '建築師端', '後台端'],
  module: [
    '審議案件查詢', '會議記錄與議程', '相關文件下載', '相關法令下載', '相關網站連結',
    '審議案件維護', '法規研議案件維護', '審議會議管理', '審議委員名冊管理', '數據統計系統',
    '使用者權限管理', '使用者紀錄', '代碼維護', '審議相關文件下載', '網站連結維護',
    '近期會議資訊', '歷史會議資訊',
  ],
  type: ['畫面調整', '規則補充', 'bug處理', '契約工項缺漏', '資料調整', '需求挑整'],
  reporter: ['Sam', '安柏', '鎔瑄'],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- RWD：依實際視窗寬度切換桌機/手機版面 ---------------- */
function computeView() {
  return window.innerWidth >= 768 ? 'desktop' : 'mobile';
}
function applyView() {
  document.body.dataset.view = computeView();
}
window.addEventListener('resize', applyView);
applyView();

/* ---------------- 歷史紀錄面板 ---------------- */
const historyDrawer = $('#historyDrawer');
const scrim = $('#scrim');
const historyList = $('#historyList');
const historyEmpty = $('#historyEmpty');

function openHistory() {
  historyDrawer.classList.add('open');
  scrim.hidden = false;
}
function closeHistory() {
  historyDrawer.classList.remove('open');
  scrim.hidden = true;
}
$('#historyToggleBtn').addEventListener('click', openHistory);
$('#fabHistoryBtn').addEventListener('click', openHistory);
$('#closeHistoryBtn').addEventListener('click', closeHistory);
scrim.addEventListener('click', closeHistory);

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('issueHistory') || '[]'); }
  catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem('issueHistory', JSON.stringify(list.slice(0, HISTORY_LIMIT)));
}
function renderHistory() {
  const list = loadHistory();
  historyEmpty.hidden = list.length > 0;
  historyList.innerHTML = list.map(item => `
    <li class="history-item">
      <div class="history-item-id">#${item.id}　${item.date}</div>
      <div class="history-item-text">${escapeHtml(item.text)}</div>
      <button type="button" class="btn-secondary" data-copy="${item.id}">📋 複製</button>
    </li>
  `).join('');
  $$('button[data-copy]', historyList).forEach(btn => {
    btn.addEventListener('click', () => {
      const item = list.find(i => String(i.id) === btn.dataset.copy);
      if (item) copyText(item.text, btn);
    });
  });
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
renderHistory();

/* ---------------- 圖片上傳（Ctrl+V 貼上 / 點擊選擇 / 拖曳） ---------------- */
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const thumbGrid = $('#thumbGrid');
const imageLimitError = $('#imageLimitError');
let images = []; // { dataUrl }

function addImageFile(file) {
  if (!file.type.startsWith('image/')) return;
  if (images.length >= MAX_IMAGES) {
    showImageLimitError(`最多只能上傳 ${MAX_IMAGES} 張圖片`);
    return;
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    showImageLimitError(`單張檔案不可超過 ${MAX_IMAGE_MB}MB`);
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    images.push({ dataUrl: e.target.result });
    renderThumbs();
  };
  reader.readAsDataURL(file);
}
function showImageLimitError(msg) {
  imageLimitError.textContent = msg;
  imageLimitError.hidden = false;
  setTimeout(() => { imageLimitError.hidden = true; }, 2500);
}
function renderThumbs() {
  thumbGrid.innerHTML = images.map((img, i) => `
    <div class="thumb">
      <img src="${img.dataUrl}" alt="問題截圖 ${i + 1}">
      <button type="button" data-remove="${i}" aria-label="刪除圖片">✕</button>
    </div>
  `).join('');
  $$('button[data-remove]', thumbGrid).forEach(btn => {
    btn.addEventListener('click', () => {
      images.splice(Number(btn.dataset.remove), 1);
      renderThumbs();
    });
  });
}

dropzone.addEventListener('click', () => fileInput.click());
$('#pickImageBtn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => {
  Array.from(fileInput.files).forEach(addImageFile);
  fileInput.value = '';
});
window.addEventListener('paste', e => {
  const items = Array.from(e.clipboardData?.items || []);
  items.filter(i => i.kind === 'file').forEach(i => addImageFile(i.getAsFile()));
});
['dragover', 'dragenter'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('drag-over'); })
);
dropzone.addEventListener('drop', e => {
  Array.from(e.dataTransfer?.files || []).forEach(addImageFile);
});

/* ---------------- 表單驗證與送出 ---------------- */
const form = $('#issueForm');
const submitBtn = $('#submitBtn');
const siteSelect = $('.field[data-field="site"] select');
const moduleSelect = $('.field[data-field="module"] select');
const reporterSelect = $('#reporterSelect');

// 系統站台／系統模組／提出者，預設帶入上次選擇（存在瀏覽器 LocalStorage）
const lastSite = localStorage.getItem('lastSite');
const lastModule = localStorage.getItem('lastModule');
const lastReporter = localStorage.getItem('lastReporter');

/* ---------------- 下拉選單資料來源（GAS 設定分頁 / 展示模式假資料） ---------------- */
function populateSelects(options) {
  const selectByField = {
    site: siteSelect,
    module: moduleSelect,
    type: $('.field[data-field="type"] select'),
    reporter: reporterSelect,
  };
  Object.entries(selectByField).forEach(([key, select]) => {
    (options[key] || []).forEach(text => {
      const opt = document.createElement('option');
      opt.value = text;
      opt.textContent = text;
      select.appendChild(opt);
    });
  });
  if (lastSite) siteSelect.value = lastSite;
  if (lastModule) moduleSelect.value = lastModule;
  if (lastReporter) reporterSelect.value = lastReporter;
}

async function loadOptions() {
  if (DEMO_MODE) {
    populateSelects(DEMO_OPTIONS);
    return;
  }
  try {
    const res = await fetch(`${window.APP_CONFIG.GAS_API_URL}?action=getOptions`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '讀取失敗');
    populateSelects(data.options);
  } catch (err) {
    showToast('讀取下拉選單失敗，請確認 config.js 的 GAS 網址是否正確', 'error');
  }
}
loadOptions();

function validate() {
  let firstInvalid = null;
  $$('.field[data-field]', form).forEach(field => {
    const input = $('select, textarea, input', field);
    const valid = input.value.trim() !== '';
    field.classList.toggle('invalid', !valid);
    if (!valid && !firstInvalid) firstInvalid = input;
  });
  return firstInvalid;
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  $('.btn-label', submitBtn).textContent = isLoading ? '送出中...' : '送出問題單';
  $('.spinner', submitBtn).hidden = !isLoading;
}

function showToast(message, type = '') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = 'toast' + (type ? ` toast-${type}` : '');
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 3000);
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const firstInvalid = validate();
  if (firstInvalid) {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstInvalid.focus();
    showToast('請完成所有必填欄位', 'error');
    return;
  }

  setLoading(true);

  if (DEMO_MODE) {
    setTimeout(() => {
      setLoading(false);
      submitSuccessDemo();
    }, 900);
    return;
  }

  try {
    const res = await fetch(window.APP_CONFIG.GAS_API_URL, {
      method: 'POST',
      // 用 text/plain 避免瀏覽器對跨網域 POST 送出 CORS 預檢請求
      // （GAS 無法妥善回應 OPTIONS 預檢）；GAS 端仍會把內容當 JSON 解析。
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(buildPayload()),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.success) throw new Error(data.message || '送出失敗');
    submitSuccessReal(data);
  } catch (err) {
    setLoading(false);
    showToast(err.message || '送出失敗，請稍後重試', 'error'); // 保留表單內容，不清空
  }
});

function fieldValue(name) {
  return $(`.field[data-field="${name}"] select, .field[data-field="${name}"] input, .field[data-field="${name}"] textarea`).value.trim();
}

function buildPayload() {
  return {
    appKey: window.APP_CONFIG.APP_KEY,
    site: fieldValue('site'),
    module: fieldValue('module'),
    function: fieldValue('function'),
    type: fieldValue('type'),
    description: fieldValue('description'),
    reporter: reporterSelect.value,
    images: images.map(img => {
      const [, mimeType, base64] = img.dataUrl.match(/^data:(.+?);base64,(.+)$/) || [];
      return { mimeType, base64 };
    }),
  };
}

function submitSuccessDemo() {
  const description = fieldValue('description');
  const nextId = 1024 + loadHistory().length;
  const today = new Date().toISOString().slice(0, 10);
  const fakeLink = `https://docs.google.com/spreadsheets/d/xxxxxxxx/edit#gid=0&range=A${nextId - 1000}`;
  const text = `[${nextId}]問題單，需要幫我調整，問題是:${description}，連結: ${fakeLink}`;
  finishSuccess(nextId, today, text);
}

function submitSuccessReal(data) {
  const description = fieldValue('description');
  const today = new Date().toISOString().slice(0, 10);
  const text = `[${data.ticketId}]問題單，需要幫我調整，問題是:${description}，連結: ${data.sheetUrl}`;
  finishSuccess(data.ticketId, today, text);
}

function finishSuccess(ticketId, date, text) {
  // 記住系統站台／系統模組／提出者，下次開啟或送出下一筆時預設帶入
  localStorage.setItem('lastSite', siteSelect.value);
  localStorage.setItem('lastModule', moduleSelect.value);
  localStorage.setItem('lastReporter', reporterSelect.value);

  // 寫入歷史紀錄
  const history = [{ id: ticketId, date, text }, ...loadHistory()];
  saveHistory(history);
  renderHistory();

  // 顯示成功卡片
  $('#successId').textContent = `#${ticketId}`;
  $('#successText').textContent = text;
  $('#successOverlay').hidden = false;
}

$('#copyBtn').addEventListener('click', () => copyText($('#successText').textContent, $('#copyBtn')));
$('#nextBtn').addEventListener('click', () => {
  $('#successOverlay').hidden = true;
  resetForm();
});

function resetForm() {
  $$('.field[data-field]', form).forEach(f => f.classList.remove('invalid'));
  $$('select', form).forEach(s => { if (s !== reporterSelect && s !== siteSelect && s !== moduleSelect) s.value = ''; });
  $('.field[data-field="function"] input', form).value = '';
  $('textarea', form).value = '';
  images = [];
  renderThumbs();
}

function copyText(text, triggerBtn) {
  navigator.clipboard?.writeText(text).then(() => {
    showToast('已複製到剪貼簿', 'success');
    if (triggerBtn) {
      const original = triggerBtn.textContent;
      triggerBtn.textContent = '✅ 已複製';
      setTimeout(() => { triggerBtn.textContent = original; }, 1500);
    }
  }).catch(() => showToast('複製失敗，請手動選取文字', 'error'));
}
