const baseUrlInput = document.getElementById('baseUrl');
const saveBtn = document.getElementById('saveBtn');
const statusBtn = document.getElementById('statusBtn');
const streamBtn = document.getElementById('streamBtn');
const snapshotBtn = document.getElementById('snapshotBtn');
const recognizeSnapshotBtn = document.getElementById('recognizeSnapshotBtn');
const enrollBtn = document.getElementById('enrollBtn');
const refreshFacesBtn = document.getElementById('refreshFacesBtn');
const personNameInput = document.getElementById('personName');
const identityList = document.getElementById('identityList');
const faceResult = document.getElementById('faceResult');
const statusText = document.getElementById('statusText');
const statusHint = document.getElementById('statusHint');
const streamView = document.getElementById('streamView');
const snapshotView = document.getElementById('snapshotView');
const streamPlaceholder = document.getElementById('streamPlaceholder');
const snapshotPlaceholder = document.getElementById('snapshotPlaceholder');

const STORAGE_KEY = 'esp32cam-base-url';
const STREAM_DETECT_PATH = '/stream?detect=1&detectEvery=5&quality=60&delay=0';

let streamActive = false;
let streamFallbackAttempted = false;
let snapshotMode = '';
const STREAM_DETECT_PATH = '/stream?detect=1&detectEvery=5&quality=60&delay=0';

let streamActive = false;
let streamFallbackAttempted = false;
let snapshotMode = '';

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

function setFaceResult(title, detail = '', variant = 'neutral') {
  faceResult.className = `face-result ${variant}`;
  faceResult.innerHTML = `
    <strong>${title}</strong>
    <span>${detail || 'Không có thông tin bổ sung.'}</span>
  `;
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

async function fetchJson(path) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error('Hãy nhập địa chỉ ESP32-CAM trước.');
  }

  const response = await fetch(`${baseUrl}${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`);
  const rawText = await response.text();

  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || rawText || `HTTP ${response.status}`);
  }

  if (!data) {
    throw new Error('ESP32-CAM trả về dữ liệu JSON không hợp lệ.');
  }

  return data;
}

function renderFaceMetadata(data, fallbackTitle = 'Đã nhận metadata khuôn mặt') {
  const faces = Array.isArray(data.faces) ? data.faces : [];
  const firstFace = faces[0];

  if (!data.ok) {
    setFaceResult(data.message || 'ESP32-CAM báo lỗi face pipeline.', `Action: ${data.action || 'unknown'}`, 'error');
    return;
  }

  if (!faces.length) {
    setFaceResult(data.message || fallbackTitle, 'Không phát hiện khuôn mặt trong ảnh gần nhất.', 'warn');
    return;
  }

  const faceSummary = firstFace
    ? `Box đầu tiên: x=${firstFace.x}, y=${firstFace.y}, w=${firstFace.w}, h=${firstFace.h}, score=${Number(firstFace.score).toFixed(2)}`
    : 'Không có box chi tiết.';

  if (data.enrolled) {
    setFaceResult(
      `Đã đăng ký: ${data.enrolledName || `ID ${data.enrolledId}`}`,
      `${faceSummary}. Tổng số danh tính: ${data.enrolledCount}.`,
      'success'
    );
    return;
  }

  if (data.recognized) {
    const similarity = Number(data.similarity || 0).toFixed(2);
    setFaceResult(
      `Nhận diện: ${data.recognizedName || `ID ${data.recognizedId}`}`,
      `${faceSummary}. Similarity: ${similarity}.`,
      'success'
    );
    return;
  }

  setFaceResult(data.message || fallbackTitle, `${faceSummary}. Số khuôn mặt: ${data.faceCount || faces.length}.`, 'warn');
}

async function checkStatus() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  try {
    setStatus('Đang kiểm tra…', 'Đợi phản hồi từ ESP32-CAM', 'status-warn');
    const data = await fetchJson('/status');
    const hint = [
      `IP: ${data.ip || 'unknown'}`,
      `Wi‑Fi: ${data.wifiConnected ? 'OK' : 'Mất kết nối'}`,
      `Camera: ${data.cameraReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}`,
      `PSRAM: ${data.psramFound ? 'Có' : 'Không'}`,
      `Face IDs: ${data.enrolledCount ?? 0}`,
      `Face mode: ${data.faceRecognitionMode || 'n/a'}`,
    ].join(' • ');

    setStatus('ESP32-CAM đang hoạt động', hint, 'status-ok');
  } catch (error) {
    setStatus('Không kết nối được', `Không gọi được /status: ${error.message}`, 'status-error');
  }
}

function resetStreamButton() {
  streamBtn.textContent = 'Stream + Detect';
}

function stopStream(text = 'Đã tắt stream', hint = 'Bấm Stream + Detect để mở lại camera.', className = 'status-warn') {
  streamActive = false;
  streamFallbackAttempted = false;
  hideImage(streamView, streamPlaceholder);
  streamView.dataset.mode = '';
  resetStreamButton();
  setStatus(text, hint, className);
}

async function toggleStream() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  if (streamActive) {
    stopStream();
    return;
  }

  let path = STREAM_DETECT_PATH;
  let hint = 'Đang stream kèm box; ESP32-CAM detect mỗi 5 frame để cân bằng tốc độ.';

  try {
    const data = await fetchJson('/status');
    if (!data.faceDetectionAvailable) {
      path = '/stream';
      hint = 'Face engine chưa sẵn sàng nên đang mở stream thường, không có box.';
    }
  } catch (error) {
    hint = 'Đang mở stream detect; nếu face engine lỗi, web sẽ tự fallback sang stream thường.';
  }

  streamFallbackAttempted = false;
  streamView.dataset.mode = path === '/stream' ? 'plain' : 'detect';
  streamView.src = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;
  showImage(streamView, streamPlaceholder);
  streamActive = true;
  streamBtn.textContent = 'Tắt Stream';
  setStatus('Đang mở live stream', hint, 'status-warn');
}

