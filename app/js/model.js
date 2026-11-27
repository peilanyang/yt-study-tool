// 資料模型（純函式）：建立、升級、清單與影片操作。不碰瀏覽器 API，方便測試。
'use strict';
import { uid } from './util.js';

export const SCHEMA = 2;
export const INBOX = 'inbox';
export const SPEEDS = [0.5, 0.75, 1, 1.5, 2];

export function emptyState() {
  return {
    schema: SCHEMA,
    playlists: [{ id: INBOX, name: '未分類', videos: [], locked: true }],
    videos: {},
    current: null,
    settings: { view: 'o', pauseOnShot: true, theater: false, lang: '繁體中文（台灣用語）' },
    lastBackupAt: 0,
  };
}

/**
 * 讀入的資料（v1、v2 或還原檔）整理成合法的 v2 狀態。
 * 不信任輸入：只保留已知欄位（資安規範 3.4）。
 */
export function normalizeState(input) {
  const base = emptyState();
  if (!input || typeof input !== 'object') return base;
  const now = Date.now();
  const videos = {};
  for (const [id, v] of Object.entries(input.videos || {})) {
    if (!v || typeof v !== 'object' || !/^[\w-]{11}$/.test(String(v.ytId || ''))) continue;
    videos[id] = {
      id,
      ytId: v.ytId,
      title: String(v.title || '').slice(0, 300),
      mode: v.mode === 'watch' ? 'watch' : (Array.isArray(v.segs) && v.segs.length ? 'transcript' : 'watch'),
      speakers: typeof v.speakers === 'object' && v.speakers ? { ...v.speakers } : { A: '講者 A', B: '講者 B' },
      segs: (Array.isArray(v.segs) ? v.segs : []).filter((s) => s && typeof s.text === 'string').map((s, i) => ({
        t: Math.max(0, Number(s.t) || 0),
        sp: String(s.sp || '').slice(0, 1).toUpperCase(),
        text: s.text,
        zh: String(s.zh || ''),
        para: typeof s.para === 'boolean' ? s.para : i === 0,
      })),
      notes: (Array.isArray(v.notes) ? v.notes : []).filter((n) => n && n.id).map((n) => ({
        id: String(n.id),
        t: n.t == null ? null : Math.max(0, Number(n.t) || 0),
        text: String(n.text || ''),
        shotId: n.shotId ? String(n.shotId) : null,
        created: Number(n.created) || now,
        updatedAt: Number(n.updatedAt) || Number(n.created) || now,
      })),
      authorChapters: (Array.isArray(v.authorChapters) ? v.authorChapters : [])
        .filter((c) => c && typeof c.title === 'string')
        .map((c) => ({ t: Math.max(0, Number(c.t) || 0), title: c.title.slice(0, 200) })),
      chapters: (Array.isArray(v.chapters) ? v.chapters : [])
        .filter((c) => c && typeof c.title === 'string' && c.title.trim())
        .map((c) => ({
          t: Math.max(0, Number(c.t) || 0),
          title: c.title.slice(0, 200),
          summary: String(c.summary || '').slice(0, 500),
          zhTitle: String(c.zhTitle || '').slice(0, 200),
          zhSummary: String(c.zhSummary || '').slice(0, 500),
        }))
        .sort((a, b) => a.t - b.t),
      added: Number(v.added) || now,
      updatedAt: Number(v.updatedAt) || now,
    };
  }
  const playlists = [];
  for (const p of Array.isArray(input.playlists) ? input.playlists : []) {
    if (!p || !p.id || p.id === INBOX) continue;
    playlists.push({ id: String(p.id), name: String(p.name || '未命名清單').slice(0, 100), videos: (p.videos || []).filter((x) => videos[x]), collapsed: !!p.collapsed });
  }
  const oldInbox = (input.playlists || []).find((p) => p && p.id === INBOX);
  const inbox = { id: INBOX, name: '未分類', videos: (oldInbox?.videos || []).filter((x) => videos[x]), locked: true, collapsed: !!oldInbox?.collapsed };
  // 不在任何清單裡的影片放進未分類
  const listed = new Set([...inbox.videos, ...playlists.flatMap((p) => p.videos)]);
  for (const id of Object.keys(videos)) if (!listed.has(id)) inbox.videos.push(id);
  const s = input.settings || {};
  return {
    schema: SCHEMA,
    playlists: [inbox, ...playlists],
    videos,
    current: videos[input.current] ? input.current : null,
    settings: {
      view: ['o', 'bi', 'z'].includes(s.view) ? s.view : 'o',
      pauseOnShot: s.pauseOnShot !== false,
      theater: s.theater === true,
      lang: typeof s.lang === 'string' ? s.lang : base.settings.lang,
    }, // 注意：舊版的 apiKey 一律不帶入（資安規範 3.1）
    lastBackupAt: Number(input.lastBackupAt) || 0,
  };
}

