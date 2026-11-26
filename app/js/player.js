// YouTube IFrame Player 包裝（F11 播放控制）。
'use strict';

let player = null;
let ready = false;
let pendingId = null;
const handlers = { title: () => {}, error: () => {} };

/** 載入 YouTube IFrame API 並建立播放器。 */
export function initPlayer(elementId, { onTitle, onError } = {}) {
  if (onTitle) handlers.title = onTitle;
  if (onError) handlers.error = onError;
  window.onYouTubeIframeAPIReady = () => {
    player = new window.YT.Player(elementId, {
      width: '100%',
      height: '100%',
      playerVars: { rel: 0, playsinline: 1, origin: location.origin },
      events: {
        onReady: () => {
          ready = true;
          if (pendingId) { player.cueVideoById(pendingId); pendingId = null; }
        },
        onStateChange: () => {
          const d = player.getVideoData && player.getVideoData();
          if (d && d.title) handlers.title(d.title);
        },
        onError: (e) => handlers.error(e.data),
      },
    });
  };
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => handlers.error('load');
  document.head.appendChild(s);
}

export function loadVideo(id) {
  if (ready) player.cueVideoById(id); else pendingId = id;
}
export const isReady = () => ready;
export const now = () => (ready && player.getCurrentTime ? player.getCurrentTime() : 0);
export const duration = () => (ready && player.getDuration ? player.getDuration() : 0);
export const isPlaying = () => ready && player.getPlayerState() === 1;

export function seek(t, play = true) {
  if (!ready) return;
  player.seekTo(Math.max(0, t), true);
  if (play && player.getPlayerState() !== 1) player.playVideo();
}
export function skip(d) { if (ready) player.seekTo(Math.max(0, now() + d), true); }
export function toggle() { if (!ready) return; isPlaying() ? player.pauseVideo() : player.playVideo(); }
export function pause() { if (ready) player.pauseVideo(); }
export function setRate(r) { if (ready) player.setPlaybackRate(r); }
export const rate = () => (ready && player.getPlaybackRate ? player.getPlaybackRate() : 1);

/** 播放錯誤代碼 → 中文說明 */
export function errorText(code) {
  return ({
    2: '影片網址不正確',
    5: '播放器發生錯誤，請重新整理頁面',
    100: '找不到影片（可能已刪除或設為私人）',
    101: '影片擁有者不允許嵌入播放',
    150: '影片擁有者不允許嵌入播放',
    153: '播放器設定錯誤：請用 start.bat 或 GitHub Pages 網址開啟，不要直接開檔案',
    load: '無法載入 YouTube 播放器，請檢查網路',
  })[code] || `播放器錯誤（${code}）`;
}
