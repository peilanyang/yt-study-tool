import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, normalizeState, addVideo, deletePlaylist, removeVideo, moveVideo, segIndexAt, INBOX, toMarkdown } from '../../app/js/model.js';

const V1 = {
  playlists: [{ id: 'p1', name: 'Excel 教學', videos: ['v1'] }],
  videos: {
    v1: { id: 'v1', ytId: 'dQw4w9WgXcQ', title: 'T', segs: [{ t: 0, sp: 'A', text: 'a', zh: '甲' }], notes: [{ id: 'n1', t: 5, text: 'x', shotId: 's1', created: 1 }], speakers: { A: '主持人' } },
    v2: { id: 'v2', ytId: 'aaaaaaaaaaa', title: 'orphan', segs: [], notes: [] },
    bad: { id: 'bad', ytId: 'not-valid' },
  },
  current: 'v1',
  settings: { apiKey: 'sk-ant-secret', view: 'bi' },
};

test('空狀態有不可刪的未分類清單', () => {
  const s = emptyState();
  assert.equal(s.playlists[0].id, INBOX);
  assert.equal(s.playlists[0].locked, true);
  assert.equal(s.settings.pauseOnShot, true);
});

test('v1 升級：未分類在最前、孤兒影片放進未分類、不合法影片丟棄、不帶入 API 金鑰', () => {
  const s = normalizeState(V1);
  assert.equal(s.schema, 2);
  assert.equal(s.playlists[0].id, INBOX);
  assert.deepEqual(s.playlists[0].videos, ['v2']);
  assert.equal(s.playlists[1].name, 'Excel 教學');
  assert.equal(s.videos.bad, undefined);
  assert.equal(JSON.stringify(s).includes('sk-ant'), false);
  assert.equal(s.videos.v1.mode, 'transcript');
  assert.equal(s.videos.v2.mode, 'watch');
  assert.equal(s.videos.v1.segs[0].para, true);
  assert.equal(s.settings.view, 'bi');
});

test('垃圾輸入回空狀態', () => {
  assert.deepEqual(normalizeState(null).playlists.length, 1);
  assert.deepEqual(normalizeState('x').videos, {});
});

test('加入影片：同一部不重複、預設放未分類', () => {
  const s = emptyState();
  const a = addVideo(s, 'dQw4w9WgXcQ', INBOX, 'watch');
  const b = addVideo(s, 'dQw4w9WgXcQ', INBOX, 'transcript');
  assert.equal(a, b);
  assert.equal(s.playlists[0].videos.length, 1);
  assert.equal(addVideo(s, 'bbbbbbbbbbb', 'nope', 'watch') in s.videos, true);
  assert.equal(s.playlists[0].videos.length, 2);
});

test('刪除清單：影片移到未分類；未分類不能刪', () => {
  const s = normalizeState(V1);
  assert.equal(deletePlaylist(s, INBOX), false);
  assert.equal(deletePlaylist(s, 'p1'), true);
  assert.ok(s.playlists[0].videos.includes('v1'));
});

test('移除影片：還在別的清單就保留；最後一份才刪並回傳截圖', () => {
  const s = normalizeState(V1);
  moveVideo(s, 'p1', INBOX, 'v1');
  assert.deepEqual(removeVideo(s, INBOX, 'v1'), ['s1']);
  assert.equal(s.videos.v1, undefined);
  assert.equal(s.current, null);
});

test('segIndexAt 二分搜尋', () => {
  const segs = [{ t: 0 }, { t: 10 }, { t: 20 }];
  assert.equal(segIndexAt(segs, 0), 0);
  assert.equal(segIndexAt(segs, 15), 1);
  assert.equal(segIndexAt(segs, 99), 2);
  assert.equal(segIndexAt([{ t: 5 }], 1), -1);
});

test('Markdown 匯出含時間連結、講者與翻譯', () => {
  const md = toMarkdown(normalizeState(V1).videos.v1);
  assert.match(md, /\[0:05\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&t=5s\)/);
  assert.match(md, /主持人：a/);
  assert.match(md, /> 甲/);
});

test('作者章節經過整理保留', () => {
  const s = normalizeState({ videos: { v: { ytId: 'dQw4w9WgXcQ', authorChapters: [{ t: '3', title: 'A' }, { t: 1 }, null] } } });
  assert.deepEqual(s.videos.v.authorChapters, [{ t: 3, title: 'A' }]);
});
