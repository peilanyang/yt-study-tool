// 交給 Claude 的提示詞與回覆解析（純函式）。主要流程：使用者複製提示詞到 Claude 對話，再把回覆貼回。
'use strict';

export const PART_LINES = 300; // 每份提示詞最多幾行字幕

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * 整理逐字稿的提示詞：只輸出原文，不翻譯。
 * @param {{t:number,text:string}[]} lines
 * @param {string} [context] 前一部分最後幾句，供延續講者判斷
 * @param {{t:number,title:string}[]} [author] 這一份時間範圍內的作者章節（F13）
 * @param {boolean} [continued] 是否接續前一份（開頭可以不是新章節）
 */
export function buildOrganizePrompt(lines, context = '', author = [], continued = false) {
  const chapterRule = author.length
    ? `6. 章節：影片作者已訂好章節（格式「[秒數] 標題」）：
${author.map((a) => `[${Math.round(a.t)}] ${a.title}`).join('\n')}
   請在每個章節開始的那一段（t 最接近章節秒數的段落，para 設為 true）加上 "chapter"（作者的標題，照抄）與 "summary"（用一句話說明這一章在講什麼，用影片原本的語言，簡體轉繁體）。不要新增或刪除章節。其他段落不要加這兩個欄位。`
    : `6. 章節：依主題把內容分成章節（大約每 2–5 分鐘一章${continued ? '；這份字幕接續前一份，開頭可以延續上一章，不一定是新章節' : '，第一段一定是新章節'}）。在每章開始的那一段（para 設為 true）加上 "chapter"（章節標題，約 8–20 字）與 "summary"（用一句話說明這一章在講什麼）。標題與摘要都用影片原本的語言，簡體轉繁體。其他段落不要加這兩個欄位。`;
  return `你是專業的逐字稿編輯。以下是一段 YouTube 教學影片的字幕，每行格式為「[秒數] 文字」。請整理成好讀的逐字稿：

1. 加上正確標點符號，修正明顯的聽寫錯字。不要改變原意、不要摘要、不要省略內容、不要翻譯，保留原本的語言；若為簡體中文請轉成繁體中文（台灣用語）。
2. 把相關的句子合併成段落（每段約 2–5 句，最長約 60 秒）。
3. 標記講者：有兩位以上講者（訪談、對話、問答）時，依內容與語氣的轉換標 "A"、"B"（第三位 "C"）；只有一位講者時全部標 "A"。
4. t 為該段第一行的秒數（數字）。
5. para：這一段若是「整篇文章」中新段落的開頭（換了主題或步驟，大約每 1–2 分鐘一次）設為 true，否則 false。第一段一定是 true。
${chapterRule}
${context ? `\n（前文最後內容，只供判斷講者，不要重複輸出：${context}）\n` : ''}
只輸出 JSON 陣列，不要任何說明文字或程式碼區塊標記，格式：
[{"t":0,"sp":"A","text":"整理後的段落","para":true,"chapter":"章節標題","summary":"這一章的一句話摘要"},{"t":15,"sp":"A","text":"下一段","para":false}]

字幕：
${lines.map((l) => `[${Math.round(l.t)}] ${l.text}`).join('\n')}`;
}

/**
 * 翻譯提示詞。
 * @param {{text:string}[]} segs
 * @param {number} offset 這一部分第一段在全部段落中的索引
 */
export function buildTranslatePrompt(segs, offset = 0, lang = '繁體中文（台灣用語）', chapters = []) {
  const items = segs.map((s, i) => ({ i: offset + i, text: s.text }));
  const chs = chapters.map((c, k) => ({ c: k, title: c.title, summary: c.summary || '' }));
  return `請把下面每一段翻譯成通順自然的${lang}。保留專有名詞與軟體選單的原文（可在後面加括號說明），不要摘要、不要省略。
${chs.length ? '最後的「章節」也要翻譯 title 與 summary（summary 是空字串就保持空字串）。\n' : ''}
只輸出 JSON 陣列，不要任何說明文字或程式碼區塊標記，格式：
[{"i":0,"zh":"翻譯"}${chs.length ? ',{"c":0,"title":"章節標題翻譯","summary":"摘要翻譯"}' : ''}]

段落：
${JSON.stringify(items)}${chs.length ? `

章節：
${JSON.stringify(chs)}` : ''}`;
}

/** 從 Claude 回覆抓出 JSON 陣列 */
export const PROMPT_PASTED = '你貼上的是「提示詞」，不是 Claude 的回覆。請先把它貼到 Claude 對話送出，等 Claude 回覆完，按回覆下方的「複製」，再貼回這裡。';

export function extractJsonArray(txt) {
  txt = String(txt || '').replace(/```(json)?/g, '');
  // 常見錯誤：把剛複製的提示詞直接貼回來
  if (txt.includes('只輸出 JSON 陣列') || txt.includes('你是專業的逐字稿編輯')) throw new Error(PROMPT_PASTED);
  const a = txt.indexOf('['), b = txt.lastIndexOf(']');
  if (a < 0 || b < a) throw new Error('找不到 JSON 陣列，請確認貼上的是 Claude 回覆的完整內容');
  let arr;
  try { arr = JSON.parse(txt.slice(a, b + 1)); } catch (e) { throw new Error('JSON 格式錯誤：' + e.message); }
  if (!Array.isArray(arr)) throw new Error('內容不是陣列');
  return arr;
}

/** 解析整理結果 → 段落。只接受預期欄位（資安規範 3.4、3.6）。 */
export function parseOrganizeReply(txt) {
  return extractJsonArray(txt)
    .filter((x) => x && typeof x.text === 'string' && x.text.trim())
    .map((x) => ({
      t: Math.max(0, Number(x.t) || 0),
      sp: /^[A-D]$/i.test(String(x.sp || '')) ? String(x.sp).toUpperCase() : 'A',
      text: x.text.trim().slice(0, 5000),
      zh: '',
      para: x.para === true,
      ...(typeof x.chapter === 'string' && x.chapter.trim()
        ? { ch: { title: x.chapter.trim().slice(0, 200), summary: typeof x.summary === 'string' ? x.summary.trim().slice(0, 500) : '' } }
        : {}),
    }));
}

/** 解析翻譯結果中的章節 → Map(章節索引 → {title, summary}) */
export function parseTranslateChapters(txt) {
  const map = new Map();
  for (const x of extractJsonArray(txt)) {
    if (x && Number.isInteger(x.c) && typeof x.title === 'string') {
      map.set(x.c, { title: x.title.trim().slice(0, 200), summary: typeof x.summary === 'string' ? x.summary.trim().slice(0, 500) : '' });
    }
  }
  return map;
}

/** 解析翻譯結果 → Map(索引 → 中文) */
export function parseTranslateReply(txt) {
  const map = new Map();
  for (const x of extractJsonArray(txt)) {
    if (x && Number.isInteger(x.i) && typeof x.zh === 'string') map.set(x.i, x.zh.trim().slice(0, 5000));
  }
  if (!map.size) throw new Error('沒有找到任何翻譯');
  return map;
}
