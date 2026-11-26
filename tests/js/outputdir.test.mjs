import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findInDir } from '../../app/js/outputdir.js';

function fakeDir(files) {
  const mk = (name, text, mtime) => ({ kind: 'file', name, getFile: async () => ({ size: text.length, lastModified: mtime, text: async () => text }) });
  const entries = Object.entries(files).map(([n, [text, mtime]]) => [n, mk(n, text, mtime)]);
  return {
    async *entries() { for (const e of entries) yield e; },
    async getFileHandle(n) { const e = entries.find(([k]) => k === n); if (!e) throw new Error('NotFound'); return e[1]; },
  };
}

test('依影片 ID 找最新的 .srt，並帶入章節', async () => {
  const dir = fakeDir({
    'old [dQw4w9WgXcQ].srt': ['old', 1],
    'new [dQw4w9WgXcQ].srt': ['new', 5],
    'new [dQw4w9WgXcQ].chapters.json': ['[{"t":0,"title":"Intro"}]', 5],
    'x [aaaaaaaaaaa].srt': ['other', 9],
    'notes [dQw4w9WgXcQ].txt': ['no', 9],
  });
  const r = await findInDir(dir, 'dQw4w9WgXcQ');
  assert.equal(r.name, 'new [dQw4w9WgXcQ].srt');
  assert.equal(r.srt, 'new');
  assert.deepEqual(r.chapters, [{ t: 0, title: 'Intro' }]);
});

test('找不到或太舊時回 null；沒有章節檔時章節為空', async () => {
  assert.equal(await findInDir(fakeDir({ 'x [aaaaaaaaaaa].srt': ['a', 1] }), 'dQw4w9WgXcQ'), null);
  assert.equal(await findInDir(fakeDir({ 'v [dQw4w9WgXcQ].srt': ['a', 1] }), 'dQw4w9WgXcQ', 10), null);
  const r = await findInDir(fakeDir({ 'v [dQw4w9WgXcQ].srt': ['a', 20] }), 'dQw4w9WgXcQ', 10);
  assert.deepEqual(r.chapters, []);
});
