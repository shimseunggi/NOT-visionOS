import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm';

const LONG_PRESS_MS = 700;
const PINCH_DOWN_RATIO = 0.36;
const PINCH_UP_RATIO = 0.52;
const PINCH_UP_WHILE_DRAGGING_RATIO = 0.6;
const PINCH_STABLE_FRAMES = 3;
const RELEASE_STABLE_FRAMES = 3;
const LOST_HAND_GRACE_MS = 240;
const MOTION_DEADZONE_PX = 1.2;
const CURSOR_INPUT_SMOOTHING = 0.22;
const CURSOR_JITTER_DEADZONE_PX = 2.2;
const PINCH_RATIO_SMOOTHING = 0.35;

const state = {
  mode: 'mouse',
  stream: null,
  handLandmarker: null,
  cursor: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  smoothed: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  pinch: false,
  pinchStartAt: 0,
  longPressFired: false,
  downTarget: null,
  dragging: false,
  lastMove: null,
  z: 10,
  sensitivity: 1.2,
  cursorSpeed: 1,
  mirror: true,
  calibration: { x: 0, y: 0 },
  pinchDownFrames: 0,
  pinchUpFrames: 0,
  lastHandAt: 0,
  handDetected: false,
  mouseGestureEnabled: true,
  mouseGestureActive: false,
  stabilizedRaw: null,
  pinchRatioSmoothed: null,
  pinchScrollTarget: null,
  pinchHoverTarget: null,
  pinchActiveTarget: null,
  palmOpen: false,
  palmCenter: null,
  gestureHomeTimer: null,
};

const el = {
  workspace: document.getElementById('workspace'),
  video: document.getElementById('camera'),
  overlay: document.getElementById('overlay'),
  cursor: document.getElementById('virtual-cursor'),
  cameraStatus: document.getElementById('camera-status'),
  modeStatus: document.getElementById('mode-status'),
  homePanel: document.getElementById('home-panel'),
  quickPanel: document.getElementById('quick-panel'),
  cameraToggle: document.getElementById('camera-toggle'),
  sensitivity: document.getElementById('sensitivity'),
  cursorSpeed: document.getElementById('cursor-speed'),
  mirrorToggle: document.getElementById('mirror-toggle'),
  mouseGestureToggle: document.getElementById('mouse-gesture-toggle'),
  gestureHomeButton: document.getElementById('gesture-home-button'),
};

const ctx = el.overlay.getContext('2d');

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function setMode(mode) {
  state.mode = mode;
  el.modeStatus.textContent = `모드: ${mode}`;
}

function setCameraState(on) {
  el.cameraStatus.classList.toggle('off', !on);
  el.cameraStatus.textContent = on ? '카메라 켜짐' : '카메라 꺼짐';
}

function resizeOverlay() {
  el.overlay.width = window.innerWidth;
  el.overlay.height = window.innerHeight;
}

function moveCursor(x, y) {
  state.cursor.x = clamp(x, 0, window.innerWidth);
  state.cursor.y = clamp(y, 0, window.innerHeight);
  state.smoothed.x += (state.cursor.x - state.smoothed.x) * 0.35;
  state.smoothed.y += (state.cursor.y - state.smoothed.y) * 0.35;
  el.cursor.style.left = `${state.smoothed.x}px`;
  el.cursor.style.top = `${state.smoothed.y}px`;
  updatePinchHoverFromCursor();
}

function resetPinchCounters() {
  state.pinchDownFrames = 0;
  state.pinchUpFrames = 0;
}

function computePalmCenter(landmarks) {
  const points = [landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]];
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function isPalmOpen(landmarks) {
  const extendedFingers = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].every(([tip, pip]) => landmarks[tip].y < landmarks[pip].y - 0.02);

  const spread = Math.abs(landmarks[8].x - landmarks[20].x);
  const thumbExtended = Math.hypot(
    landmarks[4].x - landmarks[5].x,
    landmarks[4].y - landmarks[5].y,
    landmarks[4].z - landmarks[5].z,
  ) > 0.11;

  return extendedFingers && spread > 0.24 && thumbExtended;
}

