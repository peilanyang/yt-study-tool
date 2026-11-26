// 儲存：唯一碰 IndexedDB 的模組（架構文件第 3 節）。
'use strict';
import { normalizeState } from './model.js';

const DB_NAME = 'ytStudy';
const DB_VERSION = 2;
let db;

function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const name of ['kv', 'shots', 'shotsOrig']) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('儲存失敗（可能是空間不足）'));
  });
}

/** 開啟資料庫並讀出狀態；升級前先留一份舊資料備份（非功能需求 NFR-06）。 */
export async function load() {
  db = await open();
  const saved = await tx('kv', 'readonly', (s) => s.get('state'));
  if (saved && saved.schema !== 2) await tx('kv', 'readwrite', (s) => s.put(saved, 'state_v1_backup'));
  return normalizeState(saved);
}

let timer, pending;
/** 變更後 300 ms 內寫入；連續變更只寫最後一次。 */
export function save(state, onError) {
  pending = state;
  clearTimeout(timer);
  timer = setTimeout(() => flush().catch((e) => onError && onError(e)), 300);
}
export async function flush() {
  if (!pending) return;
  const s = pending; pending = null;
  await tx('kv', 'readwrite', (st) => st.put(s, 'state'));
}
// 關閉分頁前盡量寫入
addEventListener('pagehide', () => { if (pending) flush(); });

export const shots = {
  get: (id) => tx('shots', 'readonly', (s) => s.get(id)),
  set: (id, blob) => tx('shots', 'readwrite', (s) => s.put(blob, id)),
  del: (id) => tx('shots', 'readwrite', (s) => s.delete(id)),
  keys: () => tx('shots', 'readonly', (s) => s.getAllKeys()),
};

const urlCache = new Map();
/** 截圖的 blob URL（快取） */
export async function shotUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await shots.get(id);
  if (!b) return '';
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}
export function forgetShotUrl(id) {
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
}
