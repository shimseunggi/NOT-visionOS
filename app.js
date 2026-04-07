import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm';

const LONG_PRESS_MS = 700;
const PINCH_DOWN = 0.055;
const PINCH_UP = 0.07;
const PINCH_STABLE_FRAMES = 3;
const RELEASE_STABLE_FRAMES = 3;
const LOST_HAND_GRACE_MS = 240;
const MOTION_DEADZONE_PX = 1.2;

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
}

function resetPinchCounters() {
  state.pinchDownFrames = 0;
  state.pinchUpFrames = 0;
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

  const target = document.elementFromPoint(state.smoothed.x, state.smoothed.y);
  if (!target) return;

  const win = target.closest('.window');
  if (win) topWindow(win);

  state.downTarget = target;
  dispatchMouse('mousedown', target, state.smoothed.x, state.smoothed.y);
}

function applyScrollIfNeeded(dx, dy) {
  const target = document.elementFromPoint(state.smoothed.x, state.smoothed.y);
  const scroller = target?.closest('.scrollable');
  if (scroller) {
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
    const target = document.elementFromPoint(state.smoothed.x, state.smoothed.y);
    dispatchMouse('contextmenu', target, state.smoothed.x, state.smoothed.y);
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
  state.dragging = false;
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
}

function applyPinchRecognition(pinchDistance) {
  if (!state.pinch) {
    if (pinchDistance < PINCH_DOWN) {
      state.pinchDownFrames += 1;
      if (state.pinchDownFrames >= PINCH_STABLE_FRAMES) startPinch();
    } else {
      state.pinchDownFrames = 0;
    }
    state.pinchUpFrames = 0;
    return;
  }

  if (pinchDistance > PINCH_UP) {
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
      ctx.clearRect(0, 0, el.overlay.width, el.overlay.height);
    }
    return;
  }

  state.handDetected = true;
  state.lastHandAt = performance.now();

  const l = landmarks[0];
  const tip = l[8];
  const thumb = l[4];

  const rawX = ((state.mirror ? 1 - tip.x : tip.x) + state.calibration.x) * window.innerWidth;
  const rawY = (tip.y + state.calibration.y) * window.innerHeight;
  const x = (rawX - window.innerWidth / 2) * state.sensitivity * state.cursorSpeed + window.innerWidth / 2;
  const y = (rawY - window.innerHeight / 2) * state.sensitivity * state.cursorSpeed + window.innerHeight / 2;
  moveCursor(x, y);

  const pinchDistance = Math.hypot(thumb.x - tip.x, thumb.y - tip.y);
  applyPinchRecognition(pinchDistance);

  updatePinchMove();
  drawDebug(l);
}

function setupMouseGestureTesting() {
  window.addEventListener('mousedown', (event) => {
    if (!state.mouseGestureEnabled || event.button !== 0 || !event.shiftKey) return;
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
