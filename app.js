const clock = document.querySelector("#clock");
const today = document.querySelector("#today");
const ccClock = document.querySelector("#cc-clock");
const ccDay = document.querySelector("#cc-day");
const launcherOverlay = document.querySelector("#launcher-overlay");
const controlCenterOverlay = document.querySelector("#control-center-overlay");
const controlCenterToggle = document.querySelector("#control-center-toggle");
const controlCenterClose = document.querySelector("#control-center-close");
const controlCenterScrim = document.querySelector("#control-center-scrim");
const appPages = document.querySelector("#app-pages");
const pages = [...document.querySelectorAll(".app-page")];
const pageDots = [...document.querySelectorAll(".page-dot")];
const appButtons = [...document.querySelectorAll(".app-bubble")];
const toggleButtons = [...document.querySelectorAll("[data-toggle]")];
const arrangeButtons = [...document.querySelectorAll("[data-arrange]")];
const homeToggle = document.querySelector("#home-toggle");
const dockStatusTitle = document.querySelector("#dock-status-title");
const dockStatusMeta = document.querySelector("#dock-status-meta");
const ccWindowCount = document.querySelector("#cc-window-count");
const ambientSlider = document.querySelector("#ambient-slider");
const ambientValue = document.querySelector("#ambient-value");
const environmentCycleButton = document.querySelector("#environment-cycle");
const environmentButtons = [...document.querySelectorAll("[data-environment]")];
const sceneTitle = document.querySelector("#scene-title");
const sceneDescription = document.querySelector("#scene-description");
const sceneThumb = document.querySelector("#scene-thumb");
const windowLayer = document.querySelector("#window-layer");
const windowTemplate = document.querySelector("#app-window-template");
const snapPreview = document.querySelector("#snap-preview");

const WINDOW_MARGIN = 24;
const WINDOW_BOTTOM_CLEARANCE = 112;
const WINDOW_MIN_WIDTH = 420;
const WINDOW_MIN_HEIGHT = 300;
const SWIPE_THRESHOLD = 84;
const SWIPE_PREVIEW_LIMIT = 110;
const SWIPE_LOCK_RATIO = 1.15;
const WHEEL_EVENT_COUNT_THRESHOLD = 3;
const WHEEL_IDLE_RESET_MS = 180;
const WHEEL_COOLDOWN_MS = 360;
const VISION_RESIZE_INSIDE_THRESHOLD = 176;
const VISION_RESIZE_OUTSIDE_THRESHOLD = 64;
const VISION_RESIZE_BELOW_THRESHOLD = 96;
const VISION_RESIZE_BOTTOM_HOTZONE = 104;
const ENVIRONMENTS = [
  {
    key: "studio",
    label: "Studio",
    title: "Studio White",
    description: "깨끗한 흰 배경과 부드러운 그림자",
  },
  {
    key: "dunes",
    label: "Dunes",
    title: "Golden Dunes",
    description: "따뜻한 사막빛과 낮은 수평선",
  },
  {
    key: "horizon",
    label: "Horizon",
    title: "Blue Horizon",
    description: "맑은 하늘과 시원한 수평선 반사",
  },
  {
    key: "twilight",
    label: "Twilight",
    title: "Twilight Ridge",
    description: "잔잔한 황혼과 깊이 있는 원경",
  },
];

let currentPage = "0";
let currentAppButton = null;
let interaction = null;
let nextWindowZIndex = 20;
let nextWindowOffset = 0;
let launcherSwipe = null;
let suppressAppLaunchUntil = 0;
let launcherWheelCount = 0;
let launcherWheelStepHint = 1;
let launcherWheelLastEventAt = 0;
let launcherWheelCooldownUntil = 0;
let launcherWheelResetTimer = 0;
let swipePreviewResetTimer = 0;
let currentEnvironment = document.body.dataset.environment || ENVIRONMENTS[0].key;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateDateTime() {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
  });

  const timeText = timeFormatter.format(now);
  const dayText = dayFormatter.format(now);

  clock.textContent = timeText;
  ccClock.textContent = timeText;
  today.textContent = weekdayFormatter.format(now);
  ccDay.textContent = dayText;
}

function updateDock(title, meta) {
  dockStatusTitle.textContent = title;
  dockStatusMeta.textContent = meta;
}

function getOpenWindows() {
  return [...windowLayer.querySelectorAll(".app-window")];
}

function getOpenWindowCount() {
  return getOpenWindows().length;
}

function getTopWindow() {
  return getOpenWindows().sort(
    (a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0)
  )[0] || null;
}

function updateWindowCountDisplay() {
  const count = getOpenWindowCount();
  ccWindowCount.textContent = count === 1 ? "1 window open" : `${count} windows open`;
}

function getEnvironment(key = currentEnvironment) {
  return ENVIRONMENTS.find((environment) => environment.key === key) || ENVIRONMENTS[0];
}

