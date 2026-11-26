// 播放清單與加入影片（F1）
'use strict';
import { $, html, setHtml, ytId, toast } from './util.js';
import { INBOX, addVideo, deletePlaylist, removeVideo, moveVideo } from './model.js';
import { shots, forgetShotUrl } from './store.js';

let ctx;

export function initPlaylist(c) {
  ctx = c;
  $('#btnNewPl').addEventListener('click', newPlaylist);
  $('#btnAddVideo').addEventListener('click', () => openAdd());
  $('#pls').addEventListener('click', onClick);
  $('#pls').addEventListener('change', onChange);
  $('#tglSide').addEventListener('click', () => $('#app').classList.toggle('nosb'));
  initAddDialog();
}

function newPlaylist() {
  const name = (prompt('新播放清單名稱') || '').trim();
  if (!name) return null;
  const p = { id: 'p' + Date.now().toString(36), name: name.slice(0, 100), videos: [] };
  ctx.state.playlists.push(p);
  ctx.save();
  renderSide();
  return p.id;
}

export function renderSide() {
  const { state } = ctx;
  const opts = state.playlists.map((p) => html`<option value="${p.id}">${p.name}</option>`);
  setHtml($('#pls'), state.playlists.map((p, pi) => html`
    <div class="pl" data-pl="${p.id}">
      <div class="plh">
        <button class="n" data-act="toggle" aria-expanded="${!p.collapsed}">${p.collapsed ? '▸' : '▾'} ${p.name} <span class="badge">(${p.videos.length})${p.locked ? ' · 預設' : ''}</span></button>
        ${p.locked ? '' : html`
          <button class="ghost" data-act="up" aria-label="上移清單「${p.name}」" ${pi <= 1 ? 'disabled' : ''}>↑</button>
          <button class="ghost" data-act="rename" aria-label="重新命名清單「${p.name}」">✎</button>
          <button class="ghost" data-act="del" aria-label="刪除清單「${p.name}」">✕</button>`}
      </div>
      ${p.collapsed ? '' : p.videos.map((vid) => {
        const v = state.videos[vid];
        if (!v) return '';
        const label = v.title || v.ytId;
        return html`
        <div class="vi ${vid === state.current ? 'on' : ''}" data-v="${vid}">
          <button class="t" data-act="open" title="${label}">${label}</button>
          ${v.segs.length ? html`<span class="tag">逐字稿</span>` : ''}
          <span class="acts">
            <button class="ghost" data-act="vup" aria-label="上移">↑</button>
            <button class="ghost" data-act="vdown" aria-label="下移">↓</button>
            <button class="ghost" data-act="vren" aria-label="重新命名影片">✎</button>
            <select data-act="vmove" aria-label="移到其他清單"><option value="">⇄</option>${opts}</select>
            <button class="ghost" data-act="vdel" aria-label="從清單移除影片">✕</button>
          </span>
        </div>`;
      })}
    </div>`));
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'SELECT') return;
  const { state } = ctx;
  const plEl = b.closest('.pl');
  const p = plEl && state.playlists.find((x) => x.id === plEl.dataset.pl);
  const vid = b.closest('.vi')?.dataset.v;
  const i = state.playlists.indexOf(p);
  switch (b.dataset.act) {
    case 'toggle': p.collapsed = !p.collapsed; break;
    case 'up': if (i > 1) [state.playlists[i - 1], state.playlists[i]] = [state.playlists[i], state.playlists[i - 1]]; break;
    case 'rename': { const n = prompt('播放清單名稱', p.name); if (n && n.trim()) p.name = n.trim().slice(0, 100); break; }
    case 'del': {
      if (!confirm(`刪除播放清單「${p.name}」？\n裡面的影片會移到「未分類」，筆記與截圖不會刪除。`)) return;
      deletePlaylist(state, p.id); toast('已刪除清單，影片已移到「未分類」'); break;
    }
    case 'open': ctx.openVideo(vid); return;
    case 'vup': case 'vdown': {
      const j = p.videos.indexOf(vid), k = b.dataset.act === 'vup' ? j - 1 : j + 1;
      if (k < 0 || k >= p.videos.length) return;
      [p.videos[j], p.videos[k]] = [p.videos[k], p.videos[j]]; break;
    }
    case 'vren': { const v = state.videos[vid]; const n = prompt('影片名稱', v.title); if (n && n.trim()) { v.title = n.trim().slice(0, 300); ctx.renderTitle(); } break; }
    case 'vdel': {
      const onlyHere = !state.playlists.some((x) => x !== p && x.videos.includes(vid));
      if (!confirm(onlyHere ? '從清單移除這部影片？\n它不在其他清單中，逐字稿、筆記與截圖會一起刪除。' : '從這個清單移除這部影片？（其他清單仍保留）')) return;
      const dead = removeVideo(state, p.id, vid);
      for (const id of dead) { await shots.del(id); forgetShotUrl(id); }
      if (!state.current) ctx.renderAll();
      break;
    }
    default: return;
  }
  ctx.save();
  renderSide();
}

function onChange(e) {
  const s = e.target;
  if (s.dataset.act !== 'vmove' || !s.value) return;
  const from = s.closest('.pl').dataset.pl;
  const vid = s.closest('.vi').dataset.v;
  if (moveVideo(ctx.state, from, s.value, vid)) {
    ctx.save();
    renderSide();
    toast('已移到「' + ctx.state.playlists.find((p) => p.id === s.value).name + '」');
  } else s.value = '';
}

/* ---------- 加入影片視窗 ---------- */
function initAddDialog() {
  const dlg = $('#dlgAdd');
  $('#addUrl').addEventListener('input', updatePreview);
  $('#addPl').addEventListener('change', (e) => {
    if (e.target.value !== '__new') return;
    const id = newPlaylist();
    fillPlaylistSelect(id || INBOX);
  });
  dlg.addEventListener('close', () => {
    const choice = dlg.returnValue;
    if (choice !== 'gen' && choice !== 'watch') return;
    const id = ytId($('#addUrl').value);
    if (!id) return;
    const vid = addVideo(ctx.state, id, $('#addPl').value, choice === 'gen' ? 'transcript' : 'watch');
    ctx.save();
    renderSide();
    ctx.openVideo(vid);
    if (choice === 'gen') ctx.openGen();
  });
}

function fillPlaylistSelect(selected = INBOX) {
  setHtml($('#addPl'), [
    ...ctx.state.playlists.map((p) => html`<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.name}${p.locked ? '（預設）' : ''}</option>`),
    html`<option value="__new">＋ 新增播放清單…</option>`,
  ]);
}

function updatePreview() {
  const id = ytId($('#addUrl').value);
  $('#addPreview').hidden = !id;
  $('#addGen').disabled = $('#addWatch').disabled = !id;
  if (id) {
    $('#addThumb').src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    $('#addId').textContent = '影片 ID：' + id;
  }
}

/** 開啟加入影片視窗；可帶入網址（例如從剪貼簿貼上） */
export function openAdd(url = '') {
  $('#addUrl').value = url;
  fillPlaylistSelect();
  updatePreview();
  $('#dlgAdd').returnValue = '';
  $('#dlgAdd').showModal();
  $('#addUrl').focus();
}