export function newVideo(ytIdValue, mode) {
  const now = Date.now();
  return { id: uid(), ytId: ytIdValue, title: '', mode, speakers: { A: '講者 A', B: '講者 B' }, segs: [], notes: [], authorChapters: [], chapters: [], added: now, updatedAt: now };
}

/** 加入影片到清單；同一部影片已存在就沿用。回傳影片 id。 */
export function addVideo(state, ytIdValue, playlistId, mode) {
  let v = Object.values(state.videos).find((x) => x.ytId === ytIdValue);
  if (!v) { v = newVideo(ytIdValue, mode); state.videos[v.id] = v; }
  const p = state.playlists.find((x) => x.id === playlistId) || state.playlists[0];
  if (!p.videos.includes(v.id)) p.videos.push(v.id);
  return v.id;
}

/** 刪除清單：影片若不在其他清單，移到未分類。未分類不可刪。 */
export function deletePlaylist(state, playlistId) {
  if (playlistId === INBOX) return false;
  const i = state.playlists.findIndex((p) => p.id === playlistId);
  if (i < 0) return false;
  const [p] = state.playlists.splice(i, 1);
  const inbox = state.playlists.find((x) => x.id === INBOX);
  for (const vid of p.videos) {
    if (!state.playlists.some((x) => x.videos.includes(vid))) inbox.videos.push(vid);
  }
  return true;
}

/** 從清單移除影片；若不在任何清單了，刪除影片本身並回傳要刪的截圖 id。 */
export function removeVideo(state, playlistId, videoId) {
  const p = state.playlists.find((x) => x.id === playlistId);
  if (p) p.videos = p.videos.filter((x) => x !== videoId);
  if (state.playlists.some((x) => x.videos.includes(videoId))) return [];
  const v = state.videos[videoId];
  const shots = v ? v.notes.map((n) => n.shotId).filter(Boolean) : [];
  delete state.videos[videoId];
  if (state.current === videoId) state.current = null;
  return shots;
}

export function moveVideo(state, fromId, toId, videoId) {
  const from = state.playlists.find((x) => x.id === fromId);
  const to = state.playlists.find((x) => x.id === toId);
  if (!from || !to || from === to) return false;
  from.videos = from.videos.filter((x) => x !== videoId);
  if (!to.videos.includes(videoId)) to.videos.push(videoId);
  return true;
}

export function sortNotes(v) {
  v.notes.sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9) || a.created - b.created);
}

/** 目前播放時間對應的段落索引（二分搜尋），沒有回 -1 */
export function segIndexAt(segs, t) {
  let lo = 0, hi = segs.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].t <= t + 0.3) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** 匯出 Markdown（筆記＋逐字稿） */
export function toMarkdown(v) {
  const url = `https://www.youtube.com/watch?v=${v.ytId}`;
  const tl = (t) => `[${fmtTime(t)}](${url}&t=${Math.floor(t)}s)`;
  let s = `# ${v.title || v.ytId}\n\n${url}\n\n## 筆記\n\n`;
  for (const n of v.notes) s += `- ${n.t != null ? tl(n.t) + ' ' : ''}${n.text.replace(/\n/g, '\n  ')}${n.shotId ? '（附截圖）' : ''}\n`;
  if (v.segs.length) {
    s += '\n## 逐字稿\n\n';
    const chs = (v.chapters && v.chapters.length ? v.chapters : (v.authorChapters || [])).slice().sort((a, b) => a.t - b.t);
    let ci = 0;
    for (const g of v.segs) {
      while (ci < chs.length && chs[ci].t <= g.t + 0.3) {
        const c = chs[ci++];
        s += `### ${tl(c.t)} ${c.title}\n\n${c.summary ? `*${c.summary}*\n\n` : ''}`;
      }
      const who = g.sp ? `${v.speakers?.[g.sp] || g.sp}：` : '';
      s += `**${tl(g.t)}** ${who}${g.text}\n${g.zh ? `> ${g.zh}\n` : ''}\n`;
    }
  }
  return s;
}
function fmtTime(t) {
  t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