function syncDockStatus(focusedTitle = "") {
  const count = getOpenWindowCount();
  const environment = getEnvironment();

  updateWindowCountDisplay();

  if (document.body.classList.contains("control-center-open")) {
    updateDock(
      "Control Center",
      count
        ? `${environment.title} 배경과 함께 ${count}개 창을 정렬하거나 스냅 보조를 조정할 수 있습니다`
        : `${environment.title} 배경과 씬을 조정할 수 있습니다`
    );
    return;
  }

  if (document.body.classList.contains("launcher-open")) {
    updateDock("Home", count ? `${count}개의 창이 열린 상태입니다` : "앱 아이콘을 눌러 새 창을 여세요");
    return;
  }

  if (!count) {
    updateDock("Environment Ready", `${environment.title} 배경 · Home 버튼을 눌러 런처를 여세요`);
    return;
  }

  updateDock(
    `${count} Windows Open`,
    focusedTitle
      ? `${focusedTitle} 포함, 스냅과 정렬 보조를 사용할 수 있습니다`
      : "여러 앱 창을 동시에 띄우고 정렬할 수 있습니다"
  );
}

function setEnvironment(key) {
  const environment = getEnvironment(key);

  currentEnvironment = environment.key;
  document.body.dataset.environment = environment.key;

  sceneTitle.textContent = environment.title;
  sceneDescription.textContent = environment.description;
  sceneThumb.dataset.environment = environment.key;
  sceneThumb.setAttribute("aria-label", environment.title);
  sceneThumb.setAttribute("title", environment.title);

  environmentButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.environment === environment.key);
  });

  environmentCycleButton.setAttribute(
    "aria-label",
    `Cycle environment. Current environment is ${environment.title}`
  );
  environmentCycleButton.setAttribute("title", environment.title);

  applyAmbient();
  syncDockStatus(getTopWindow()?.dataset.appTitle ?? currentAppButton?.dataset.title ?? "");
}

function cycleEnvironment(step = 1) {
  const currentIndex = ENVIRONMENTS.findIndex(
    (environment) => environment.key === currentEnvironment
  );
  const nextIndex =
    ((currentIndex === -1 ? 0 : currentIndex) + step + ENVIRONMENTS.length) %
    ENVIRONMENTS.length;

  setEnvironment(ENVIRONMENTS[nextIndex].key);
}

function setSelected(button) {
  if (!button) {
    return;
  }

  const currentPageEl = button.closest(".app-page");
  currentPage = currentPageEl.dataset.page;

  appButtons.forEach((item) => {
    const samePage = item.closest(".app-page") === currentPageEl;
    item.classList.toggle("active", samePage && item === button);
  });
}

function setPage(pageIndex) {
  currentPage = pageIndex;

  pages.forEach((page) => {
    page.classList.toggle("active", page.dataset.page === pageIndex);
  });

  pageDots.forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.pageTarget === pageIndex);
  });

  const selectedOnPage =
    currentAppButton && currentAppButton.closest(".app-page").dataset.page === pageIndex
      ? currentAppButton
      : document.querySelector(`.app-page[data-page="${pageIndex}"] .app-bubble`);

  setSelected(selectedOnPage);
}

function getPageNumber(pageIndex = currentPage) {
  return pages.findIndex((page) => page.dataset.page === pageIndex);
}

function setSwipePreview(offsetX) {
  appPages.style.setProperty(
    "--swipe-offset",
    `${clamp(offsetX, -SWIPE_PREVIEW_LIMIT, SWIPE_PREVIEW_LIMIT)}px`
  );
}

function clearSwipePreview() {
  if (swipePreviewResetTimer) {
    window.clearTimeout(swipePreviewResetTimer);
    swipePreviewResetTimer = 0;
  }
  appPages.style.removeProperty("--swipe-offset");
}

function scheduleSwipePreviewReset(delay = 140) {
  if (swipePreviewResetTimer) {
    window.clearTimeout(swipePreviewResetTimer);
  }

  swipePreviewResetTimer = window.setTimeout(() => {
    swipePreviewResetTimer = 0;
    appPages.style.removeProperty("--swipe-offset");
  }, delay);
}

function resetLauncherWheel() {
  launcherWheelCount = 0;
  launcherWheelStepHint = 1;
  launcherWheelLastEventAt = 0;
  launcherWheelCooldownUntil = 0;

  if (launcherWheelResetTimer) {
    window.clearTimeout(launcherWheelResetTimer);
    launcherWheelResetTimer = 0;
  }
}

function scheduleLauncherWheelReset() {
  if (launcherWheelResetTimer) {
    window.clearTimeout(launcherWheelResetTimer);
  }

  launcherWheelResetTimer = window.setTimeout(() => {
    launcherWheelResetTimer = 0;
    launcherWheelCount = 0;
  }, WHEEL_IDLE_RESET_MS);
}

function cancelLauncherSwipe() {
  if (!launcherSwipe) {
    clearSwipePreview();
    return;
  }

  if (appPages.hasPointerCapture?.(launcherSwipe.pointerId)) {
    appPages.releasePointerCapture(launcherSwipe.pointerId);
  }

  launcherSwipe = null;
  clearSwipePreview();
}

function resetLauncherNavigationState() {
  cancelLauncherSwipe();
  resetLauncherWheel();
  clearSwipePreview();
}

function stepLauncherPage(step, ignoreDirection = false) {
  const currentIndex = getPageNumber();
  let targetIndex = currentIndex + step;

  if (ignoreDirection) {
    if (pages.length === 2) {
      targetIndex = currentIndex === 0 ? 1 : 0;
    } else if (!pages[targetIndex]) {
      targetIndex = pages[currentIndex + 1] ? currentIndex + 1 : currentIndex - 1;
    }
  }

  const nextPage = pages[targetIndex];

  if (!nextPage) {
    scheduleSwipePreviewReset(120);
    return false;
  }

  setPage(nextPage.dataset.page);
  suppressAppLaunchUntil = window.performance.now() + 280;
  return true;
}