async function refreshLatestFaceResult(fallbackTitle) {
  try {
    const data = await fetchJson('/face/last-result');
    renderFaceMetadata(data, fallbackTitle);
  } catch (error) {
    setFaceResult('Không đọc được metadata face.', error.message, 'error');
  }
}

function setSnapshotButtons() {
  snapshotBtn.textContent = snapshotMode === 'detect' ? 'Tắt Snapshot' : 'Take Snapshot + Box';
  recognizeSnapshotBtn.textContent = snapshotMode === 'recognize' ? 'Tắt Recognition' : 'Recognize Snapshot';
}

function hideSnapshot(text = 'Đã ẩn snapshot', hint = 'Bấm Take Snapshot + Box để chụp lại.', className = 'status-warn') {
  snapshotMode = '';
  hideImage(snapshotView, snapshotPlaceholder);
  snapshotView.dataset.mode = '';
  setSnapshotButtons();
  setStatus(text, hint, className);
}

function startSnapshot(mode) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  snapshotMode = mode;
  snapshotView.dataset.mode = mode;
  setSnapshotButtons();

  const path = mode === 'recognize'
    ? '/capture?detect=1&recognize=1'
    : '/capture?detect=1';

  snapshotView.src = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;
  showImage(snapshotView, snapshotPlaceholder);
  setStatus(
    mode === 'recognize' ? 'Đang nhận diện snapshot' : 'Đã yêu cầu snapshot',
    mode === 'recognize'
      ? 'Recognition chạy theo chế độ manual để phù hợp ESP32-CAM.'
      : 'ESP32-CAM sẽ chụp ảnh và vẽ box khuôn mặt nếu phát hiện được.',
    'status-warn'
  );
}

function takeSnapshot() {
  if (snapshotMode === 'detect') {
    hideSnapshot();
    return;
  }

  startSnapshot('detect');
}

function recognizeSnapshot() {
  if (snapshotMode === 'recognize') {
    hideSnapshot('Đã ẩn snapshot recognition', 'Bấm Recognize Snapshot để nhận diện lại.', 'status-warn');
    return;
  }

  startSnapshot('recognize');
}

async function loadFaceIds() {
  identityList.innerHTML = '<li>Đang tải danh sách...</li>';

  try {
    const data = await fetchJson('/face/ids');
    if (!Array.isArray(data.identities) || !data.identities.length) {
      identityList.innerHTML = '<li>Chưa có danh tính nào được đăng ký.</li>';
      return;
    }

    identityList.innerHTML = data.identities
      .map((item) => `<li><strong>${item.name || `ID ${item.id}`}</strong> <span class="helper">(ID ${item.id})</span></li>`)
      .join('');
  } catch (error) {
    identityList.innerHTML = `<li>Lỗi tải danh sách: ${error.message}</li>`;
  }
}

async function enrollFace() {
  const baseUrl = getBaseUrl();
  const name = personNameInput.value.trim();

  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  if (!name) {
    setFaceResult('Thiếu tên người đăng ký.', 'Hãy nhập tên trước khi bấm đăng ký khuôn mặt.', 'error');
    return;
  }

  try {
    setFaceResult('Đang đăng ký khuôn mặt...', 'Giữ 1 khuôn mặt rõ trong khung hình cho đến khi ESP32-CAM phản hồi.', 'warn');
    const data = await fetchJson(`/face/enroll?name=${encodeURIComponent(name)}`);
    renderFaceMetadata(data, 'Kết quả đăng ký khuôn mặt');
    await loadFaceIds();
    await checkStatus();
  } catch (error) {
    setFaceResult('Đăng ký thất bại.', error.message, 'error');
  }
}

function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    baseUrlInput.value = saved;
    setStatus('Đã nạp địa chỉ đã lưu', saved, 'status-ok');
  }

  saveBtn.addEventListener('click', saveBaseUrl);
  statusBtn.addEventListener('click', checkStatus);
  streamBtn.addEventListener('click', toggleStream);
  snapshotBtn.addEventListener('click', takeSnapshot);
  recognizeSnapshotBtn.addEventListener('click', recognizeSnapshot);
  enrollBtn.addEventListener('click', enrollFace);
  refreshFacesBtn.addEventListener('click', loadFaceIds);

  streamView.addEventListener('error', () => {
    const baseUrl = getBaseUrl();
    if (streamActive && !streamFallbackAttempted && baseUrl && streamView.dataset.mode === 'detect') {
      streamFallbackAttempted = true;
      streamView.dataset.mode = 'plain';
      streamView.src = `${baseUrl}/stream?t=${Date.now()}`;
      showImage(streamView, streamPlaceholder);
      setStatus('Đang mở stream thường', 'Face detect stream lỗi nên tự fallback sang stream thường, không có box.', 'status-warn');
      return;
    }

    stopStream('Stream lỗi', 'Không mở được stream. Kiểm tra lại IP, cùng mạng Wi‑Fi hoặc firmware ESP32-CAM.', 'status-error');
  });

  snapshotView.addEventListener('error', () => {
    hideSnapshot('Snapshot lỗi', 'Không tải được /capture face mode. Kiểm tra lại IP hoặc face pipeline.', 'status-error');
  });

  snapshotView.addEventListener('load', async () => {
    const fallbackTitle = snapshotMode === 'recognize'
      ? 'Đã nhận snapshot recognition.'
      : 'Đã nhận snapshot detection.';
    await refreshLatestFaceResult(fallbackTitle);
  });

  if (saved) {
    loadFaceIds();
    checkStatus();
  }
}

init();
