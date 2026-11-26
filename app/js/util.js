// 共用工具：純函式放這裡，方便單元測試。
'use strict';

/** HTML 跳脫。所有外來文字顯示前都要經過這裡（資安規範 3.2）。 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const RAW = Symbol('raw');
/** 標記為「已是安全 HTML」，給 html`` 使用。只能包自己產生的 HTML。 */
export function raw(s) {
  return { [RAW]: true, value: String(s) };
}

/** 自動跳脫插值的樣板：html`<b>${name}</b>`。陣列會逐項處理後串接。 */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += toHtml(v) + strings[i + 1];
  });
  return raw(out);
}
function toHtml(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(toHtml).join('');
  if (typeof v === 'object' && v[RAW]) return v.value;
  return esc(v);
}
/** 把 html`` 結果放進元素。 */
export function setHtml(el, frag) {
  el.innerHTML = toHtml(frag);
}

/** 秒數 → m:ss 或 h:mm:ss */
export function fmt(t) {
  t = Math.max(0, Math.floor(Number(t) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}

/** "1:02:03" / "00:01:02,500" → 秒數 */
export function toSec(s) {
  return String(s).replace(',', '.').split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
}

/** 從網址或 ID 取出 11 碼 YouTube 影片 ID；不是就回 null。 */
export function ytId(u) {
  u = String(u || '').trim();
  if (/^[\w-]{11}$/.test(u)) return u;
  const m = u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Windows 檔名不允許的字元換成底線 */
export function safeName(s, max = 60) {
  return String(s || 'untitled').replace(/[\\/:*?"<>|\n\r]/g, '_').slice(0, max);
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}
