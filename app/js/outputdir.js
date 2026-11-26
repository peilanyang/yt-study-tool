// 自動帶入小程式產生的字幕（F7-a「減少手動步驟」）。
// 使用者選一次 transcriber/output 資料夾，之後工具依影片 ID 找「[影片ID].srt」。
// 只讀取 .srt 與 .chapters.json，大小上限 5 MB（資安規範 3.4、3.9）。
'use strict';
import { kv } from './store.js';
import { parseChapters } from './subtitles.js';

const KEY = 'outputDir';
const MAX = 5 * 1024 * 1024;

export const supported = () => typeof window.showDirectoryPicker === 'function';

/** 目前狀態：'unsupported' | 'none'（還沒選）| 'prompt'（要再按一次允許）| 'ready' */
export async function status() {
  if (!supported()) return 'unsupported';
  const h = await kv.get(KEY);
  if (!h) return 'none';
  const p = await h.queryPermission({ mode: 'read' });
  return p === 'granted' ? 'ready' : 'prompt';
}

/** 請使用者選資料夾（要在按鈕點擊中呼叫） */
export async function choose() {
  const h = await window.showDirectoryPicker({ id: 'yt-study-output', mode: 'read' });
  await kv.set(KEY, h);
  return h;
}

/** 重新取得讀取權限（要在按鈕點擊中呼叫） */
export async function regrant() {
  const h = await kv.get(KEY);
  if (!h) return false;
  return (await h.requestPermission({ mode: 'read' })) === 'granted';
}

export async function folderName() {
  const h = await kv.get(KEY);
  return h ? h.name : '';
}

/**
 * 找這部影片最新的字幕檔。
 * @param {string} ytId
 * @param {number} since 只接受這個時間（毫秒）之後修改的檔案；0 表示不限
 * @returns {Promise<null | {name:string, srt:string, chapters:Array<{t:number,title:string}>}>}
 */
export async function findSubtitle(ytId, since = 0) {
  const h = await kv.get(KEY);
  if (!h || (await h.queryPermission({ mode: 'read' })) !== 'granted') return null;
  return findInDir(h, ytId, since);
}

/** 在資料夾中找字幕（拆出來方便測試） */
export async function findInDir(h, ytId, since = 0) {
  const tag = `[${ytId}]`;
  let best = null;
  for await (const [name, entry] of h.entries()) {
    if (entry.kind !== 'file' || !name.includes(tag) || !name.toLowerCase().endsWith('.srt')) continue;
    const f = await entry.getFile();
    if (f.size > MAX || f.lastModified < since) continue;
    if (!best || f.lastModified > best.file.lastModified) best = { name, file: f };
  }
  if (!best) return null;
  const srt = await best.file.text();
  let chapters = [];
  try {
    const cj = await h.getFileHandle(best.name.replace(/\.srt$/i, '.chapters.json'));
    const cf = await cj.getFile();
    if (cf.size < MAX) chapters = parseChapters(await cf.text());
  } catch { /* 沒有章節檔 */ }
  return { name: best.name, srt, chapters };
}