function updateGestureHomeButtonPosition() {
  if (!state.palmCenter) return;
  const x = (state.mirror ? 1 - state.palmCenter.x : state.palmCenter.x) * window.innerWidth;
  const y = state.palmCenter.y * window.innerHeight;
  el.gestureHomeButton.style.left = `${clamp(x, 56, window.innerWidth - 56)}px`;
  el.gestureHomeButton.style.top = `${clamp(y - 70, 84, window.innerHeight - 56)}px`;
}

function showGestureHomeButton() {
  updateGestureHomeButtonPosition();
  el.gestureHomeButton.classList.add('visible');
  window.clearTimeout(state.gestureHomeTimer);
  state.gestureHomeTimer = window.setTimeout(() => {
    el.gestureHomeButton.classList.remove('visible');
  }, 2800);
}

function openHomePanelFromGesture() {
  window.clearTimeout(state.gestureHomeTimer);
  el.gestureHomeButton.classList.remove('visible');
  el.homePanel.classList.remove('hidden');
}

function nearestPinchable(target) {
  return target?.closest('.window, .titlebar, .resize-handle, button, input, .scrollable') || null;
}

function setPinchHoverTarget(target) {
  if (state.pinchHoverTarget === target) return;
  state.pinchHoverTarget?.classList.remove('pinch-hover');
  state.pinchHoverTarget = target;
  state.pinchHoverTarget?.classList.add('pinch-hover');
}

function setPinchActiveTarget(target) {
  if (state.pinchActiveTarget === target) return;
  state.pinchActiveTarget?.classList.remove('pinch-locked');
  state.pinchActiveTarget = target;
  state.pinchActiveTarget?.classList.add('pinch-locked');
}

function updatePinchHoverFromCursor() {
  if (state.pinch) return;
  const hoverTarget = nearestPinchable(document.elementFromPoint(state.smoothed.x, state.smoothed.y));
  setPinchHoverTarget(hoverTarget);
}

function populateList() {
  const list = document.getElementById('demo-list');
  for (let i = 1; i <= 60; i += 1) {
    const li = document.createElement('li');
    li.textContent = `스크롤 아이템 ${i}`;
    list.append(li);
  }
}

function topWindow(windowEl) {
  state.z += 1;
  windowEl.style.zIndex = state.z;
  document.querySelectorAll('.window').forEach((w) => w.classList.remove('focused'));
  windowEl.classList.add('focused');
}

function dispatchMouse(type, target, x, y, extra = {}) {
  if (!target) return;
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons: state.pinch ? 1 : 0,
    ...extra,
  }));
}

function startPinch() {
  state.pinch = true;
  state.pinchStartAt = performance.now();
  state.longPressFired = false;
  state.dragging = false;
  state.lastMove = { ...state.smoothed };
  el.cursor.classList.add('pinched');

  if (state.palmOpen) {
    openHomePanelFromGesture();
  }

  const target = document.elementFromPoint(state.smoothed.x, state.smoothed.y);
  if (!target) return;

  const win = target.closest('.window');
  if (win) topWindow(win);

  state.downTarget = target;
  state.pinchScrollTarget = target.closest('.scrollable');
  setPinchHoverTarget(null);
  setPinchActiveTarget(nearestPinchable(target));
  dispatchMouse('mousedown', target, state.smoothed.x, state.smoothed.y);
}

function applyScrollIfNeeded(dx, dy) {
  const scroller = state.pinchScrollTarget;
  if (scroller && document.contains(scroller)) {
    scroller.scrollTop -= dy * 1.8;
    return true;
  }
  return false;
}

