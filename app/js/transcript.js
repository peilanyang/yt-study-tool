// 逐字稿（F2、F3）：顯示、講者、編輯、搜尋、產生（三步驟）、翻譯。
'use strict';
import { $, $$, html, setHtml, fmt, toast } from './util.js';
import { parseSubtitles, groupRaw } from './subtitles.js';
import { PART_LINES, chunk, buildOrganizePrompt, buildTranslatePrompt, parseOrganizeReply, parseTranslateReply } from './claude.js';
import { segIndexAt } from './model.js';
import * as player from './player.js';
import * as outdir from './outputdir.js';

const COLORS = { A: 'var(--A)', B: 'var(--B)', C: 'var(--C)', D: 'var(--D)' };
const ORDER = ['A', 'B', 'C', 'D', ''];
let ctx;
let lastIdx = -1;

export function initTranscript(c) {
  ctx = c;
  $('#segs').addEventListener('click', onSegClick);
  $('#segs').addEventListener('focusout', onSegBlur);
  $('#segs').addEventListener('keydown', (e) => {
    if (e.target.isContentEditable && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
    if (e.target.isContentEditable && e.key === 'Escape') { e.target.dataset.cancel = '1'; e.target.blur(); }
  });
  $('#spkBar').addEventListener('change', (e) => {
    const k = e.target.dataset.spk;
    if (!k) return;
    ctx.cur().speakers[k] = e.target.value.trim().slice(0, 20) || '講者 ' + k;
    ctx.touch(); render();
  });
  $('#viewGroup').addEventListener('click', (e) => {
    const v = e.target.dataset.view;
    if (!v || e.target.disabled) return;
    ctx.state.settings.view = v; ctx.save(); render();
  });
  $('#q').addEventListener('input', render);
  $('#bTranslate').addEventListener('click', openTranslate);
  initGenDialog();
  initTranslateDialog();
  setInterval(followPlayback, 300);
}

/* ---------- 顯示 ---------- */
export function render() {
  const v = ctx.cur();
  lastIdx = -1;
  const has = !!(v && v.segs.length);
  $('#trEmpty').hidden = !v || has;
  $('#trTools').hidden = !has;
  if (!v) { setHtml($('#segs'), html`<p class="hint pad">尚未選擇影片。</p>`); $('#spkBar').hidden = true; return; }
  if (!has) { setHtml($('#segs'), ''); $('#spkBar').hidden = true; return; }

  const translated = v.segs.some((s) => s.zh);
  let view = ctx.state.settings.view;
  if (!translated) view = 'o';
  $$('#viewGroup button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.view === view));
    b.disabled = b.dataset.view !== 'o' && !translated;
    b.title = b.disabled ? '翻譯後才能使用' : '';
  });
  $('#bTranslate').textContent = translated ? '重新翻譯' : '翻譯成中文';

  const used = [...new Set(v.segs.map((s) => s.sp).filter(Boolean))].sort();
  $('#spkBar').hidden = !used.length;
  setHtml($('#spkBar'), [html`<span class="hint">講者：</span>`, used.map((k) => html`
    <span class="spk"><span class="chip" style="background:${COLORS[k] || '#666'}">${k}</span><input type="text" data-spk="${k}" value="${v.speakers?.[k] || '講者 ' + k}" aria-label="講者 ${k} 名稱"></span>`),
    html`<span class="hint">（點段落前的標籤可改講者）</span>`]);

  const q = $('#q').value.trim().toLowerCase();
  const mark = (text) => {
    if (!q) return text;
    const parts = [];
    let rest = text, low = rest.toLowerCase(), i;
    while ((i = low.indexOf(q)) >= 0) {
      parts.push(rest.slice(0, i), html`<mark>${rest.slice(i, i + q.length)}</mark>`);
      rest = rest.slice(i + q.length); low = rest.toLowerCase();
    }
    parts.push(rest);
    return parts;
  };
  let prev = null;
  setHtml($('#segs'), v.segs.map((s, i) => {
    if (q && !(s.text + ' ' + s.zh).toLowerCase().includes(q)) return '';
    const showChip = s.sp && (s.sp !== prev || q);
    prev = s.sp;
    const chip = s.sp ? html`<button class="chip ${showChip ? '' : 'dim'}" data-chip="${i}" style="background:${COLORS[s.sp] || '#666'}" title="點擊切換講者">${v.speakers?.[s.sp] || s.sp}</button>` : '';
    const o = view !== 'z' || !s.zh ? html`<div class="o">${chip}<span data-f="text" data-i="${i}">${mark(s.text)}</span></div>` : '';
    const z = s.zh && view !== 'o' ? html`<div class="z">${view === 'z' ? chip : ''}<span data-f="zh" data-i="${i}">${mark(s.zh)}</span></div>` : '';
    return html`<div class="seg ${s.para && i ? 'para' : ''}" data-i="${i}">
      <button class="ts" data-seek="${s.t}">${fmt(s.t)}</button>
      <div>${o}${z}
        <div class="tools">
          <button data-quote="${i}">引用到筆記</button>
          <button data-edit="${i}">修改文字</button>
          ${i ? html`<button data-merge="${i}">與上一段合併</button>` : ''}
        </div>
      </div>
    </div>`;
  }));
}

