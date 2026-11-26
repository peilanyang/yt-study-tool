import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, html, raw, fmt, toSec, ytId, safeName } from '../../app/js/util.js';

test('esc 跳脫 HTML 特殊字元', () => {
  assert.equal(esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  assert.equal(esc(null), '');
});

test('html`` 自動跳脫插值，raw 與巢狀不重複跳脫', () => {
  const name = '<script>alert(1)</script>';
  const out = html`<b>${name}</b>${raw('<i>x</i>')}${[html`<u>${'&'}</u>`]}`.value;
  assert.equal(out, '<b>&lt;script&gt;alert(1)&lt;/script&gt;</b><i>x</i><u>&amp;</u>');
});

test('fmt 秒數格式', () => {
  assert.equal(fmt(0), '0:00');
  assert.equal(fmt(65.9), '1:05');
  assert.equal(fmt(3723), '1:02:03');
  assert.equal(fmt(-3), '0:00');
});

test('toSec 解析時間', () => {
  assert.equal(toSec('1:02:03'), 3723);
  assert.equal(toSec('00:00:01,500'), 1.5);
});

test('ytId 各種網址', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', ' https://www.youtube.com/live/dQw4w9WgXcQ?si=1 '])
    assert.equal(ytId(u), 'dQw4w9WgXcQ', u);
  assert.equal(ytId('https://example.com'), null);
  assert.equal(ytId(''), null);
});

test('safeName 移除 Windows 不允許字元', () => {
  assert.equal(safeName('a/b:c*?"<>|d'), 'a_b_c______d');
});
