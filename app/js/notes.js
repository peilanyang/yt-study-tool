// 筆記（F4）、截圖（F5）與截圖放大
'use strict';
import { $, $$, html, raw, setHtml, fmt, uid, toast, download, safeName } from './util.js';
import { sortNotes } from './model.js';
import { shots, shotUrl, forgetShotUrl } from './store.js';
import * as player from './player.js';
import * as capture from './capture.js';

let ctx;
let freshId = null; // 剛截圖、等待寫筆記的那則
let lbNote = null;

export function initNotes(c) {
  ctx = c;
  $('#bAddNote').addEventListener('click', addFromInput);
  $('#noteIn').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addFromInput(); } });
  $('#bCopyNotes').addEventListener('click', copyAll);
  $('#notes').addEventListener('click', onNotesClick);
  $('#notes').addEventListener('input', onNotesInput);
  $('#notes').addEventListener('keydown', onNotesKey);
  $('#notes').addEventListener('change', (e) => {
    if (e.target.id === 'pauseOnShot') { ctx.state.settings.pauseOnShot = e.target.checked; ctx.save(); }
  });
  $('#shots').addEventListener('click', (e) => { const b = e.target.closest('[data-note]'); if (b) openLightbox(b.dataset.note); });
  $('#bShot').addEventListener('click', takeShot);
  $('#bStopCap').addEventListener('click', capture.stopCapture);
  capture.onCaptureChange((on) => {
    $('#capState').textContent = on ? '● 已開啟畫面分享，按「截圖」或 S 即可截圖' : '第一次截圖時，瀏覽器會問要分享哪個畫面，請選「這個分頁」。';
    $('#capState').classList.toggle('on', on);
    $('#bStopCap').hidden = !on;
  });
  initLightbox();
  setInterval(() => { const l = $('#noteInLabel'); if (l && player.isReady()) l.textContent = `新筆記（會記下目前時間 ${fmt(player.now())}）`; }, 1000);
}

export function addNote(t, text = '', shotId = null) {
  const v = ctx.cur();
  if (!v) return null;
  const now = Date.now();
  const n = { id: uid(), t: t ?? null, text, shotId, created: now, updatedAt: now };
  v.notes.push(n);
  sortNotes(v);
  ctx.touch();
  render();
  renderShots();
  return n;
}

function addFromInput() {
  const text = $('#noteIn').value.trim();
  if (!text) return;
  if (!ctx.cur()) { toast('請先選擇影片'); return; }
  addNote($('#noteAtTime').checked ? player.now() : null, text);
  $('#noteIn').value = '';
}

async function takeShot() {
  const v = ctx.cur();
  if (!v) { toast('請先選擇影片'); return; }
  try {
    const t = player.now();
    const blob = await capture.grab($('#playerWrap'));
    if (ctx.state.settings.pauseOnShot) player.pause();
    const id = uid();
    await shots.set(id, blob);
    const f = $('#flash'); f.style.opacity = '0.7'; setTimeout(() => (f.style.opacity = '0'), 120);
    const n = addNote(t, '', id);
    freshId = n.id;
    ctx.switchTab('nt');
    await render();
    if (document.fullscreenElement) { toast(`已截圖 ${fmt(t)}，離開全螢幕後可寫筆記`); return; }
    const ta = $(`#notes textarea[data-note="${n.id}"]`);
    if (ta) { ta.scrollIntoView({ block: 'nearest' }); ta.focus(); }
  } catch (e) {
    toast(e.message);
  }
}

export async function render() {
  const v = ctx.cur();
  $('#ntCount').textContent = v && v.notes.length ? `(${v.notes.length})` : '';
  $('#ntGen').hidden = !v || v.segs.length > 0;
  if (!v) { setHtml($('#notes'), ''); return; }
  if (!v.notes.length) {
    setHtml($('#notes'), html`<p class="hint">還沒有筆記。看影片時按 <kbd>N</kbd> 記筆記，按 <kbd>S</kbd> 截圖。</p>`);
    return;
  }
  const pause = ctx.state.settings.pauseOnShot;
  setHtml($('#notes'), v.notes.map((n) => {
    const fresh = n.id === freshId;
    return html`<div class="note ${fresh ? 'fresh' : ''}" data-n="${n.id}">
      <div class="h">
        ${n.t != null ? html`<button class="ts" data-seek="${n.t}">▶ ${fmt(n.t)}</button>` : html`<span>（無時間）</span>`}
        ${fresh ? html`<span class="strong" style="color:var(--acc-ink)">剛剛的截圖</span>` : ''}
        <span class="grow"></span>
        ${n.shotId ? html`<button class="ghost" data-zoom="${n.id}">放大</button>` : ''}
        <button class="ghost" data-del="${n.id}" aria-label="刪除這則筆記">刪除</button>
      </div>
      ${n.shotId ? html`<img data-shot="${n.shotId}" data-zoom="${n.id}" alt="${fmt(n.t)} 的截圖">` : ''}
      ${n.shotId ? html`<label class="label" for="ta-${n.id}">這張截圖的筆記</label>` : ''}
      <textarea id="ta-${n.id}" data-note="${n.id}" rows="${Math.min(8, Math.max(2, n.text.split('\n').length))}" placeholder="${fresh ? '寫下這個畫面在做什麼…（Enter 儲存，Esc 略過）' : '筆記內容'}" ${n.shotId ? '' : raw('aria-label="筆記內容"')}>${n.text}</textarea>
      ${fresh ? html`<div class="row">
        <label class="check"><input type="checkbox" id="pauseOnShot" ${pause ? 'checked' : ''}> 截圖後暫停影片</label>
        <span class="grow"></span>
        <button data-skip="${n.id}">略過</button>
        <button class="primary" data-save="${n.id}">儲存</button>
      </div>` : ''}
    </div>`;
  }));
  for (const img of $$('#notes img[data-shot]')) img.src = await shotUrl(img.dataset.shot);
}

