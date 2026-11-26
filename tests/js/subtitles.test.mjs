import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitles, groupRaw } from '../../app/js/subtitles.js';

test('YouTube 轉錄稿：時間與文字分行', () => {
  assert.deepEqual(parseSubtitles('0:00\nHello everyone\n0:04\nwelcome back\n1:02:03\nend'),
    [{ t: 0, text: 'Hello everyone' }, { t: 4, text: 'welcome back' }, { t: 3723, text: 'end' }]);
});

test('YouTube 轉錄稿：時間與文字同一行', () => {
  assert.deepEqual(parseSubtitles('0:00 hi there\n0:05 second'), [{ t: 0, text: 'hi there' }, { t: 5, text: 'second' }]);
});

test('SRT：多行合併、序號略過', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,000\nfirst line\ncontinued\n\n2\n00:00:04,500 --> 00:00:06,000\nnext';
  assert.deepEqual(parseSubtitles(srt), [{ t: 1, text: 'first line continued' }, { t: 4.5, text: 'next' }]);
});

test('VTT：去除標籤與重複行', () => {
  const vtt = 'WEBVTT\nKind: captions\n\n00:00:01.000 --> 00:00:02.000\n<c>hello</c>\n\n00:00:02.000 --> 00:00:03.000\nhello\n\n00:00:03.000 --> 00:00:04.000\nworld';
  assert.deepEqual(parseSubtitles(vtt), [{ t: 1, text: 'hello' }, { t: 3, text: 'world' }]);
});

test('Windows 換行與空輸入', () => {
  assert.deepEqual(parseSubtitles('0:00\r\nA\r\n'), [{ t: 0, text: 'A' }]);
  assert.deepEqual(parseSubtitles(''), []);
});

test('groupRaw 依 20 秒分段，第一段為文章段落開頭', () => {
  const g = groupRaw([{ t: 0, text: 'a' }, { t: 10, text: 'b' }, { t: 25, text: 'c' }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].text, 'a b');
  assert.equal(g[0].para, true);
  assert.equal(g[1].para, false);
});