function onSegClick(e) {
  const v = ctx.cur();
  const t = e.target.closest('button');
  if (!t || !v) return;
  if (t.dataset.seek) return player.seek(Number(t.dataset.seek));
  if (t.dataset.chip) {
    const s = v.segs[Number(t.dataset.chip)];
    s.sp = ORDER[(ORDER.indexOf(s.sp || '') + 1) % ORDER.length];
    if (s.sp && !v.speakers[s.sp]) v.speakers[s.sp] = '講者 ' + s.sp;
    ctx.touch(); return render();
  }
  if (t.dataset.quote) {
    const s = v.segs[Number(t.dataset.quote)];
    ctx.addNote(s.t, `「${s.text}」${s.zh ? '\n' + s.zh : ''}\n`);
    ctx.switchTab('nt');
    return;
  }
  if (t.dataset.edit) {
    const row = t.closest('.seg');
    const spans = $$('[data-f]', row);
    spans.forEach((el) => { el.textContent = v.segs[Number(el.dataset.i)][el.dataset.f]; el.contentEditable = 'true'; });
    spans[0]?.focus();
    return;
  }
  if (t.dataset.merge) {
    const i = Number(t.dataset.merge), a = v.segs[i - 1], b = v.segs[i];
    a.text = (a.text + ' ' + b.text).trim();
    a.zh = [a.zh, b.zh].filter(Boolean).join('');
    v.segs.splice(i, 1);
    ctx.touch(); render();
  }
}

function onSegBlur(e) {
  const el = e.target;
  if (el.contentEditable !== 'true') return;
  el.contentEditable = 'false';
  if (!el.dataset.cancel) {
    const s = ctx.cur().segs[Number(el.dataset.i)];
    const val = el.textContent.trim();
    if (val && s[el.dataset.f] !== val) { s[el.dataset.f] = val; ctx.touch(); }
  }
  setTimeout(() => { if (!$('#segs [contenteditable=true]')) render(); }, 30);
}

function followPlayback() {
  const v = ctx.cur();
  if (!v || !v.segs.length || !player.isReady()) return;
  const i = segIndexAt(v.segs, player.now());
  if (i === lastIdx) return;
  $('#segs .seg.cur')?.classList.remove('cur');
  const el = $(`#segs .seg[data-i="${i}"]`);
  if (el) {
    el.classList.add('cur');
    if ($('#follow').checked && player.isPlaying() && !$('#segs [contenteditable=true]')) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  lastIdx = i;
}

/* ---------- 產生逐字稿：三步驟 ---------- */
let raw = [];
let collected = [];
let parts = [];
let pendingChapters = [];
let pollTimer = null;

function initGenDialog() {
  const dlg = $('#dlgGen');
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  $('#rawIn').addEventListener('input', updateRaw);
  $('#subFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast('字幕檔太大（上限 5 MB）'); return; }
    $('#rawIn').value = await f.text();
    updateRaw();
  });
  $('#parts').addEventListener('click', async (e) => {
    const i = e.target.dataset.part;
    if (i == null) return;
    const n = Number(i);
    const prev = n > 0 ? parts[n - 1].slice(-4).map((l) => l.text).join(' ') : '';
    try {
      await navigator.clipboard.writeText(buildOrganizePrompt(parts[n], prev));
      e.target.textContent = `✓ 已複製第 ${n + 1} / ${parts.length} 份`;
      toast('已複製，請貼到 Claude 對話送出');
      setStep(3);
    } catch { toast('複製失敗，請允許瀏覽器使用剪貼簿'); }
  });
  $('#bAddPart').addEventListener('click', addPart);
  $('#bGenDone').addEventListener('click', () => {
    if ($('#jsonIn').value.trim() && !addPart()) return;
    if (!collected.length) { toast('還沒有加入 Claude 的回覆'); return; }
    commit(collected);
  });
  $('#bPickOut').addEventListener('click', async () => {
    try { await outdir.choose(); await refreshAuto(); } catch { /* 使用者取消 */ }
  });
  $('#bRegrant').addEventListener('click', async () => { await outdir.regrant(); await refreshAuto(); });
  dlg.addEventListener('close', () => { clearInterval(pollTimer); pollTimer = null; });
  $('#bRawOnly').addEventListener('click', () => {
    if (!raw.length) { toast('請先在步驟 1 貼上字幕'); return; }
    commit(groupRaw(raw));
  });
}