function updatePinchMove() {
  if (!state.pinch) return;

  const now = performance.now();
  if (!state.longPressFired && now - state.pinchStartAt >= LONG_PRESS_MS) {
    state.longPressFired = true;
    dispatchMouse('contextmenu', state.downTarget, state.smoothed.x, state.smoothed.y);
  }

  const dx = state.smoothed.x - state.lastMove.x;
  const dy = state.smoothed.y - state.lastMove.y;
  if (Math.hypot(dx, dy) > MOTION_DEADZONE_PX) {
    state.dragging = true;
    dispatchMouse('mousemove', state.downTarget, state.smoothed.x, state.smoothed.y, { movementX: dx, movementY: dy });
    applyScrollIfNeeded(dx, dy);
  }

  state.lastMove = { ...state.smoothed };
}

function endPinch() {
  if (!state.pinch) return;
  const duration = performance.now() - state.pinchStartAt;
  el.cursor.classList.remove('pinched');

  dispatchMouse('mouseup', state.downTarget, state.smoothed.x, state.smoothed.y);
  if (!state.longPressFired && duration < LONG_PRESS_MS + 80 && !state.dragging) {
    dispatchMouse('click', state.downTarget, state.smoothed.x, state.smoothed.y);
  }

  state.pinch = false;
  state.downTarget = null;
  state.pinchScrollTarget = null;
  state.dragging = false;
  setPinchActiveTarget(null);
  updatePinchHoverFromCursor();
  resetPinchCounters();
}

