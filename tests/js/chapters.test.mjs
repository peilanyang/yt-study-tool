import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChapters, displayChapters, chapterIndexAt, authorInRange } from '../../app/js/chapters.js';
import { buildOrganizePrompt, buildTranslatePrompt, parseOrganizeReply, parseTranslateChapters, parseTranslateReply } from '../../app/js/claude.js';
import { normalizeState, toMarkdown } from '../../app/js/model.js';

const segs = [
  { t: 0, ch: { title: '開場', summary: '介紹今天主題' } },
  { t: 30 },
  { t: 125, ch: { title: '債市風險', summary: '殖利率飆升的影響' } },
  { t: 200 },
];

test('沒有作者章節：用 Claude 標的章節', () => {
  const c = buildChapters(segs);
  assert.deepEqual(c.map((x) => [x.t, x.title, x.summary]), [[0, '開場', '介紹今天主題'], [125, '債市風險', '殖利率飆升的影響']]);
});

test('有作者章節：時間與標題用作者的，摘要取最接近的', () => {
  const c = buildChapters(segs, [{ t: 120, title: 'Bond risk' }, { t: 0, title: 'Intro' }, { t: 600, title: 'Outro' }]);
  assert.deepEqual(c.map((x) => [x.t, x.title, x.summary]), [[0, 'Intro', '介紹今天主題'], [120, 'Bond risk', '殖利率飆升的影響'], [600, 'Outro', '']]);
});

test('顯示章節：整理過的優先，否則用作者章節', () => {
  assert.equal(displayChapters({ chapters: [], authorChapters: [{ t: 5, title: 'A' }] })[0].title, 'A');
  assert.equal(displayChapters({ chapters: [{ t: 1, title: 'B' }], authorChapters: [{ t: 5, title: 'A' }] })[0].title, 'B');
  assert.equal(displayChapters({}).length, 0);
});

test('目前章節與分份範圍', () => {
  const chs = [{ t: 0 }, { t: 100 }, { t: 200 }];
  assert.equal(chapterIndexAt(chs, 150), 1);
  assert.equal(chapterIndexAt(chs, 250), 2);
  assert.equal(chapterIndexAt([{ t: 10 }], 5), -1);
  assert.deepEqual(authorInRange([{ t: 0 }, { t: 100 }, { t: 300 }], 100, 300).map((a) => a.t), [100]);
  assert.deepEqual(authorInRange([{ t: 0 }, { t: 300 }], 100, null).map((a) => a.t), [300]);
});

test('提示詞：有作者章節時列出作者章節並要求照抄', () => {
  const p = buildOrganizePrompt([{ t: 0, text: 'hi' }], '', [{ t: 65, title: 'Setup' }]);
  assert.match(p, /\[65\] Setup/);
  assert.match(p, /不要新增或刪除章節/);
  const q = buildOrganizePrompt([{ t: 0, text: 'hi' }], '', [], true);
  assert.match(q, /接續前一份/);
});

test('解析：帶 chapter 的段落保留章節，其他沒有', () => {
  const r = parseOrganizeReply('[{"t":0,"sp":"A","text":"a","para":true,"chapter":"開場","summary":"說明"},{"t":9,"sp":"A","text":"b","para":false}]');
  assert.deepEqual(r[0].ch, { title: '開場', summary: '說明' });
  assert.equal(r[1].ch, undefined);
});

test('翻譯：章節一起翻，解析段落與章節互不干擾', () => {
  const p = buildTranslatePrompt([{ text: 'x' }], 0, '繁體中文', [{ title: 'Intro', summary: 'hello' }]);
  assert.match(p, /"c":0/);
  const reply = '[{"i":0,"zh":"嗨"},{"c":0,"title":"開場","summary":"你好"}]';
  assert.equal(parseTranslateReply(reply).get(0), '嗨');
  assert.deepEqual(parseTranslateChapters(reply).get(0), { title: '開場', summary: '你好' });
});

test('資料：章節會被保存與正規化，Markdown 以章節為小標題', () => {
  const s = normalizeState({ videos: { v1: { ytId: 'dQw4w9WgXcQ', segs: [{ t: 0, text: 'a' }, { t: 70, text: 'b' }],
    chapters: [{ t: 60, title: '第二章', summary: '摘要' }, { t: 0, title: '第一章' }, { t: 5, title: '  ' }] } } });
  const v = s.videos.v1;
  assert.deepEqual(v.chapters.map((c) => c.title), ['第一章', '第二章']);
  const md = toMarkdown(v);
  assert.ok(md.indexOf('### ') < md.indexOf('a\n'));
  assert.match(md, /### \[1:00\].* 第二章\n\n\*摘要\*/);
});
