// 備份、還原與 Markdown 匯出（F6）
'use strict';
import { $, download, safeName, toast } from './util.js';
import { normalizeState, toMarkdown } from './model.js';
import { shots, flush } from './store.js';

const MAX_RESTORE = 500 * 1024 * 1024; // 資安規範 3.4
const IMG_TYPES = ['image/png', 'image/jpeg'];
let ctx;

export function initBackup(c) {
  ctx = c;
  $('#btnBackup').addEventListener('click', backup);
  $('#btnRestore').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', restore);
  $('#btnExportMd').addEventListener('click', exportMd);
  updateHint();
}

/** 超過 7 天沒備份時提醒（NFR-06） */
export function updateHint() {
  const last = ctx.state.lastBackupAt;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const hasData = Object.keys(ctx.state.videos).length > 0;
  $('#backupHint').textContent = hasData && (days === null || days >= 7) ? (days === null ? '⚠ 還沒有備份過' : `⚠ 已 ${days} 天沒備份`) : '';
}

const toDataUrl = (b) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

async function backup() {
  toast('打包中…');
  await flush();
  const imgs = {};
  for (const k of await shots.keys()) { const b = await shots.get(k); if (b) imgs[k] = await toDataUrl(b); }
  const data = { app: 'yt-study', ver: 2, at: new Date().toISOString(), state: ctx.state, shots: imgs };
  download(`影片筆記備份_${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
  ctx.state.lastBackupAt = Date.now();
  ctx.save();
  updateHint();
}

async function restore(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    if (f.size > MAX_RESTORE) throw new Error('檔案超過 500 MB');
    const d = JSON.parse(await f.text());
    if (d.app !== 'yt-study') throw new Error('不是這個工具的備份檔');
    if (!confirm('還原會用備份內容取代目前所有資料，確定嗎？')) return;
    const next = normalizeState(d.state);
    for (const [k, url] of Object.entries(d.shots || {})) {
      if (!/^[\w-]{1,40}$/.test(k) || typeof url !== 'string') continue;
      const b = await (await fetch(url)).blob();
      if (!IMG_TYPES.includes(b.type)) continue;
      await shots.set(k, b);
    }
    ctx.replaceState(next);
    toast('還原完成');
  } catch (err) {
    toast('還原失敗：' + err.message);
  }
}

function exportMd() {
  const v = ctx.cur();
  if (!v) { toast('請先選擇影片'); return; }
  download(safeName(v.title || v.ytId) + '.md', new Blob([toMarkdown(v)], { type: 'text/markdown' }));
}