function finishLauncherSwipe(pointerId = null) {
  if (!launcherSwipe) {
    clearSwipePreview();
    return;
  }

  if (pointerId !== null && launcherSwipe.pointerId !== pointerId) {
    return;
  }

  if (appPages.hasPointerCapture?.(launcherSwipe.pointerId)) {
    appPages.releasePointerCapture(launcherSwipe.pointerId);
  }

  const deltaX = launcherSwipe.offsetX;
  const didSwipe = launcherSwipe.isSwiping && Math.abs(deltaX) >= SWIPE_THRESHOLD;

  if (launcherSwipe.isSwiping) {
    suppressAppLaunchUntil = window.performance.now() + 280;
  }

  if (didSwipe) {
    stepLauncherPage(deltaX < 0 ? 1 : -1, true);
  }

  launcherSwipe = null;
  clearSwipePreview();
}

function toggleLauncher(forceOpen) {
  const shouldOpen =
    typeof forceOpen === "boolean"
      ? forceOpen
      : !document.body.classList.contains("launcher-open");

  document.body.classList.toggle("launcher-open", shouldOpen);
  homeToggle.classList.toggle("is-active", shouldOpen);
  homeToggle.setAttribute("aria-expanded", String(shouldOpen));
  launcherOverlay.setAttribute("aria-hidden", String(!shouldOpen));
  resetLauncherNavigationState();
  clearAllWindowResizeCues();

  if (shouldOpen) {
    setPage(currentPage);
  }

  syncDockStatus(currentAppButton?.dataset.title ?? "");
}

function toggleControlCenter(forceOpen) {
  const shouldOpen =
    typeof forceOpen === "boolean"
      ? forceOpen
      : !document.body.classList.contains("control-center-open");

  document.body.classList.toggle("control-center-open", shouldOpen);
  controlCenterToggle.classList.toggle("is-active", shouldOpen);
  controlCenterToggle.setAttribute("aria-expanded", String(shouldOpen));
  controlCenterOverlay.setAttribute("aria-hidden", String(!shouldOpen));
  resetLauncherNavigationState();
  clearAllWindowResizeCues();

  syncDockStatus(getTopWindow()?.dataset.appTitle ?? currentAppButton?.dataset.title ?? "");
}

function setToggleState(key, isOn) {
  toggleButtons
    .filter((button) => button.dataset.toggle === key)
    .forEach((button) => {
      button.classList.toggle("is-on", isOn);
      button.setAttribute("aria-pressed", String(isOn));
    });

  if (key === "depth") {
    document.body.classList.toggle("depth-off", !isOn);
  }

  if (key === "labels") {
    document.body.classList.toggle("labels-off", !isOn);
  }

  if (key === "dim") {
    document.body.classList.toggle("dim-room", isOn);
    applyAmbient();
  }

  if (key === "snap") {
    document.body.classList.toggle("snap-off", !isOn);
    if (!isOn) {
      hideSnapPreview();
    }
  }
}

function isToggleOn(key) {
  return toggleButtons
    .filter((button) => button.dataset.toggle === key)
    .some((button) => button.classList.contains("is-on"));
}

function applyAmbient() {
  const sliderValue = Number(ambientSlider.value);
  const dimOffset = document.body.classList.contains("dim-room") ? 5 : 0;
  const lightness = clamp(sliderValue - dimOffset, 84, 100);
  const overlayStrength = 0.03 + (100 - lightness) * 0.0022;
  const brightness = 0.88 + ((lightness - 84) / 16) * 0.12;
  const saturation = 0.94 + ((lightness - 84) / 16) * 0.08;

  document.documentElement.style.setProperty("--ambient-lightness", `${lightness}%`);
  document.documentElement.style.setProperty(
    "--ambient-overlay-strength",
    overlayStrength.toFixed(3)
  );
  document.documentElement.style.setProperty("--scene-brightness", brightness.toFixed(3));
  document.documentElement.style.setProperty("--scene-saturation", saturation.toFixed(3));

  ambientValue.textContent = `${sliderValue}%`;
}

function buildTips(title) {
  return [
    `${title} 창은 다른 앱 창과 동시에 열 수 있습니다.`,
    "상단 바를 드래그하면 창 위치를 이동할 수 있습니다.",
    "드래그 중 가장자리로 가져가면 스냅 프리뷰가 나타납니다.",
  ];
}

function getViewportBounds() {
  return {
    left: WINDOW_MARGIN,
    top: WINDOW_MARGIN,
    right: window.innerWidth - WINDOW_MARGIN,
    bottom: window.innerHeight - WINDOW_BOTTOM_CLEARANCE,
  };
}

function getFrameLimits() {
  const bounds = getViewportBounds();
  const maxWidth = Math.max(280, bounds.right - bounds.left);
  const maxHeight = Math.max(240, bounds.bottom - bounds.top);

  return {
    bounds,
    minWidth: Math.min(WINDOW_MIN_WIDTH, maxWidth),
    minHeight: Math.min(WINDOW_MIN_HEIGHT, maxHeight),
    maxWidth,
    maxHeight,
  };
}

