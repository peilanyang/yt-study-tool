// 截圖（F5）：用螢幕分享擷取「這個分頁」，再裁出播放器範圍（架構 ADR-3、資安 3.7）。
'use strict';

let stream = null;
let video = null;
let onChange = () => {};

export function onCaptureChange(fn) { onChange = fn; }
export const isCapturing = () => !!(stream && stream.active);

export function stopCapture() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  onChange(false);
}

async function ensure() {
  if (isCapturing()) return true;
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('這個瀏覽器不支援畫面擷取，請用電腦版 Chrome 或 Edge');
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 30, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    });
  } catch {
    stream = null;
    throw new Error('沒有取得畫面分享權限。請按截圖後，在跳出的視窗選「這個分頁」');
  }
  video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  stream.getVideoTracks()[0].addEventListener('ended', () => { stream = null; onChange(false); });
  onChange(true);
  await new Promise((r) => setTimeout(r, 400));
  return true;
}

/**
 * 擷取元素目前畫面。
 * @param {HTMLElement} el 播放器外框
 * @returns {Promise<Blob>}
 */
export async function grab(el) {
  await ensure();
  el.scrollIntoView({ block: 'nearest' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rect = el.getBoundingClientRect();
  const sx = video.videoWidth / window.innerWidth;
  const sy = video.videoHeight / window.innerHeight;
  if (Math.abs(sx - sy) / sx > 0.08) throw new Error('分享的似乎不是這個分頁。請按「停止分享」後重新截圖，並選「這個分頁」');
  const c = document.createElement('canvas');
  c.width = Math.round(rect.width * sx);
  c.height = Math.round(rect.height * sy);
  c.getContext('2d').drawImage(video, rect.left * sx, rect.top * sy, rect.width * sx, rect.height * sy, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('截圖失敗'))), 'image/png'));
}
