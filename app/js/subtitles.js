// 字幕解析：YouTube「顯示轉錄稿」複製的文字、SRT、VTT → [{t, text}]（純函式）
'use strict';
import { toSec } from './util.js';

const TS = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
const ARROW = /^(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->/;
const LEAD = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/;

/**
 * 解析字幕文字。
 * @param {string} txt
 * @returns {{t:number, text:string}[]}
 */
export function parseSubtitles(txt) {
  const lines = String(txt || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
  const out = [];
  let t = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l || l === 'WEBVTT' || /^(Kind|Language|NOTE)\b/.test(l)) continue;
    const am = l.match(ARROW);
    if (am) { t = toSec(am[1]); continue; }
    if (/^\d+$/.test(l) && lines[i + 1] && ARROW.test(lines[i + 1])) continue; // SRT 序號
    if (TS.test(l)) { t = toSec(l); continue; }
    const lm = l.match(LEAD);
    if (lm) { out.push({ t: toSec(lm[1]), text: lm[2] }); t = null; continue; }
    const clean = l.replace(/<[^>]+>/g, '').trim();
    if (!clean) continue;
    if (t === null && !out.length) continue; // 第一個時間之前多複製到的網頁文字，略過
    if (t === null && out.length) {
      const last = out[out.length - 1];
      if (last.text !== clean) last.text += ' ' + clean;
      continue;
    }
    out.push({ t: t ?? 0, text: clean });
    t = null;
  }
  // 自動字幕（VTT）常重複上一行，去重
  return out.filter((x, i) => !(i && out[i - 1].text === x.text));
}

/** 不整理直接匯入時，把短行合併成約 20 秒一段 */
export function groupRaw(lines, seconds = 20) {
  const segs = [];
  let cur = null;
  for (const l of lines) {
    if (!cur || l.t - cur.t > seconds) {
      cur = { t: l.t, sp: '', text: l.text, zh: '', para: !segs.length };
      segs.push(cur);
    } else cur.text += ' ' + l.text;
  }
  return segs;
}

/** 作者章節 JSON → [{t, title}]，只保留合法欄位 */
export function parseChapters(text) {
  let arr;
  try { arr = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c) => c && typeof c.title === 'string' && c.title.trim())
    .map((c) => ({ t: Math.max(0, Number(c.t) || 0), title: c.title.trim().slice(0, 200) }))
    .sort((a, b) => a.t - b.t);
}