function getArrangementBounds() {
  const { bounds } = getFrameLimits();

  return {
    left: bounds.left,
    top: bounds.top + 8,
    right: bounds.right,
    bottom: bounds.bottom - 6,
  };
}

function readWindowFrame(windowEl) {
  const rect = windowEl.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function updateWindowLayoutState(windowEl, frame) {
  windowEl.classList.toggle("is-window-narrow", frame.width < 760);
  windowEl.classList.toggle("is-window-short", frame.height < 420);
  windowEl.classList.toggle(
    "is-window-compact",
    frame.width < 680 || frame.height < 360
  );
}

function updateWindowMetrics(windowEl) {
  const frame = readWindowFrame(windowEl);
  const sizeReadout = windowEl.querySelector(".window-size-pill");
  const positionReadout = windowEl.querySelector(".window-position-readout");

  sizeReadout.textContent = `${Math.round(frame.width)} × ${Math.round(frame.height)}`;
  positionReadout.textContent = `x ${Math.round(frame.left)} · y ${Math.round(frame.top)}`;
  updateWindowLayoutState(windowEl, frame);
}

function applyWindowFrame(windowEl, frame) {
  const { bounds, minWidth, minHeight, maxWidth, maxHeight } = getFrameLimits();
  const next = { ...frame };

  next.width = clamp(next.width, minWidth, maxWidth);
  next.height = clamp(next.height, minHeight, maxHeight);
  next.left = clamp(next.left, bounds.left, bounds.right - next.width);
  next.top = clamp(next.top, bounds.top, bounds.bottom - next.height);

  windowEl.style.left = `${next.left}px`;
  windowEl.style.top = `${next.top}px`;
  windowEl.style.width = `${next.width}px`;
  windowEl.style.height = `${next.height}px`;

  updateWindowMetrics(windowEl);
}

function getDefaultWindowFrame() {
  const { bounds, minWidth, minHeight, maxWidth, maxHeight } = getFrameLimits();
  const width = clamp(window.innerWidth * 0.46, minWidth, Math.min(720, maxWidth));
  const height = clamp(window.innerHeight * 0.44, minHeight, Math.min(500, maxHeight));
  const offset = (nextWindowOffset % 6) * 24;

  nextWindowOffset += 1;

  return {
    left: clamp((window.innerWidth - width) / 2 + offset, bounds.left, bounds.right - width),
    top: clamp((window.innerHeight - height) / 2 - 54 + offset, bounds.top, bounds.bottom - height),
    width,
    height,
  };
}

function clearWindowZoom(windowEl) {
  delete windowEl.dataset.zoomed;
  delete windowEl.dataset.restoreFrame;
}

function clearWindowResizeCue(windowEl) {
  if (!windowEl) {
    return;
  }

  windowEl.classList.remove("is-resize-ready", "is-vision-resizing");
  delete windowEl.dataset.resizeCue;
}

function clearAllWindowResizeCues(exceptWindow = null) {
  getOpenWindows().forEach((windowEl) => {
    if (windowEl !== exceptWindow) {
      clearWindowResizeCue(windowEl);
    }
  });
}

function getWindowResizeCueDirection(windowEl, clientX, clientY) {
  if (!windowEl || window.innerWidth <= 1080) {
    return null;
  }

  const rect = windowEl.getBoundingClientRect();
  const isWithinVerticalRange =
    clientY >= rect.bottom - VISION_RESIZE_INSIDE_THRESHOLD &&
    clientY <= rect.bottom + VISION_RESIZE_BELOW_THRESHOLD;
  const isWithinRightRange =
    clientX >= rect.right - VISION_RESIZE_INSIDE_THRESHOLD &&
    clientX <= rect.right + VISION_RESIZE_OUTSIDE_THRESHOLD;
  const isWithinLeftRange =
    clientX <= rect.left + VISION_RESIZE_INSIDE_THRESHOLD &&
    clientX >= rect.left - VISION_RESIZE_OUTSIDE_THRESHOLD;
  const isBelowWindow =
    clientY >= rect.bottom - 28 && clientY <= rect.bottom + VISION_RESIZE_BELOW_THRESHOLD;
  const isWithinRightBottomHotzone =
    clientX >= rect.right - VISION_RESIZE_BOTTOM_HOTZONE &&
    clientX <= rect.right + VISION_RESIZE_OUTSIDE_THRESHOLD;
  const isWithinLeftBottomHotzone =
    clientX <= rect.left + VISION_RESIZE_BOTTOM_HOTZONE &&
    clientX >= rect.left - VISION_RESIZE_OUTSIDE_THRESHOLD;

  if (!isWithinVerticalRange || (!isWithinRightRange && !isWithinLeftRange)) {
    return null;
  }

  if (isBelowWindow) {
    if (isWithinRightBottomHotzone && !isWithinLeftBottomHotzone) {
      return "se";
    }

    if (isWithinLeftBottomHotzone && !isWithinRightBottomHotzone) {
      return "sw";
    }
  }

  if (isWithinRightRange && isWithinLeftRange) {
    const rightDistance = Math.abs(clientX - rect.right);
    const leftDistance = Math.abs(clientX - rect.left);
    return rightDistance <= leftDistance ? "se" : "sw";
  }

  return isWithinRightRange ? "se" : "sw";
}

function applyWindowResizeCue(windowEl, direction, isResizing = false) {
  if (!windowEl || !direction) {
    clearWindowResizeCue(windowEl);
    return;
  }

  windowEl.dataset.resizeCue = direction;
  windowEl.classList.add("is-resize-ready");
  windowEl.classList.toggle("is-vision-resizing", isResizing);
}

function refreshWindowResizeCue(clientX, clientY) {
  if (
    document.body.classList.contains("launcher-open") ||
    document.body.classList.contains("control-center-open") ||
    window.innerWidth <= 1080
  ) {
    clearAllWindowResizeCues();
    return;
  }

  const activeWindow = getTopWindow();
  clearAllWindowResizeCues(activeWindow);

  if (!activeWindow) {
    return;
  }

  if (interaction) {
    if (
      interaction.type === "resize" &&
      (interaction.direction === "se" || interaction.direction === "sw") &&
      interaction.windowEl === activeWindow
    ) {
      applyWindowResizeCue(activeWindow, interaction.direction, true);
      return;
    }

    clearWindowResizeCue(activeWindow);
    return;
  }

  applyWindowResizeCue(activeWindow, getWindowResizeCueDirection(activeWindow, clientX, clientY));
}

function getSnapFrame(mode) {
  const bounds = getArrangementBounds();
  const gap = 16;
  const fullWidth = bounds.right - bounds.left;
  const fullHeight = bounds.bottom - bounds.top;
  const halfWidth = (fullWidth - gap) / 2;
  const halfHeight = (fullHeight - gap) / 2;

  switch (mode) {
    case "maximize":
      return {
        left: bounds.left,
        top: bounds.top,
        width: fullWidth,
        height: fullHeight,
      };
    case "left":
      return {
        left: bounds.left,
        top: bounds.top,
        width: halfWidth,
        height: fullHeight,
      };
    case "right":
      return {
        left: bounds.left + halfWidth + gap,
        top: bounds.top,
        width: halfWidth,
        height: fullHeight,
      };
    case "top-left":
      return {
        left: bounds.left,
        top: bounds.top,
        width: halfWidth,
        height: halfHeight,
      };
    case "top-right":
      return {
        left: bounds.left + halfWidth + gap,
        top: bounds.top,
        width: halfWidth,
        height: halfHeight,
      };
    case "bottom-left":
      return {
        left: bounds.left,
        top: bounds.top + halfHeight + gap,
        width: halfWidth,
        height: halfHeight,
      };
    case "bottom-right":
      return {
        left: bounds.left + halfWidth + gap,
        top: bounds.top + halfHeight + gap,
        width: halfWidth,
        height: halfHeight,
      };
    default:
      return null;
  }
}

function getSnapTarget(clientX, clientY) {
  if (document.body.classList.contains("snap-off")) {
    return null;
  }

  const cornerThreshold = 132;
  const edgeThreshold = 86;
  const bottomEdge = window.innerHeight - WINDOW_BOTTOM_CLEARANCE;

  if (clientY < cornerThreshold && clientX < cornerThreshold) {
    return "top-left";
  }

  if (clientY < cornerThreshold && clientX > window.innerWidth - cornerThreshold) {
    return "top-right";
  }

  if (clientY > bottomEdge - cornerThreshold && clientX < cornerThreshold) {
    return "bottom-left";
  }

  if (clientY > bottomEdge - cornerThreshold && clientX > window.innerWidth - cornerThreshold) {
    return "bottom-right";
  }

  if (clientY < edgeThreshold) {
    return "maximize";
  }

  if (clientX < edgeThreshold) {
    return "left";
  }

  if (clientX > window.innerWidth - edgeThreshold) {
    return "right";
  }

  return null;
}

function showSnapPreview(mode) {
  const frame = getSnapFrame(mode);
  if (!frame) {
    hideSnapPreview();
    return;
  }

  snapPreview.style.left = `${frame.left}px`;
  snapPreview.style.top = `${frame.top}px`;
  snapPreview.style.width = `${frame.width}px`;
  snapPreview.style.height = `${frame.height}px`;
  snapPreview.classList.add("visible");
  snapPreview.setAttribute("aria-hidden", "false");
}

function hideSnapPreview() {
  snapPreview.classList.remove("visible");
  snapPreview.setAttribute("aria-hidden", "true");
}

function populateWindow(windowEl, button) {
  const title = button.dataset.title;
  const meta = button.dataset.meta;
  const iconMarkup = button.querySelector(".bubble-face").outerHTML;

  windowEl.querySelector(".window-badge").innerHTML = iconMarkup;
  windowEl.querySelector(".window-preview").innerHTML = iconMarkup;
  windowEl.querySelector(".window-title").textContent = title;
  windowEl.querySelector(".window-heading").textContent = title;
  windowEl.querySelector(".window-description").textContent = meta;
  windowEl.querySelector(".window-list").innerHTML = buildTips(title)
    .map((tip) => `<li>${tip}</li>`)
    .join("");
  windowEl.dataset.appTitle = title;
}

function bringWindowToFront(windowEl) {
  getOpenWindows().forEach((item) => {
    item.classList.remove("is-active");
    clearWindowResizeCue(item);
  });
  nextWindowZIndex += 1;
  windowEl.style.zIndex = String(nextWindowZIndex);
  windowEl.classList.add("is-active");
  syncDockStatus(windowEl.dataset.appTitle ?? "");
}

function toggleWindowZoom(windowEl, forceMaximize = null) {
  if (!windowEl) {
    return;
  }

  const isAlreadyZoomed = windowEl.dataset.zoomed === "true";
  const shouldMaximize =
    forceMaximize === null
      ? !isAlreadyZoomed
      : forceMaximize;

  if (shouldMaximize) {
    if (!isAlreadyZoomed) {
      windowEl.dataset.restoreFrame = JSON.stringify(readWindowFrame(windowEl));
    }
    windowEl.dataset.zoomed = "true";
    applyWindowFrame(windowEl, getSnapFrame("maximize"));
    bringWindowToFront(windowEl);
    return;
  }

  const restoreFrame = windowEl.dataset.restoreFrame
    ? JSON.parse(windowEl.dataset.restoreFrame)
    : getDefaultWindowFrame();
  clearWindowZoom(windowEl);
  applyWindowFrame(windowEl, restoreFrame);
  bringWindowToFront(windowEl);
}

function arrangeWindows(mode) {
  const windows = getOpenWindows().sort(
    (a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0)
  );

  if (!windows.length) {
    return;
  }

  const bounds = getArrangementBounds();
  const gap = 18;

  if (mode === "focus") {
    toggleWindowZoom(getTopWindow(), true);
    syncDockStatus(getTopWindow()?.dataset.appTitle ?? "");
    return;
  }

  const frames = [];

  if (mode === "tile") {
    const count = windows.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const width = (bounds.right - bounds.left - gap * (cols - 1)) / cols;
    const height = (bounds.bottom - bounds.top - gap * (rows - 1)) / rows;

    windows.forEach((_, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      frames.push({
        left: bounds.left + col * (width + gap),
        top: bounds.top + row * (height + gap),
        width,
        height,
      });
    });
  }

  if (mode === "cascade") {
    const width = clamp((bounds.right - bounds.left) * 0.58, WINDOW_MIN_WIDTH, 680);
    const height = clamp((bounds.bottom - bounds.top) * 0.62, WINDOW_MIN_HEIGHT, 460);
    const step = 28;
    const baseLeft = bounds.left + 18;
    const baseTop = bounds.top + 18;
    const cycle = Math.max(1, Math.floor((bounds.right - bounds.left - width) / step));

    windows.forEach((_, index) => {
      const shift = (index % Math.max(4, cycle)) * step;
      frames.push({
        left: baseLeft + shift,
        top: baseTop + shift,
        width,
        height,
      });
    });
  }

  if (mode === "center") {
    const width = clamp((bounds.right - bounds.left) * 0.5, WINDOW_MIN_WIDTH, 640);
    const height = clamp((bounds.bottom - bounds.top) * 0.56, WINDOW_MIN_HEIGHT, 440);
    const startOffset = -((windows.length - 1) * 18) / 2;

    windows.forEach((_, index) => {
      const offset = startOffset + index * 18;
      frames.push({
        left: (window.innerWidth - width) / 2 + offset,
        top: (window.innerHeight - WINDOW_BOTTOM_CLEARANCE - height) / 2 + offset,
        width,
        height,
      });
    });
  }

  windows.forEach((windowEl, index) => {
    clearWindowZoom(windowEl);
    applyWindowFrame(windowEl, frames[index]);
    bringWindowToFront(windowEl);
  });
}

function openWindow(button) {
  if (window.performance.now() < suppressAppLaunchUntil) {
    return;
  }

  currentAppButton = button;
  setSelected(button);

  const windowEl = windowTemplate.content.firstElementChild.cloneNode(true);
  populateWindow(windowEl, button);
  windowLayer.append(windowEl);
  applyWindowFrame(windowEl, getDefaultWindowFrame());
  bringWindowToFront(windowEl);
  document.body.classList.add("window-open");

  requestAnimationFrame(() => {
    windowEl.classList.add("visible");
  });

  toggleLauncher(false);
  syncDockStatus(button.dataset.title);
}

function closeWindow(windowEl) {
  if (!windowEl) {
    return;
  }

  if (interaction?.windowEl === windowEl) {
    interaction = null;
  }

  clearWindowResizeCue(windowEl);
  windowEl.classList.remove("visible");

  window.setTimeout(() => {
    windowEl.remove();

    const remainingTopWindow = getTopWindow();

    if (!getOpenWindowCount()) {
      document.body.classList.remove("window-open");
    } else if (remainingTopWindow) {
      bringWindowToFront(remainingTopWindow);
    }

    syncDockStatus(remainingTopWindow?.dataset.appTitle ?? currentAppButton?.dataset.title ?? "");
  }, 180);
}

function startInteraction(event, windowEl, captureElement, type, direction = "") {
  if (!windowEl || document.body.classList.contains("launcher-open") || document.body.classList.contains("control-center-open")) {
    return;
  }

  if (window.innerWidth <= 1080) {
    return;
  }

  event.preventDefault();
  clearWindowZoom(windowEl);
  bringWindowToFront(windowEl);
  windowEl.classList.add("is-interacting");
  clearAllWindowResizeCues(windowEl);

  interaction = {
    windowEl,
    captureElement,
    pointerId: event.pointerId,
    type,
    direction,
    startX: event.clientX,
    startY: event.clientY,
    frame: readWindowFrame(windowEl),
    snapMode: null,
  };

  if (type === "resize" && (direction === "se" || direction === "sw")) {
    applyWindowResizeCue(windowEl, direction, true);
  }

  captureElement.setPointerCapture(event.pointerId);
}

function handleInteractionMove(event) {
  if (!interaction || event.pointerId !== interaction.pointerId) {
    return;
  }

  const deltaX = event.clientX - interaction.startX;
  const deltaY = event.clientY - interaction.startY;

  if (interaction.type === "drag") {
    applyWindowFrame(interaction.windowEl, {
      left: interaction.frame.left + deltaX,
      top: interaction.frame.top + deltaY,
      width: interaction.frame.width,
      height: interaction.frame.height,
    });

    interaction.snapMode = getSnapTarget(event.clientX, event.clientY);

    if (interaction.snapMode) {
      showSnapPreview(interaction.snapMode);
    } else {
      hideSnapPreview();
    }
    return;
  }

  const next = { ...interaction.frame };
  const direction = interaction.direction;
  const { bounds, minWidth, minHeight } = getFrameLimits();

  if (direction.includes("e")) {
    next.width = interaction.frame.width + deltaX;
  }

  if (direction.includes("s")) {
    next.height = interaction.frame.height + deltaY;
  }

  if (direction.includes("w")) {
    const width = clamp(
      interaction.frame.width - deltaX,
      minWidth,
      interaction.frame.left + interaction.frame.width - bounds.left
    );
    next.width = width;
    next.left = interaction.frame.left + (interaction.frame.width - width);
  }

  if (direction.includes("n")) {
    const height = clamp(
      interaction.frame.height - deltaY,
      minHeight,
      interaction.frame.top + interaction.frame.height - bounds.top
    );
    next.height = height;
    next.top = interaction.frame.top + (interaction.frame.height - height);
  }

  applyWindowFrame(interaction.windowEl, next);
}

function endInteraction(event) {
  if (!interaction || event.pointerId !== interaction.pointerId) {
    return;
  }

  const finishedInteraction = interaction;

  if (finishedInteraction.captureElement.hasPointerCapture(event.pointerId)) {
    finishedInteraction.captureElement.releasePointerCapture(event.pointerId);
  }

  if (finishedInteraction.type === "drag" && finishedInteraction.snapMode) {
    applyWindowFrame(finishedInteraction.windowEl, getSnapFrame(finishedInteraction.snapMode));
  }

  if (
    finishedInteraction.type === "resize" &&
    (finishedInteraction.direction === "se" || finishedInteraction.direction === "sw")
  ) {
    finishedInteraction.windowEl.classList.remove("is-vision-resizing");
  }

  finishedInteraction.windowEl.classList.remove("is-interacting");
  interaction = null;
  refreshWindowResizeCue(event.clientX, event.clientY);
  hideSnapPreview();
}

function handleWindowResizeCuePointerMove(event) {
  refreshWindowResizeCue(event.clientX, event.clientY);
}

function handleParallax(event) {
  if (document.body.classList.contains("depth-off") || window.innerWidth <= 1080) {
    appPages.style.removeProperty("--stage-rotate-x");
    appPages.style.removeProperty("--stage-rotate-y");
    return;
  }

  const x = event.clientX / window.innerWidth - 0.5;
  const y = event.clientY / window.innerHeight - 0.5;
  appPages.style.setProperty("--stage-rotate-x", `${y * -4}deg`);
  appPages.style.setProperty("--stage-rotate-y", `${x * 6}deg`);
}

function handleLauncherSwipeStart(event) {
  if (!document.body.classList.contains("launcher-open") || document.body.classList.contains("control-center-open")) {
    return;
  }

  if (event.button !== undefined && event.button !== 0) {
    return;
  }

  resetLauncherWheel();

  launcherSwipe = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: 0,
    isSwiping: false,
  };
}