export function openGen() {
  const v = ctx.cur();
  if (!v) { toast('請先選擇影片'); return; }
  raw = []; collected = []; parts = []; pendingChapters = [];
  $('#rawIn').value = ''; $('#jsonIn').value = ''; $('#subFile').value = '';
  $('#rawInfo').textContent = ''; $('#jsonInfo').textContent = '';
  setHtml($('#parts'), html`<span class="hint">完成步驟 1 後，這裡會出現「複製提示詞」按鈕。</span>`);
  const url = `https://www.youtube.com/watch?v=${v.ytId}`;
  $('#ytOpen').href = url;
  $('#vidCode').textContent = v.ytId;
  setStep(1);
  $('#dlgGen').showModal();
  navigator.clipboard.writeText(url).then(
    () => { $('#copyState').textContent = '（影片網址已經幫你複製好了）'; },
    () => { $('#copyState').textContent = `（請先複製這個網址：${url}）`; },
  );
  refreshAuto();
}

/** 小程式資料夾的狀態與輪詢：每 3 秒找一次這部影片的字幕檔 */
async function refreshAuto() {
  clearInterval(pollTimer); pollTimer = null;
  const st = await outdir.status();
  $('#autoBox').hidden = st === 'unsupported';
  if (st === 'unsupported') { $('#manualBox').open = true; return; }
  const status = $('#autoStatus');
  status.className = 'status';
  $('#autoSetup').hidden = st === 'ready';
  $('#autoSteps').hidden = st !== 'ready';
  $('#bPickOut').hidden = st !== 'none';
  $('#bRegrant').hidden = st !== 'prompt';
  $('#setupHow').hidden = st !== 'none';
  if (st === 'none') { status.textContent = ''; return; }
  if (st === 'prompt') { status.textContent = `瀏覽器為了安全，要你再按一次「允許」才能讀取「${await outdir.folderName()}」資料夾。`; return; }
  status.textContent = '⏳ 正在等字幕…有字幕的影片幾秒鐘就好；沒有字幕要把語音轉成文字，時間大約和影片一樣長。';
  const check = async () => {
    const v = ctx.cur();
    if (!v || raw.length) return;
    try {
      const found = await outdir.findSubtitle(v.ytId);
      if (!found) return;
      clearInterval(pollTimer); pollTimer = null;
      $('#rawIn').value = found.srt;
      pendingChapters = found.chapters;
      updateRaw();
      $('#autoSteps').hidden = true;
      status.className = 'status ok';
      status.textContent = `✓ 字幕已經自動帶入${found.chapters.length ? `（含作者章節 ${found.chapters.length} 個）` : ''}。請往下做步驟 2。`;
    } catch (e) {
      status.textContent = '讀取字幕資料夾失敗：' + e.message;
    }
  };
  await check();
  if (!raw.length) pollTimer = setInterval(check, 3000);
}

function setStep(n) {
  [1, 2, 3].forEach((k) => {
    const cls = k < n ? 'done' : k === n ? 'now' : '';
    $('#step' + k).className = 'step ' + cls;
    $('#st' + k).className = cls;
    $('#st' + k).textContent = (k < n ? '✓ ' : k === n ? '● ' : '○ ') + ['', '步驟 1 取得字幕', '步驟 2 交給 Claude 整理', '步驟 3 貼回結果'][k];
  });
}