export async function renderShots() {
  const v = ctx.cur();
  const list = v ? v.notes.filter((n) => n.shotId) : [];
  $('#shCount').textContent = list.length ? `(${list.length})` : '';
  if (!list.length) { setHtml($('#shots'), html`<p class="hint">還沒有截圖。看影片時按 <kbd>S</kbd> 截圖。</p>`); return; }
  setHtml($('#shots'), list.map((n) => html`<button data-note="${n.id}" aria-label="放大 ${fmt(n.t)} 的截圖"><img data-shot="${n.shotId}" alt=""><span>${n.t != null ? fmt(n.t) : ''} ${n.text}</span></button>`));
  for (const img of $$('#shots img[data-shot]')) img.src = await shotUrl(img.dataset.shot);
}

function findNote(id) { return ctx.cur()?.notes.find((n) => n.id === id); }

async function onNotesClick(e) {
  const b = e.target.closest('[data-seek],[data-del],[data-zoom],[data-skip],[data-save]');
  if (!b) return;
  if (b.dataset.seek) return player.seek(Number(b.dataset.seek));
  if (b.dataset.zoom) return openLightbox(b.dataset.zoom);
  if (b.dataset.skip || b.dataset.save) { freshId = null; render(); renderShots(); return; }
  if (b.dataset.del) {
    const n = findNote(b.dataset.del);
    if (!confirm('刪除這則筆記' + (n.shotId ? '（含截圖）' : '') + '？')) return;
    await deleteNote(n);
  }
}

async function deleteNote(n) {
  const v = ctx.cur();
  if (n.shotId) { await shots.del(n.shotId); forgetShotUrl(n.shotId); }
  v.notes = v.notes.filter((x) => x !== n);
  if (freshId === n.id) freshId = null;
  ctx.touch();
  render();
  renderShots();
}

let inputTimer;
function onNotesInput(e) {
  const id = e.target.dataset.note;
  if (!id) return;
  const n = findNote(id);
  n.text = e.target.value;
  n.updatedAt = Date.now();
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => { ctx.touch(); renderShots(); }, 400);
}

function onNotesKey(e) {
  const id = e.target.dataset.note;
  if (!id || id !== freshId) return;
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); freshId = null; ctx.touch(); render(); renderShots(); toast('已儲存截圖筆記'); }
  if (e.key === 'Escape') { e.preventDefault(); freshId = null; render(); }
}

async function copyAll() {
  const v = ctx.cur();
  if (!v) return;
  const text = v.notes.map((n) => `${n.t != null ? `[${fmt(n.t)}] ` : ''}${n.text}${n.shotId ? '（截圖）' : ''}`).join('\n');
  try { await navigator.clipboard.writeText(text); toast('已複製全部筆記'); } catch { toast('複製失敗'); }
}

/* ---------- 截圖放大 ---------- */
function initLightbox() {
  const dlg = $('#dlgLb');
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  $('#lbSeek').addEventListener('click', () => { if (lbNote?.t != null) player.seek(lbNote.t); dlg.close(); });
  $('#lbDl').addEventListener('click', async () => {
    const b = await shots.get(lbNote.shotId);
    download(`${safeName(ctx.cur().title || ctx.cur().ytId, 40)}_${fmt(lbNote.t).replace(/:/g, '-')}.png`, b);
  });
  $('#lbCopy').addEventListener('click', async () => {
    try { const b = await shots.get(lbNote.shotId); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('圖片已複製，可以直接貼到其他地方'); }
    catch { toast('複製失敗'); }
  });
  $('#lbDel').addEventListener('click', async () => {
    if (!confirm('刪除這張截圖？（筆記文字會保留）')) return;
    await shots.del(lbNote.shotId); forgetShotUrl(lbNote.shotId);
    lbNote.shotId = null;
    if (!lbNote.text) ctx.cur().notes = ctx.cur().notes.filter((x) => x !== lbNote);
    ctx.touch();
    dlg.close();
    render(); renderShots();
  });
}

async function openLightbox(noteId) {
  const n = findNote(noteId);
  if (!n || !n.shotId) return;
  lbNote = n;
  $('#lbImg').src = await shotUrl(n.shotId);
  $('#lbTime').textContent = n.t != null ? fmt(n.t) : '';
  $('#dlgLb').showModal();
}

export function resetFresh() { freshId = null; }