function handleLauncherSwipeMove(event) {
  if (!launcherSwipe || launcherSwipe.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - launcherSwipe.startX;
  const deltaY = event.clientY - launcherSwipe.startY;

  if (!launcherSwipe.isSwiping) {
    if (Math.abs(deltaX) < 14) {
      return;
    }

    if (Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_LOCK_RATIO) {
      return;
    }

    launcherSwipe.isSwiping = true;
    appPages.setPointerCapture?.(event.pointerId);
  }

  launcherSwipe.offsetX = deltaX;
  setSwipePreview(deltaX);
  event.preventDefault();
}

function getLauncherWheelStepHint(event) {
  const isHorizontalIntent =
    Math.abs(event.deltaX) >= Math.abs(event.deltaY) * 0.72 || event.shiftKey;

  if (!isHorizontalIntent) {
    return 0;
  }

  const baseDelta =
    event.shiftKey && Math.abs(event.deltaX) < 0.5 ? event.deltaY : event.deltaX;

  if (!baseDelta) {
    return 0;
  }

  return baseDelta < 0 ? 1 : -1;
}

function handleLauncherWheel(event) {
  if (!document.body.classList.contains("launcher-open") || document.body.classList.contains("control-center-open")) {
    return;
  }

  if (launcherSwipe?.isSwiping) {
    return;
  }

  const stepHint = getLauncherWheelStepHint(event);

  if (!stepHint) {
    return;
  }

  event.preventDefault();

  const now = window.performance.now();

  if (now < launcherWheelCooldownUntil) {
    return;
  }

  if (now - launcherWheelLastEventAt > WHEEL_IDLE_RESET_MS) {
    launcherWheelCount = 0;
  }

  launcherWheelLastEventAt = now;
  launcherWheelStepHint = stepHint;
  launcherWheelCount += 1;
  scheduleLauncherWheelReset();

  if (launcherWheelCount < WHEEL_EVENT_COUNT_THRESHOLD) {
    return;
  }

  const didMove = stepLauncherPage(launcherWheelStepHint, true);
  launcherWheelCount = 0;

  if (didMove) {
    launcherWheelCooldownUntil = now + WHEEL_COOLDOWN_MS;
    return;
  }
}

appButtons.forEach((button) => {
  button.addEventListener("mouseenter", () => setSelected(button));
  button.addEventListener("focus", () => setSelected(button));
  button.addEventListener("click", () => openWindow(button));
});

pageDots.forEach((dot) => {
  dot.addEventListener("click", () => setPage(dot.dataset.pageTarget));
});

appPages.addEventListener("pointerdown", handleLauncherSwipeStart);
appPages.addEventListener("pointermove", handleLauncherSwipeMove);
appPages.addEventListener("pointerup", (event) => finishLauncherSwipe(event.pointerId));
appPages.addEventListener("pointercancel", (event) => finishLauncherSwipe(event.pointerId));
appPages.addEventListener("wheel", handleLauncherWheel, { passive: false });

toggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.toggle;
    setToggleState(key, !isToggleOn(key));
    syncDockStatus(getTopWindow()?.dataset.appTitle ?? currentAppButton?.dataset.title ?? "");
  });
});

arrangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    arrangeWindows(button.dataset.arrange);
    syncDockStatus(getTopWindow()?.dataset.appTitle ?? currentAppButton?.dataset.title ?? "");
  });
});

ambientSlider.addEventListener("input", applyAmbient);
environmentCycleButton.addEventListener("click", () => cycleEnvironment());
environmentButtons.forEach((button) => {
  button.addEventListener("click", () => setEnvironment(button.dataset.environment));
});
homeToggle.addEventListener("click", () => toggleLauncher());
controlCenterToggle.addEventListener("click", () => toggleControlCenter());
controlCenterClose.addEventListener("click", () => toggleControlCenter(false));
controlCenterScrim.addEventListener("click", () => toggleControlCenter(false));

windowLayer.addEventListener("pointerdown", (event) => {
  const windowEl = event.target.closest(".app-window");
  if (!windowEl) {
    return;
  }

  if (!document.body.classList.contains("launcher-open") && !document.body.classList.contains("control-center-open")) {
    bringWindowToFront(windowEl);
  }

  const closeButton = event.target.closest(".window-control.close");
  if (closeButton) {
    return;
  }

  const resizeHandle = event.target.closest(".resize-handle");
  if (resizeHandle) {
    startInteraction(event, windowEl, resizeHandle, "resize", resizeHandle.dataset.resize);
    return;
  }

  const dragTarget = event.target.closest("[data-drag-handle]");
  if (dragTarget && !event.target.closest(".window-controls")) {
    startInteraction(event, windowEl, dragTarget, "drag");
  }
});

