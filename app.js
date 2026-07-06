const baseUrlInput = document.getElementById('baseUrl');
const saveBtn = document.getElementById('saveBtn');
const statusBtn = document.getElementById('statusBtn');
const fastStreamBtn = document.getElementById('fastStreamBtn');
const startStreamBtn = document.getElementById('startStreamBtn');
const streamEveryFrameBtn = document.getElementById('streamEveryFrameBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
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

function openStream(path, statusHintText) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  streamView.src = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;
  showImage(streamView, streamPlaceholder);
  setStatus('Đang mở live stream', statusHintText, 'status-warn');
}

function startFastStream() {
  openStream('/stream', 'Fast Stream không chạy detection nên FPS sẽ mượt nhất.');
}

function startStream() {
  openStream('/stream?detect=1&detectEvery=5&quality=60&delay=0', 'Balanced mode: ESP32-CAM detect mỗi 5 frame, giảm JPEG quality và bỏ delay để đỡ giật hơn.');
}

function startEveryFrameStream() {
  openStream('/stream?detect=1&detectEvery=1&quality=68&delay=0', 'Box Every Frame chạy detection từng frame, đã giảm delay nhưng vẫn nặng hơn Balanced/Fast Stream.');
}

function stopStream() {
  hideImage(streamView, streamPlaceholder);
  setStatus('Đã dừng stream', 'Bạn có thể bấm Fast Stream hoặc Stream + Box Balanced để mở lại.', 'status-warn');
}

async function refreshLatestFaceResult(fallbackTitle) {
  try {
    const data = await fetchJson('/face/last-result');
    renderFaceMetadata(data, fallbackTitle);
  } catch (error) {
    setFaceResult('Không đọc được metadata face.', error.message, 'error');
  }
}

function takeSnapshot() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  snapshotView.dataset.mode = 'detect';
  snapshotView.src = `${baseUrl}/capture?detect=1&t=${Date.now()}`;
  showImage(snapshotView, snapshotPlaceholder);
  setStatus('Đã yêu cầu snapshot', 'ESP32-CAM sẽ chụp ảnh và vẽ box khuôn mặt nếu phát hiện được.', 'status-warn');
}

function recognizeSnapshot() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setStatus('Thiếu địa chỉ', 'Hãy nhập URL dạng http://192.168.x.x', 'status-error');
    return;
  }

  snapshotView.dataset.mode = 'recognize';
  snapshotView.src = `${baseUrl}/capture?detect=1&recognize=1&t=${Date.now()}`;
  showImage(snapshotView, snapshotPlaceholder);
  setStatus('Đang nhận diện snapshot', 'Recognition chạy theo chế độ manual để phù hợp ESP32-CAM.', 'status-warn');
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
  fastStreamBtn.addEventListener('click', startFastStream);
  startStreamBtn.addEventListener('click', startStream);
  streamEveryFrameBtn.addEventListener('click', startEveryFrameStream);
  stopStreamBtn.addEventListener('click', stopStream);
  snapshotBtn.addEventListener('click', takeSnapshot);
  recognizeSnapshotBtn.addEventListener('click', recognizeSnapshot);
  enrollBtn.addEventListener('click', enrollFace);
  refreshFacesBtn.addEventListener('click', loadFaceIds);

  streamView.addEventListener('error', () => {
    hideImage(streamView, streamPlaceholder);
    setStatus('Stream lỗi', 'Không mở được mode stream đã chọn. Kiểm tra lại IP hoặc firmware ESP32-CAM.', 'status-error');
  });

  snapshotView.addEventListener('error', () => {
    hideImage(snapshotView, snapshotPlaceholder);
    setStatus('Snapshot lỗi', 'Không tải được /capture face mode. Kiểm tra lại IP hoặc face pipeline.', 'status-error');
  });

  snapshotView.addEventListener('load', async () => {
    const fallbackTitle = snapshotView.dataset.mode === 'recognize'
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
