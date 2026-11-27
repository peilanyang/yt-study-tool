// 章節（F13）：由整理結果或作者章節產生章節清單（純函式，方便測試）。
'use strict';

const NEAR = 90; // Claude 標的章節段落與作者章節時間最多差幾秒仍算同一章

/**
 * 從整理後的段落（第一段帶 ch:{title,summary}）與作者章節，產生章節清單。
 * 有作者章節：時間與標題以作者為準，摘要取時間最接近的 Claude 章節。
 * 沒有作者章節：用 Claude 標的章節。
 * @param {{t:number, ch?:{title:string, summary:string}}[]} segs
 * @param {{t:number, title:string}[]} author
 * @returns {{t:number, title:string, summary:string, zhTitle:string, zhSummary:string}[]}
 */
export function buildChapters(segs, author = []) {
  const marked = segs.filter((s) => s.ch && s.ch.title).map((s) => ({ t: s.t, title: s.ch.title, summary: s.ch.summary || '' }));
  const mk = (t, title, summary) => ({ t, title, summary, zhTitle: '', zhSummary: '' });
  if (author.length) {
    return [...author].sort((a, b) => a.t - b.t).map((a) => {
      let best = null;
      for (const m of marked) if (Math.abs(m.t - a.t) <= NEAR && (!best || Math.abs(m.t - a.t) < Math.abs(best.t - a.t))) best = m;
      return mk(a.t, a.title, best ? best.summary : '');
    });
  }
  return marked.sort((a, b) => a.t - b.t).map((m) => mk(m.t, m.title, m.summary));
}

/** 畫面要顯示的章節：整理過的優先，沒有就用作者章節（只有標題） */
export function displayChapters(v) {
  if (v.chapters && v.chapters.length) return v.chapters;
  return (v.authorChapters || []).map((a) => ({ t: a.t, title: a.title, summary: '', zhTitle: '', zhSummary: '' }));
}

/** 時間 t 屬於第幾章，沒有回 -1 */
export function chapterIndexAt(chapters, t) {
  let ans = -1;
  for (let i = 0; i < chapters.length; i++) if (chapters[i].t <= t + 0.3) ans = i;
  return ans;
}

/** 這一份字幕時間範圍內的作者章節（給分份的提示詞用） */
export function authorInRange(author, from, to) {
  return author.filter((a) => a.t >= from && (to == null || a.t < to));
}