windowLayer.addEventListener("dblclick", (event) => {
  const dragTarget = event.target.closest("[data-drag-handle]");
  if (!dragTarget || event.target.closest(".window-controls")) {
    return;
  }

  toggleWindowZoom(dragTarget.closest(".app-window"));
});

windowLayer.addEventListener("click", (event) => {
  const closeButton = event.target.closest(".window-control.close");
  if (!closeButton) {
    return;
  }

  closeWindow(closeButton.closest(".app-window"));
});

window.addEventListener("pointermove", handleInteractionMove);
window.addEventListener("pointerup", endInteraction);
window.addEventListener("pointercancel", endInteraction);
window.addEventListener("pointermove", handleWindowResizeCuePointerMove);
window.addEventListener("pointermove", handleParallax);
window.addEventListener("resize", () => {
  handleParallax({
    clientX: window.innerWidth / 2,
    clientY: window.innerHeight / 2,
  });

  applyAmbient();
  hideSnapPreview();
  clearSwipePreview();
  cancelLauncherSwipe();
  resetLauncherWheel();
  clearAllWindowResizeCues();

  getOpenWindows().forEach((windowEl, index) => {
    if (window.innerWidth <= 1080) {
      applyWindowFrame(windowEl, {
        left: 12,
        top: 18 + index * 18,
        width: window.innerWidth - 24,
        height: Math.max(readWindowFrame(windowEl).height, 420),
      });
      return;
    }

    applyWindowFrame(windowEl, readWindowFrame(windowEl));
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (document.body.classList.contains("control-center-open")) {
    toggleControlCenter(false);
    return;
  }

  if (document.body.classList.contains("launcher-open")) {
    toggleLauncher(false);
    return;
  }

  const topWindow = getTopWindow();
  if (topWindow) {
    closeWindow(topWindow);
  }
});

updateDateTime();
setInterval(updateDateTime, 1000);
applyAmbient();
setPage("0");
setToggleState("depth", true);
setToggleState("labels", true);
setToggleState("snap", true);
setToggleState("dim", false);
setEnvironment(currentEnvironment);
syncDockStatus();
