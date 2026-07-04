const baseUrlInput = document.getElementById('baseUrl');
const saveBtn = document.getElementById('saveBtn');
const statusBtn = document.getElementById('statusBtn');
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const snapshotBtn = document.getElementById('snapshotBtn');
const statusText = document.getElementById('statusText');
const statusHint = document.getElementById('statusHint');
const streamView = document.getElementById('streamView');
const snapshotView = document.getElementById('snapshotView');
const streamPlaceholder = document.getElementById('streamPlaceholder');
const snapshotPlaceholder = document.getElementById('snapshotPlaceholder');

const STORAGE_KEY = 'esp32cam-base-url';

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/$/, '');
}

function getBaseUrl() {
  return normalizeBaseUrl(baseUrlInput.value);
}

function setStatus(text, hint, className = '') {
  statusText.textContent = text;
  statusText.className = className;
  statusHint.textContent = hint;
}

function showImage(img, placeholder) {
  img.classList.add('visible');
  placeholder.style.display = 'none';
}

function hideImage(img, placeholder) {
  img.classList.remove('visible');
  img.removeAttribute('src');
  placeholder.style.display = 'flex';
}

function saveBaseUrl() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  localStorage.setItem(STORAGE_KEY, baseUrl);
  setStatus('Đã lưu địa chỉ', `ESP32-CAM: ${baseUrl}`, 'status-ok');
}

async function checkStatus() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  try {
    setStatus('Đang kiểm tra…', 'Đợi phản hồi từ ESP32-CAM', 'status-warn');
    const response = await fetch(`${baseUrl}/status?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const hint = [
      `IP: ${data.ip || 'unknown'}`,
      `Wi‑Fi: ${data.wifiConnected ? 'OK' : 'Mất kết nối'}`,
      `Camera: ${data.cameraReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}`,
      `Backend upload: ${data.backendUploadEnabled ? 'Bật' : 'Tắt'}`,
    ].join(' • ');

    setStatus('ESP32-CAM đang hoạt động', hint, 'status-ok');
  } catch (error) {
    setStatus('Không kết nối được', `Không gọi được /status: ${error.message}`, 'status-error');
  }
}

function startStream() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  streamView.src = `${baseUrl}/stream?t=${Date.now()}`;
  showImage(streamView, streamPlaceholder);
  setStatus('Đang mở live stream', 'Nếu ảnh không lên, kiểm tra lại IP và Wi‑Fi.', 'status-warn');
}

function stopStream() {
  hideImage(streamView, streamPlaceholder);
  setStatus('Đã dừng stream', 'Bạn có thể bấm Start Stream để mở lại.', 'status-warn');
}

function takeSnapshot() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  snapshotView.src = `${baseUrl}/capture?t=${Date.now()}`;
  showImage(snapshotView, snapshotPlaceholder);
  setStatus('Đã yêu cầu snapshot', 'Nếu ảnh chưa hiện, đợi 1-2 giây hoặc kiểm tra lại trạng thái camera.', 'status-warn');
}

function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    baseUrlInput.value = saved;
    setStatus('Đã nạp địa chỉ đã lưu', saved, 'status-ok');
  }

  saveBtn.addEventListener('click', saveBaseUrl);
  statusBtn.addEventListener('click', checkStatus);
  startStreamBtn.addEventListener('click', startStream);
  stopStreamBtn.addEventListener('click', stopStream);
  snapshotBtn.addEventListener('click', takeSnapshot);

  streamView.addEventListener('error', () => {
    hideImage(streamView, streamPlaceholder);
    setStatus('Stream lỗi', 'Không mở được /stream. Kiểm tra lại IP hoặc firmware ESP32-CAM.', 'status-error');
  });

  snapshotView.addEventListener('error', () => {
    hideImage(snapshotView, snapshotPlaceholder);
    setStatus('Snapshot lỗi', 'Không tải được /capture. Kiểm tra lại IP hoặc camera.', 'status-error');
  });
}

init();