function drawDebug(landmarks) {
  ctx.clearRect(0, 0, el.overlay.width, el.overlay.height);
  if (!landmarks?.length) return;

  ctx.strokeStyle = 'rgba(130, 193, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  landmarks.forEach((p) => {
    const x = (state.mirror ? 1 - p.x : p.x) * window.innerWidth;
    const y = p.y * window.innerHeight;
    ctx.moveTo(x + 1, y);
    ctx.arc(x, y, 3, 0, Math.PI * 2);
  });
  ctx.stroke();

  if (state.palmOpen && state.palmCenter) {
    const centerX = (state.mirror ? 1 - state.palmCenter.x : state.palmCenter.x) * window.innerWidth;
    const centerY = state.palmCenter.y * window.innerHeight;
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 210, 255, 0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function applyPinchRecognition(pinchRatio) {
  state.pinchRatioSmoothed = state.pinchRatioSmoothed == null
    ? pinchRatio
    : state.pinchRatioSmoothed + (pinchRatio - state.pinchRatioSmoothed) * PINCH_RATIO_SMOOTHING;
  const stablePinchRatio = state.pinchRatioSmoothed;

  if (!state.pinch) {
    if (stablePinchRatio < PINCH_DOWN_RATIO) {
      state.pinchDownFrames += 1;
      if (state.pinchDownFrames >= PINCH_STABLE_FRAMES) startPinch();
    } else {
      state.pinchDownFrames = 0;
    }
    state.pinchUpFrames = 0;
    return;
  }

  const releaseThreshold = state.dragging ? PINCH_UP_WHILE_DRAGGING_RATIO : PINCH_UP_RATIO;
  if (stablePinchRatio > releaseThreshold) {
    state.pinchUpFrames += 1;
    if (state.pinchUpFrames >= RELEASE_STABLE_FRAMES) endPinch();
  } else {
    state.pinchUpFrames = 0;
  }
}

function updateFromHand(landmarks) {
  const hasHand = landmarks?.length;
  if (!hasHand) {
    if (state.handDetected && performance.now() - state.lastHandAt > LOST_HAND_GRACE_MS) {
      state.handDetected = false;
      if (state.pinch) endPinch();
      resetPinchCounters();
      state.stabilizedRaw = null;
      state.pinchRatioSmoothed = null;
      setPinchHoverTarget(null);
      setPinchActiveTarget(null);
      state.palmOpen = false;
      state.palmCenter = null;
      ctx.clearRect(0, 0, el.overlay.width, el.overlay.height);
    }
    return;
  }

  state.handDetected = true;
  state.lastHandAt = performance.now();

  const l = landmarks[0];
  const tip = l[8];
  const thumb = l[4];

  state.palmCenter = computePalmCenter(l);
  state.palmOpen = isPalmOpen(l);
  if (el.gestureHomeButton.classList.contains('visible')) updateGestureHomeButtonPosition();

  const rawX = ((state.mirror ? 1 - tip.x : tip.x) + state.calibration.x) * window.innerWidth;
  const rawY = (tip.y + state.calibration.y) * window.innerHeight;
  if (!state.stabilizedRaw) {
    state.stabilizedRaw = { x: rawX, y: rawY };
  } else {
    const deltaX = rawX - state.stabilizedRaw.x;
    const deltaY = rawY - state.stabilizedRaw.y;
    if (Math.hypot(deltaX, deltaY) >= CURSOR_JITTER_DEADZONE_PX) {
      state.stabilizedRaw.x += deltaX * CURSOR_INPUT_SMOOTHING;
      state.stabilizedRaw.y += deltaY * CURSOR_INPUT_SMOOTHING;
    }
  }

  const x = (state.stabilizedRaw.x - window.innerWidth / 2) * state.sensitivity * state.cursorSpeed + window.innerWidth / 2;
  const y = (state.stabilizedRaw.y - window.innerHeight / 2) * state.sensitivity * state.cursorSpeed + window.innerHeight / 2;
  moveCursor(x, y);

  const pinchDistance = Math.hypot(thumb.x - tip.x, thumb.y - tip.y, thumb.z - tip.z);
  const palmAnchor = l[5];
  const handScale = Math.hypot(palmAnchor.x - l[17].x, palmAnchor.y - l[17].y, palmAnchor.z - l[17].z) || 1;
  const pinchRatio = pinchDistance / handScale;
  applyPinchRecognition(pinchRatio);

  updatePinchMove();
  drawDebug(l);
}

function setupMouseGestureTesting() {
  window.addEventListener('mousedown', (event) => {
    if (!state.mouseGestureEnabled || event.button !== 0) return;
    const wantsPinchGesture = event.shiftKey || !!event.target.closest('.resize-handle');
    if (!wantsPinchGesture) return;
    moveCursor(event.clientX, event.clientY);
    state.mouseGestureActive = true;
    if (!state.pinch) startPinch();
    event.preventDefault();
  }, true);

  window.addEventListener('mousemove', (event) => {
    if (!state.mouseGestureEnabled || !state.mouseGestureActive) return;
    moveCursor(event.clientX, event.clientY);
    updatePinchMove();
  }, true);

  window.addEventListener('mouseup', (event) => {
    if (!state.mouseGestureEnabled || event.button !== 0 || !state.mouseGestureActive) return;
    moveCursor(event.clientX, event.clientY);
    state.mouseGestureActive = false;
    if (state.pinch) endPinch();
    event.preventDefault();
  }, true);
}

async function setupHandTracking() {
  try {
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      },
      numHands: 1,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: 0.45,
      minTrackingConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
    });
  } catch (error) {
    console.error(error);
    setMode('mouse');
  }
}

function detectLoop() {
  if (state.mode !== 'camera_hand' || !state.handLandmarker || el.video.readyState < 2) {
    requestAnimationFrame(detectLoop);
    return;
  }

  const now = performance.now();
  const result = state.handLandmarker.detectForVideo(el.video, now);
  updateFromHand(result.landmarks);
  requestAnimationFrame(detectLoop);
}

async function startCamera() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
      audio: false,
    });
    el.video.srcObject = state.stream;
    setCameraState(true);
    await setupHandTracking();
    setMode(state.handLandmarker ? 'camera_hand' : 'mouse');
  } catch (error) {
    console.warn('camera denied, fallback mouse', error);
    setCameraState(false);
    setMode('mouse');
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  setCameraState(false);
  setMode('mouse');
}

