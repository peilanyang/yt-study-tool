// 啟動、分頁切換、快捷鍵，串接各模組（架構文件第 2 節）。
'use strict';
import { $, $$, html, setHtml, fmt, ytId, toast } from './util.js';
import { SPEEDS } from './model.js';
import * as store from './store.js';
import * as player from './player.js';
import { initPlaylist, renderSide, openAdd } from './playlist.js';
import { initTranscript, render as renderTranscript, openGen } from './transcript.js';
import { initNotes, render as renderNotes, renderShots, addNote, resetFresh } from './notes.js';
import { initBackup, updateHint } from './backup.js';

const ctx = {
  state: null,
  cur: () => (ctx.state.current ? ctx.state.videos[ctx.state.current] : null),
  save: () => store.save(ctx.state, (e) => toast('儲存失敗：' + e.message)),
  /** 目前影片有變更：記錄時間並儲存 */
  touch: () => { const v = ctx.cur(); if (v) v.updatedAt = Date.now(); ctx.save(); },
  renderAll,
  renderTitle,
  openVideo,
  switchTab,
  openGen,
  addNote,
  replaceState: (s) => { ctx.state = s; ctx.save(); renderAll(); if (s.current) openVideo(s.current); updateHint(); },
};

function renderTitle() {
  const v = ctx.cur();
  $('#vtitle').textContent = v ? v.title || '' : '';
  $('#empty').hidden = !!v;
  document.title = v && v.title ? `${v.title} · 影片教學工具` : '影片教學工具';
}

function renderAll() {
  renderTitle();
  renderSide();
  renderTranscript();
  renderNotes();
  renderShots();
}

function openVideo(id) {
  const v = ctx.state.videos[id];
  if (!v) return;
  ctx.state.current = id;
  ctx.save();
  resetFresh();
  player.loadVideo(v.ytId);
  renderAll();
  switchTab(v.segs.length ? 'tr' : 'nt');
}

function switchTab(k) {
  $$('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === k)));
  for (const p of ['tr', 'sh', 'nt']) $('#tab-' + p).hidden = p !== k;
}

function initControls() {
  $$('.tabs [role=tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#bBack').addEventListener('click', () => player.skip(-5));
  $('#bFwd').addEventListener('click', () => player.skip(5));
  $('#bPlay').addEventListener('click', player.toggle);
  $('#bNote').addEventListener('click', () => { switchTab('nt'); $('#noteAtTime').checked = true; $('#noteIn').focus(); });
  setHtml($('#speeds'), SPEEDS.map((r) => html`<button data-rate="${r}" aria-pressed="${r === 1}">${r}×</button>`));
  $('#speeds').addEventListener('click', (e) => {
    const r = Number(e.target.dataset.rate);
    if (!r) return;
    player.setRate(r);
    $$('#speeds button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === r)));
  });
  const applyTheater = () => {
    const on = !!ctx.state.settings.theater;
    document.body.classList.toggle('theater', on);
    const b = $('#bTheater');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '↙ 一般畫面' : '⛶ 大畫面';
    b.title = on ? '回到原本的版面（顯示播放清單與右側面板）' : '隱藏清單、放大播放器，畫質與截圖會更清楚';
  };
  $('#bTheater').addEventListener('click', () => { ctx.state.settings.theater = !ctx.state.settings.theater; ctx.save(); applyTheater(); });
  applyTheater();
  $('#bFull').addEventListener('click', () => {
    $('#playerWrap').requestFullscreen?.().catch(() => toast('這個瀏覽器不允許全螢幕'));
  });
  $('#fsExit').addEventListener('click', () => document.exitFullscreen?.());
  $('#fsShot').addEventListener('click', () => $('#bShot').click());
  // 「產生逐字稿」按鈕可能出現在多處
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action=gen]')) openGen(); });
  setInterval(() => { if (player.isReady()) $('#tm').textContent = `${fmt(player.now())} / ${fmt(player.duration())}`; }, 500);
}

function initKeys() {
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && ctx.state.settings.theater && !document.fullscreenElement) { $('#bTheater').click(); return; }
    if (k === 's') { e.preventDefault(); $('#bShot').click(); }
    else if (k === 'n') { e.preventDefault(); $('#bNote').click(); }
    else if (k === ' ') { e.preventDefault(); player.toggle(); }
    else if (k === 'arrowleft') player.skip(-5);
    else if (k === 'arrowright') player.skip(5);
  });
  // 點了 YouTube 播放器後，鍵盤會被 iframe 拿走；把焦點拿回來，S、N 等快捷鍵才有作用
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === 'IFRAME' && a.closest('#playerWrap')) { a.blur(); window.focus(); }
    }, 0);
  });
  // 在頁面任意處貼上 YouTube 網址 → 開啟加入影片
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (/INPUT|TEXTAREA/.test(t.tagName) || t.isContentEditable || document.querySelector('dialog[open]')) return;
    const text = e.clipboardData?.getData('text') || '';
    if (ytId(text)) { e.preventDefault(); openAdd(text.trim()); }
  });
}

async function start() {
  try {
    ctx.state = await store.load();
  } catch (e) {
    toast('無法使用瀏覽器儲存空間：' + e.message);
    const { emptyState } = await import('./model.js');
    ctx.state = emptyState();
  }
  player.initPlayer('player', {
    onTitle: (title) => {
      const v = ctx.cur();
      if (v && !v.title) { v.title = title; ctx.touch(); renderTitle(); renderSide(); }
    },
    onError: (code) => toast(player.errorText(code)),
  });
  initControls();
  initKeys();
  initPlaylist(ctx);
  initTranscript(ctx);
  initNotes(ctx);
  initBackup(ctx);
  renderAll();
  if (ctx.state.current) openVideo(ctx.state.current);
  if (location.protocol === 'file:') toast('請用 start.bat 開啟，直接開檔案無法播放 YouTube');
}

start();
