import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunk, buildOrganizePrompt, buildTranslatePrompt, parseOrganizeReply, parseTranslateReply, extractJsonArray } from '../../app/js/claude.js';

test('chunk 切份', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('整理提示詞：包含字幕、不要求翻譯、要求 para', () => {
  const p = buildOrganizePrompt([{ t: 1.4, text: 'hello' }], 'prev');
  assert.match(p, /\[1\] hello/);
  assert.match(p, /不要翻譯/);
  assert.match(p, /"para":true/);
  assert.match(p, /前文最後內容/);
});

test('翻譯提示詞：索引從 offset 開始', () => {
  const p = buildTranslatePrompt([{ text: 'a' }, { text: 'b' }], 80);
  assert.match(p, /"i":80/);
  assert.match(p, /"i":81/);
});

test('解析整理回覆：容忍程式碼區塊與前後文字', () => {
  const r = parseOrganizeReply('好的：\n```json\n[{"t":"3","sp":"b","text":" Hi ","para":true},{"t":9,"text":"x"}]\n```\n以上');
  assert.deepEqual(r, [{ t: 3, sp: 'B', text: 'Hi', zh: '', para: true }, { t: 9, sp: 'A', text: 'x', zh: '', para: false }]);
});

test('解析整理回覆：過濾不合格項目、講者限 A–D', () => {
  const r = parseOrganizeReply('[{"t":1,"sp":"<script>","text":"ok"},{"t":2},null,{"text":""}]');
  assert.equal(r.length, 1);
  assert.equal(r[0].sp, 'A');
});

test('解析失敗給中文訊息', () => {
  assert.throws(() => extractJsonArray('沒有陣列'), /找不到 JSON 陣列/);
  assert.throws(() => extractJsonArray('[1,'), /找不到 JSON 陣列|JSON 格式錯誤/);
});

test('解析翻譯回覆', () => {
  const m = parseTranslateReply('[{"i":0,"zh":"你好"},{"i":"x","zh":"bad"},{"i":2,"zh":" 世界 "}]');
  assert.equal(m.get(0), '你好');
  assert.equal(m.get(2), '世界');
  assert.equal(m.size, 2);
  assert.throws(() => parseTranslateReply('[]'), /沒有找到/);
});