function setupWindows() {
  const mins = { w: 240, h: 160 };
  const maxs = { w: window.innerWidth * 0.9, h: window.innerHeight * 0.85 };
  let action = null;

  function onDown(event) {
    const win = event.target.closest('.window');
    if (!win) return;
    topWindow(win);

    const rect = win.getBoundingClientRect();
    if (event.target.classList.contains('resize-handle')) {
      action = { type: 'resize', win, startX: event.clientX, startY: event.clientY, startW: rect.width, startH: rect.height };
      return;
    }

    if (event.target.classList.contains('titlebar')) {
      action = { type: 'move', win, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    }
  }

  function onMove(event) {
    if (!action) return;
    const { win } = action;
    if (action.type === 'move') {
      win.style.left = `${clamp(event.clientX - action.dx, 0, window.innerWidth - win.offsetWidth)}px`;
      win.style.top = `${clamp(event.clientY - action.dy, 56, window.innerHeight - win.offsetHeight)}px`;
    } else {
      const nextW = clamp(action.startW + (event.clientX - action.startX), mins.w, maxs.w);
      const nextH = clamp(action.startH + (event.clientY - action.startY), mins.h, maxs.h);
      win.style.width = `${nextW}px`;
      win.style.height = `${nextH}px`;
    }
  }

  function onUp() { action = null; }

  document.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function setupMouseFallbackCursor() {
  window.addEventListener('mousemove', (event) => {
    if (state.mode !== 'mouse') return;
    moveCursor(event.clientX, event.clientY);
  });
}

function setupUI() {
  document.getElementById('home-toggle').onclick = () => el.homePanel.classList.toggle('hidden');
  document.getElementById('quick-toggle').onclick = () => el.quickPanel.classList.toggle('hidden');
  document.getElementById('open-settings').onclick = () => {
    el.homePanel.classList.add('hidden');
    el.quickPanel.classList.remove('hidden');
  };

  document.getElementById('new-window').onclick = () => {
    const win = document.createElement('div');
    win.className = 'window';
    win.style.left = `${120 + Math.random() * 420}px`;
    win.style.top = `${120 + Math.random() * 320}px`;
    win.style.width = '320px';
    win.style.height = '210px';
    win.innerHTML = '<div class="titlebar">새 창</div><div class="window-content">새 창 내용</div><div class="resize-handle"></div>';
    el.workspace.append(win);
    topWindow(win);
  };

  document.getElementById('reset-layout').onclick = () => location.reload();
  document.getElementById('restart-tracking').onclick = async () => {
    if (state.stream) {
      await setupHandTracking();
      setMode(state.handLandmarker ? 'camera_hand' : 'mouse');
    }
  };

  document.getElementById('recalibrate').onclick = () => {
    state.calibration = {
      x: (0.5 - state.smoothed.x / window.innerWidth) * 0.15,
      y: (0.5 - state.smoothed.y / window.innerHeight) * 0.15,
    };
  };

  el.cameraToggle.onchange = async (event) => {
    if (event.target.checked) {
      await startCamera();
    } else {
      stopCamera();
    }
  };

  el.sensitivity.oninput = (event) => { state.sensitivity = Number(event.target.value); };
  el.cursorSpeed.oninput = (event) => { state.cursorSpeed = Number(event.target.value); };
  el.mirrorToggle.onchange = (event) => { state.mirror = event.target.checked; };
  el.mouseGestureToggle.onchange = (event) => {
    state.mouseGestureEnabled = event.target.checked;
    if (!state.mouseGestureEnabled && state.mouseGestureActive) {
      state.mouseGestureActive = false;
      if (state.pinch) endPinch();
    }
  };

  el.gestureHomeButton.onclick = () => {
    el.homePanel.classList.remove('hidden');
    el.gestureHomeButton.classList.remove('visible');
  };

  document.getElementById('fullscreen').onclick = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  };
}

async function init() {
  resizeOverlay();
  populateList();
  setupWindows();
  setupMouseFallbackCursor();
  setupMouseGestureTesting();
  setupUI();
  window.addEventListener('resize', resizeOverlay);

  if (!window.isSecureContext) {
    setCameraState(false);
    setMode('mouse');
    return;
  }

  await startCamera();
  requestAnimationFrame(detectLoop);
}

init();