function updateRaw() {
  raw = parseSubtitles($('#rawIn').value);
  const typed = $('#rawIn').value.trim();
  $('#rawInfo').textContent = raw.length ? `✓ 辨識到 ${raw.length} 行，長度約 ${fmt(raw[raw.length - 1].t)}` : typed ? '沒有辨識到時間。請確認複製的內容有包含「0:00」這類時間。' : '';
  if (!raw.length) { setStep(1); return; }
  parts = chunk(raw, PART_LINES);
  setHtml($('#parts'), parts.map((p, i) => html`<button class="primary" data-part="${i}">複製提示詞${parts.length > 1 ? `（第 ${i + 1} / ${parts.length} 份，${fmt(p[0].t)} 起）` : ''}</button>`));
  setStep(2);
}

function addPart() {
  try {
    const segs = parseOrganizeReply($('#jsonIn').value);
    collected.push(...segs);
    $('#jsonIn').value = '';
    $('#jsonInfo').textContent = `已加入 ${collected.length} 段。${parts.length > 1 ? '全部份數加入後' : ''}按「完成」。`;
    return true;
  } catch (e) {
    $('#jsonInfo').textContent = e.message;
    toast(e.message);
    return false;
  }
}

function commit(segs) {
  const v = ctx.cur();
  segs.sort((a, b) => a.t - b.t);
  if (segs.length) segs[0].para = true;
  if (v.segs.length && !confirm('取代這部影片原本的逐字稿？（筆記與截圖不受影響）')) return;
  v.segs = segs;
  v.mode = 'transcript';
  if (pendingChapters.length) v.authorChapters = pendingChapters;
  for (const k of new Set(segs.map((s) => s.sp))) if (k && !v.speakers[k]) v.speakers[k] = '講者 ' + k;
  ctx.touch();
  $('#dlgGen').close();
  ctx.renderAll();
  ctx.switchTab('tr');
  toast(`已匯入 ${segs.length} 段逐字稿`);
}

/* ---------- 翻譯 ---------- */
const TR_SEGS = 80;
let trParts = [];
let trMap = new Map();

function initTranslateDialog() {
  const dlg = $('#dlgTr');
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  $('#trParts').addEventListener('click', async (e) => {
    const i = e.target.dataset.part;
    if (i == null) return;
    const n = Number(i);
    try {
      await navigator.clipboard.writeText(buildTranslatePrompt(trParts[n], n * TR_SEGS, ctx.state.settings.lang));
      e.target.textContent = `✓ 已複製第 ${n + 1} / ${trParts.length} 份`;
      toast('已複製，請貼到 Claude 對話送出');
    } catch { toast('複製失敗，請允許瀏覽器使用剪貼簿'); }
  });
  $('#bTrAdd').addEventListener('click', addTr);
  $('#bTrDone').addEventListener('click', () => {
    if ($('#trIn').value.trim() && !addTr()) return;
    if (!trMap.size) { toast('還沒有加入翻譯'); return; }
    const v = ctx.cur();
    trMap.forEach((zh, i) => { if (v.segs[i]) v.segs[i].zh = zh; });
    ctx.state.settings.view = 'bi';
    ctx.touch(); ctx.save();
    $('#dlgTr').close();
    render();
    toast(`已加入 ${trMap.size} 段翻譯`);
  });
}

function openTranslate() {
  const v = ctx.cur();
  if (!v || !v.segs.length) return;
  trParts = chunk(v.segs, TR_SEGS);
  trMap = new Map();
  $('#trIn').value = ''; $('#trInfo').textContent = '';
  setHtml($('#trParts'), trParts.map((p, i) => html`<button class="primary" data-part="${i}">複製翻譯提示詞${trParts.length > 1 ? `（第 ${i + 1} / ${trParts.length} 份）` : ''}</button>`));
  $('#dlgTr').showModal();
}

function addTr() {
  try {
    parseTranslateReply($('#trIn').value).forEach((zh, i) => trMap.set(i, zh));
    $('#trIn').value = '';
    $('#trInfo').textContent = `已加入 ${trMap.size} / ${ctx.cur().segs.length} 段。`;
    return true;
  } catch (e) {
    $('#trInfo').textContent = e.message;
    return false;
  }
}
