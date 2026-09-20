const STORAGE_KEY = "github-timer-state-v1";
const DEFAULT_DURATION_MS = 25 * 60 * 1000;
const MAX_DURATION_MS = 99 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;
const PRESET_VALUES = [5, 15, 25, 50, 90].map((minutes) => minutes * 60 * 1000);
const DEFAULT_LABELS = ["Deep work", "Code review", "Writing", "Study", "Planning"];
const THEME_OPTIONS = ["system", "light", "dark"];
const TIMER_STATUSES = ["idle", "running", "paused", "finished"];
const PROGRESS_CELL_COUNT = 30;
const GRAPH_DAYS = 371;
const GRAPH_MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short" });
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const GLYPHS = {
  "0": ["11111", "10001", "10011", "10101", "11001", "10001", "11111"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11111", "00001", "00001", "11111", "10000", "10000", "11111"],
  "3": ["11111", "00001", "00001", "01111", "00001", "00001", "11111"],
  "4": ["10001", "10001", "10001", "11111", "00001", "00001", "00001"],
  "5": ["11111", "10000", "10000", "11111", "00001", "00001", "11111"],
  "6": ["11111", "10000", "10000", "11111", "10001", "10001", "11111"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["11111", "10001", "10001", "11111", "10001", "10001", "11111"],
  "9": ["11111", "10001", "10001", "11111", "00001", "00001", "11111"],
  ":": ["0", "1", "1", "0", "1", "1", "0"],
};

const elements = {
  body: document.body,
  displayGrid: document.getElementById("display-grid"),
  statusEyebrow: document.getElementById("status-eyebrow"),
  displayTitle: document.getElementById("display-title"),
  displayDetail: document.getElementById("display-detail"),
  statusBadge: document.getElementById("status-badge"),
  metricOneLabel: document.getElementById("metric-one-label"),
  metricOneValue: document.getElementById("metric-one-value"),
  metricTwoLabel: document.getElementById("metric-two-label"),
  metricTwoValue: document.getElementById("metric-two-value"),
  metricThreeLabel: document.getElementById("metric-three-label"),
  metricThreeValue: document.getElementById("metric-three-value"),
  progressCopy: document.getElementById("progress-copy"),
  progressPercentage: document.getElementById("progress-percentage"),
  sessionProgressGrid: document.getElementById("session-progress-grid"),
  primaryAction: document.getElementById("primary-action"),
  resetButton: document.getElementById("reset-button"),
  hoursInput: document.getElementById("hours-input"),
  minutesInput: document.getElementById("minutes-input"),
  secondsInput: document.getElementById("seconds-input"),
  sessionLabel: document.getElementById("session-label"),
  labelSuggestions: document.getElementById("label-suggestions"),
  durationSummary: document.getElementById("duration-summary"),
  todayFocus: document.getElementById("today-focus"),
  currentStreak: document.getElementById("current-streak"),
  totalSessions: document.getElementById("total-sessions"),
  totalFocus: document.getElementById("total-focus"),
  historySummary: document.getElementById("history-summary"),
  graphMonths: document.getElementById("graph-months"),
  contributionGraph: document.getElementById("contribution-graph"),
  graphEmptyState: document.getElementById("graph-empty-state"),
  lastSession: document.getElementById("last-session"),
  bestDay: document.getElementById("best-day"),
  lastSevenDays: document.getElementById("last-seven-days"),
  persistenceNote: document.getElementById("persistence-note"),
  exportButton: document.getElementById("export-button"),
  importButton: document.getElementById("import-button"),
  resetDataButton: document.getElementById("reset-data-button"),
  importFileInput: document.getElementById("import-file-input"),
  confirmDialog: document.getElementById("confirm-dialog"),
  toastRegion: document.getElementById("toast-region"),
  srAnnouncer: document.getElementById("sr-announcer"),
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  themeButtons: Array.from(document.querySelectorAll("[data-theme]")),
  presetButtons: Array.from(document.querySelectorAll(".preset-button")),
};

const runtime = {
  intervalId: null,
  toastId: null,
  storageAvailable: true,
};

const state = loadState();
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

init();

function init() {
  normalizeState();
  bindEvents();
  renderAll();
  startTicker();
}

function loadState() {
  const fallback = {
    mode: "timer",
    appearance: "system",
    currentLabel: "Deep work",
    timer: {
      status: "idle",
      inputMs: DEFAULT_DURATION_MS,
      remainingMs: DEFAULT_DURATION_MS,
      targetTime: null,
      finishedAt: null,
    },
    sessions: [],
  };

  try {
    const saved = safeStorageGet(STORAGE_KEY);
    if (!saved) {
      return fallback;
    }

    const parsed = JSON.parse(saved);
    if (!isRecord(parsed)) {
      return fallback;
    }

    return {
      ...fallback,
      ...parsed,
      timer: {
        ...fallback.timer,
        ...(isRecord(parsed.timer) ? parsed.timer : {}),
      },
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch (error) {
    console.warn("Unable to load saved state.", error);
    safeStorageRemove(STORAGE_KEY);
    return fallback;
  }
}

function normalizeState() {
  state.mode = state.mode === "clock" ? "clock" : "timer";
  state.appearance = THEME_OPTIONS.includes(state.appearance) ? state.appearance : "system";
  state.currentLabel = normalizeLabel(state.currentLabel || "Deep work");
  state.timer.status = TIMER_STATUSES.includes(state.timer.status) ? state.timer.status : "idle";
  state.timer.inputMs = clampDuration(Number(state.timer.inputMs));
  state.timer.remainingMs = clampDuration(Number(state.timer.remainingMs) || state.timer.inputMs);
  state.timer.targetTime = Number.isFinite(Number(state.timer.targetTime)) ? Number(state.timer.targetTime) : null;
  state.timer.finishedAt = Number.isFinite(Number(state.timer.finishedAt)) ? Number(state.timer.finishedAt) : null;

  state.sessions = state.sessions
    .filter((session) => session && Number.isFinite(session.durationMs) && Number.isFinite(new Date(session.completedAt).getTime()))
    .map((session) => ({
      id: session.id || `${session.completedAt}-${session.durationMs}`,
      completedAt: new Date(session.completedAt).toISOString(),
      durationMs: clampDuration(Number(session.durationMs)),
      label: normalizeLabel(session.label || "Focus session"),
    }))
    .sort((left, right) => new Date(left.completedAt) - new Date(right.completedAt));

  if (state.timer.status === "running") {
    if (!Number.isFinite(state.timer.targetTime)) {
      resetTimerState();
    } else {
      state.mode = "timer";
      state.timer.remainingMs = Math.max(0, state.timer.targetTime - Date.now());
      if (state.timer.remainingMs === 0) {
        finishTimer();
        return;
      }
    }
  }

  if (state.timer.status === "finished") {
    state.timer.remainingMs = 0;
    state.mode = "timer";
  }

  syncInputsWithDuration(state.timer.status === "finished" ? state.timer.inputMs : state.timer.remainingMs);
  elements.sessionLabel.value = state.currentLabel;
  saveState();
}

function bindEvents() {
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.appearance = button.dataset.theme;
      saveState();
      renderAppearance();
      renderModeButtons();
      showToast(`Theme set to ${button.textContent?.trim() || state.appearance}.`);
    });
  });

  elements.presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const duration = Number(button.dataset.preset);
      setTimerFromDuration(duration);
      elements.sessionLabel.focus();
    });
  });

  [elements.hoursInput, elements.minutesInput, elements.secondsInput].forEach((input) => {
    input.addEventListener("input", handleDurationInput);
    input.addEventListener("change", handleDurationInput);
  });

  elements.sessionLabel.addEventListener("input", () => {
    state.currentLabel = normalizeLabel(elements.sessionLabel.value || "Deep work");
    saveState();
    renderBuilder();
  });

  elements.primaryAction.addEventListener("click", handlePrimaryAction);
  elements.resetButton.addEventListener("click", () => {
    resetTimer();
    announce("Timer reset.");
  });

  elements.exportButton.addEventListener("click", exportData);
  elements.importButton.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", importData);
  elements.resetDataButton.addEventListener("click", confirmResetAllData);
  elements.confirmDialog.addEventListener("close", () => {
    if (elements.confirmDialog.returnValue === "confirm") {
      resetAllData();
    }
  });

  document.addEventListener("keydown", handleKeyboardShortcuts);
  document.addEventListener("visibilitychange", () => {
    renderDisplay();
    renderStatus();
    renderProgress();
    updateDocumentTitle();
  });

  if (typeof systemTheme.addEventListener === "function") {
    systemTheme.addEventListener("change", () => {
      if (state.appearance === "system") {
        renderAppearance();
      }
    });
  }
}

function startTicker() {
  if (runtime.intervalId) {
    clearInterval(runtime.intervalId);
  }

  runtime.intervalId = window.setInterval(() => {
    if (state.timer.status === "running") {
      state.timer.remainingMs = Math.max(0, state.timer.targetTime - Date.now());
      if (state.timer.remainingMs === 0) {
        finishTimer();
        return;
      }
    }

    renderDisplay();
    renderStatus();
    renderProgress();
    updateDocumentTitle();
  }, 1000);
}

function handleDurationInput() {
  if (state.timer.status === "running") {
    return;
  }

  setTimerFromDuration(readInputsAsDuration(), { preserveFinished: false, announceChange: false });
}

function handlePrimaryAction() {
  switch (state.timer.status) {
    case "idle":
    case "finished":
      startTimer();
      break;
    case "running":
      pauseTimer();
      break;
    case "paused":
      resumeTimer();
      break;
    default:
      break;
  }
}

function handleKeyboardShortcuts(event) {
  if (event.defaultPrevented || isEditableTarget(event.target) || elements.confirmDialog.open) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    handlePrimaryAction();
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "r") {
    resetTimer();
    announce("Timer reset.");
  }
  if (key === "t") {
    setMode("timer");
  }
  if (key === "c") {
    setMode("clock");
  }
}

function setMode(mode) {
  if (mode !== "clock" && mode !== "timer") {
    return;
  }

  if (state.timer.status === "running" && mode === "clock") {
    showToast("Pause or finish the active focus session before switching to clock mode.");
    return;
  }

  state.mode = mode;
  saveState();
  renderAll();
}

function setTimerFromDuration(durationMs, options = {}) {
  const { preserveFinished = false, announceChange = true } = options;
  const safeDuration = clampDuration(durationMs);
  state.timer.inputMs = safeDuration;
  state.timer.remainingMs = safeDuration;
  state.timer.targetTime = null;
  state.timer.finishedAt = preserveFinished ? state.timer.finishedAt : null;
  state.timer.status = preserveFinished ? state.timer.status : "idle";
  if (state.timer.status === "finished" && !preserveFinished) {
    state.timer.status = "idle";
  }
  if (state.timer.status !== "finished") {
    syncInputsWithDuration(safeDuration);
  }
  saveState();
  renderAll();

  if (announceChange && safeDuration > 0) {
    announce(`${formatFriendlyDuration(safeDuration)} session ready.`);
  }
}

function readInputsAsDuration() {
  const hours = clampWholeNumber(elements.hoursInput.value, 0, 99);
  const minutes = clampWholeNumber(elements.minutesInput.value, 0, 59);
  const seconds = clampWholeNumber(elements.secondsInput.value, 0, 59);
  return (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
}

function clampDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return 0;
  }
  return Math.min(durationMs, MAX_DURATION_MS);
}

function clampWholeNumber(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(Math.max(parsed, min), max);
}

function syncInputsWithDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  elements.hoursInput.value = String(hours);
  elements.minutesInput.value = String(minutes);
  elements.secondsInput.value = String(seconds);
}

function startTimer() {
  const durationMs = readInputsAsDuration();
  if (durationMs <= 0) {
    showToast("Set a duration before starting a focus session.", true);
    return;
  }

  state.mode = "timer";
  state.timer.status = "running";
  state.timer.inputMs = durationMs;
  state.timer.remainingMs = durationMs;
  state.timer.targetTime = Date.now() + durationMs;
  state.timer.finishedAt = null;
  state.currentLabel = normalizeLabel(elements.sessionLabel.value || state.currentLabel || "Deep work");
  saveState();
  renderAll();
  announce(`${state.currentLabel} started for ${formatFriendlyDuration(durationMs)}.`);
}

function pauseTimer() {
  if (state.timer.status !== "running") {
    return;
  }

  state.timer.remainingMs = Math.max(0, state.timer.targetTime - Date.now());
  state.timer.targetTime = null;
  state.timer.status = "paused";
  saveState();
  renderAll();
  announce(`Paused with ${formatClockShort(state.timer.remainingMs)} remaining.`);
}

function resumeTimer() {
  if (state.timer.status !== "paused" || state.timer.remainingMs <= 0) {
    return;
  }

  state.mode = "timer";
  state.timer.status = "running";
  state.timer.targetTime = Date.now() + state.timer.remainingMs;
  state.timer.finishedAt = null;
  saveState();
  renderAll();
  announce(`Resumed ${state.currentLabel}.`);
}

function resetTimer() {
  resetTimerState();
  syncInputsWithDuration(state.timer.inputMs);
  saveState();
  renderAll();
}

function resetTimerState() {
  state.timer.status = "idle";
  state.timer.targetTime = null;
  state.timer.finishedAt = null;
  state.timer.remainingMs = state.timer.inputMs;
}

function finishTimer() {
  const completedDuration = clampDuration(state.timer.inputMs);

  state.timer.status = "finished";
  state.timer.targetTime = null;
  state.timer.finishedAt = Date.now();
  state.timer.remainingMs = 0;
  state.mode = "timer";
  state.sessions.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    completedAt: new Date().toISOString(),
    durationMs: completedDuration,
    label: state.currentLabel,
  });

  syncInputsWithDuration(completedDuration);
  saveState();
  renderAll();
  notifySessionComplete();
  announce(`${state.currentLabel} complete.`);
}

function notifySessionComplete() {
  showToast(`${state.currentLabel} complete. Logged ${formatFriendlyDuration(state.timer.inputMs)}.`);

  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification("GitHubTimer", {
      body: `${state.currentLabel} complete.`,
    });
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `github-timer-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 0);
  showToast(`Exported ${state.sessions.length} session${state.sessions.length === 1 ? "" : "s"}.`);
}

function importData(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (typeof reader.result !== "string") {
        throw new Error("The selected file could not be read.");
      }

      const imported = JSON.parse(reader.result);
      if (!isRecord(imported)) {
        throw new Error("Imported data must be a JSON object.");
      }

      safeStorageSet(STORAGE_KEY, JSON.stringify(imported));
      Object.assign(state, loadState());
      normalizeState();
      renderAll();
      showToast(`Imported ${state.sessions.length} session${state.sessions.length === 1 ? "" : "s"}.`);
      announce("Data imported.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That file could not be imported.", true);
    } finally {
      elements.importFileInput.value = "";
    }
  };

  reader.onerror = () => {
    showToast("The selected file could not be read.", true);
    elements.importFileInput.value = "";
  };

  reader.readAsText(file);
}

function confirmResetAllData() {
  if (typeof elements.confirmDialog.showModal === "function") {
    elements.confirmDialog.showModal();
  } else if (window.confirm("Reset all timer and focus session data?")) {
    resetAllData();
  }
}

function resetAllData() {
  safeStorageRemove(STORAGE_KEY);
  Object.assign(state, loadState());
  normalizeState();
  renderAll();
  showToast("All local timer data has been reset.");
  announce("All local data reset.");
}

function renderAll() {
  renderAppearance();
  renderModeButtons();
  renderDisplay();
  renderStatus();
  renderControls();
  renderBuilder();
  renderProgress();
  renderStats();
  renderHistory();
  renderMomentum();
  renderPersistence();
  updateDocumentTitle();
}

function renderAppearance() {
  elements.body.dataset.theme = getResolvedTheme();
}

function getResolvedTheme() {
  if (state.appearance === "system") {
    return systemTheme.matches ? "dark" : "light";
  }
  return state.appearance;
}

function renderModeButtons() {
  elements.modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = state.timer.status === "running" && button.dataset.mode === "clock";
  });

  elements.themeButtons.forEach((button) => {
    const isActive = button.dataset.theme === state.appearance;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderDisplay() {
  const displayText = state.mode === "clock" ? getCurrentTimeString() : formatClockDisplay(getTimerDisplayMs());
  const fragment = document.createDocumentFragment();
  const now = new Date();
  const blinkOff = state.mode === "clock" && now.getSeconds() % 2 === 1;
  elements.displayGrid.innerHTML = "";

  [...displayText].forEach((character, index) => {
    if (index > 0) {
      const spacer = buildGlyph(["0", "0", "0", "0", "0", "0", "0"]);
      spacer.classList.add("gap-glyph");
      fragment.appendChild(spacer);
    }

    const pattern = blinkOff && character === ":" ? ["0", "0", "0", "0", "0", "0", "0"] : GLYPHS[character];
    fragment.appendChild(buildGlyph(pattern, index));
  });

  elements.displayGrid.appendChild(fragment);
}

function buildGlyph(pattern, charIndex = 0) {
  const columns = Math.max(...pattern.map((row) => row.length));
  const glyphElement = document.createElement("div");
  glyphElement.className = "glyph";
  glyphElement.style.setProperty("--columns", columns);

  pattern.forEach((row, rowIndex) => {
    [...row].forEach((pixel, columnIndex) => {
      const cell = document.createElement("span");
      const isLit = pixel === "1";
      const level = isLit ? getDisplayLevel(charIndex, rowIndex, columnIndex) : 0;
      cell.className = `display-cell level-${level}${isLit ? " is-lit" : ""}`;
      cell.style.setProperty("--pulse-delay", `${((charIndex + rowIndex + columnIndex) % 7) * 0.12}s`);
      glyphElement.appendChild(cell);
    });
  });

  return glyphElement;
}

function getDisplayLevel(charIndex, rowIndex, columnIndex) {
  if (state.mode === "clock") {
    const slowCycle = Math.floor(Date.now() / 9000);
    return 1 + ((charIndex * 5 + rowIndex * 3 + columnIndex + slowCycle) % 4);
  }

  const progress = getProgressRatio();
  const base = Math.max(1, Math.ceil(progress * 4));
  return Math.min(4, Math.max(1, base + ((charIndex + rowIndex + columnIndex) % 2 === 0 ? 0 : -1)));
}

function renderStatus() {
  const duration = state.timer.inputMs;
  const remainingMs = getTimerDisplayMs();
  const elapsedMs = Math.max(0, duration - remainingMs);
  const label = state.currentLabel || "Focus session";
  let eyebrow = "Focus timer";
  let title = "Ready to focus";
  let detail = "Pick a preset or fine-tune a session below. GitHubTimer saves everything on this device automatically.";
  let badge = formatFriendlyDuration(duration || DEFAULT_DURATION_MS);

  if (state.mode === "clock") {
    eyebrow = "Clock";
    title = "Contribution-grid clock";
    detail = "See the current time at a glance, then switch to Focus when you are ready to start a session.";
    badge = "Live";
  } else if (state.timer.status === "running") {
    title = `${label} in progress`;
    detail = `${formatClockShort(remainingMs)} remaining • ${formatClockShort(elapsedMs)} elapsed`;
    badge = `${Math.round(getProgressRatio() * 100)}% complete`;
  } else if (state.timer.status === "paused") {
    title = `${label} is paused`;
    detail = `Resume when you're ready. ${formatClockShort(remainingMs)} remain in this session.`;
    badge = "Paused";
  } else if (state.timer.status === "finished") {
    title = `${label} complete`;
    detail = `Nice work — ${formatFriendlyDuration(duration)} has been added to your contribution history.`;
    badge = "Logged";
  }

  elements.statusEyebrow.textContent = eyebrow;
  elements.displayTitle.textContent = title;
  elements.displayDetail.textContent = detail;
  elements.statusBadge.textContent = badge;
  elements.statusBadge.classList.toggle("is-complete", state.timer.status === "finished");

  if (state.mode === "clock") {
    elements.metricOneLabel.textContent = "Today";
    elements.metricOneValue.textContent = formatDuration(getTodayDurationMs());
    elements.metricTwoLabel.textContent = "Streak";
    elements.metricTwoValue.textContent = `${getCurrentStreak(getDayTotals())} day${getCurrentStreak(getDayTotals()) === 1 ? "" : "s"}`;
    elements.metricThreeLabel.textContent = "Sessions";
    elements.metricThreeValue.textContent = String(state.sessions.length);
    return;
  }

  elements.metricOneLabel.textContent = state.timer.status === "finished" ? "Completed" : "Remaining";
  elements.metricOneValue.textContent = state.timer.status === "finished" ? formatFriendlyDuration(duration) : formatClockShort(remainingMs);
  elements.metricTwoLabel.textContent = "Elapsed";
  elements.metricTwoValue.textContent = formatClockShort(elapsedMs);
  elements.metricThreeLabel.textContent = "Progress";
  elements.metricThreeValue.textContent = `${Math.round(getProgressRatio() * 100)}%`;
}

function renderControls() {
  const durationMs = readInputsAsDuration();
  const hasDuration = durationMs > 0;
  const isRunning = state.timer.status === "running";
  const isPaused = state.timer.status === "paused";
  const isFinished = state.timer.status === "finished";

  elements.primaryAction.disabled = state.mode === "clock" || (!hasDuration && !isRunning && !isPaused && !isFinished);
  elements.resetButton.disabled = state.mode === "clock" || (state.timer.status === "idle" && state.timer.inputMs === durationMs && durationMs > 0 && state.timer.remainingMs === durationMs);

  if (state.mode === "clock") {
    elements.primaryAction.textContent = "Switch to Focus to start";
    return;
  }

  if (isRunning) {
    elements.primaryAction.textContent = "Pause session";
  } else if (isPaused) {
    elements.primaryAction.textContent = "Resume session";
  } else if (isFinished) {
    elements.primaryAction.textContent = "Start again";
    elements.resetButton.disabled = false;
  } else {
    elements.primaryAction.textContent = "Start focus session";
  }
}

function renderBuilder() {
  const durationMs = readInputsAsDuration();
  const isRunning = state.timer.status === "running";
  const summaryDuration = durationMs > 0 ? durationMs : state.timer.inputMs;
  const label = normalizeLabel(elements.sessionLabel.value || state.currentLabel || "Deep work");

  elements.hoursInput.disabled = isRunning;
  elements.minutesInput.disabled = isRunning;
  elements.secondsInput.disabled = isRunning;
  elements.sessionLabel.disabled = isRunning;
  elements.presetButtons.forEach((button) => {
    button.disabled = isRunning;
    button.classList.toggle("is-selected", Number(button.dataset.preset) === durationMs);
  });

  elements.durationSummary.textContent = summaryDuration > 0
    ? `${label} is set for ${formatFriendlyDuration(summaryDuration)}.`
    : "Add a duration to create a focus session.";

  renderLabelSuggestions();
}

function renderLabelSuggestions() {
  const labels = Array.from(new Set([...DEFAULT_LABELS, ...state.sessions.map((session) => session.label).filter(Boolean)]));
  elements.labelSuggestions.innerHTML = "";
  labels.slice(0, 12).forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    elements.labelSuggestions.appendChild(option);
  });
}

function renderProgress() {
  const ratio = getProgressRatio();
  const filledCount = Math.round(ratio * PROGRESS_CELL_COUNT);
  const fragment = document.createDocumentFragment();
  elements.sessionProgressGrid.innerHTML = "";

  for (let index = 0; index < PROGRESS_CELL_COUNT; index += 1) {
    const cell = document.createElement("span");
    const isFilled = index < filledCount;
    const isStrong = index >= Math.max(0, filledCount - 5);
    cell.className = `progress-cell${isFilled ? " is-filled" : ""}${isFilled && isStrong ? " is-strong" : ""}`;
    fragment.appendChild(cell);
  }

  elements.sessionProgressGrid.appendChild(fragment);
  elements.sessionProgressGrid.setAttribute("aria-label", `${Math.round(ratio * 100)} percent of the current focus session completed`);
  elements.progressPercentage.textContent = `${Math.round(ratio * 100)}%`;
  elements.progressPercentage.classList.toggle("is-complete", state.timer.status === "finished");

  if (state.mode === "clock") {
    elements.progressCopy.textContent = "Switch to Focus to turn the contribution row into a live progress bar.";
    return;
  }

  if (state.timer.status === "running") {
    elements.progressCopy.textContent = `${formatClockShort(getElapsedMs())} completed out of ${formatFriendlyDuration(state.timer.inputMs)}.`;
  } else if (state.timer.status === "paused") {
    elements.progressCopy.textContent = `${formatClockShort(state.timer.remainingMs)} remaining in this paused session.`;
  } else if (state.timer.status === "finished") {
    elements.progressCopy.textContent = `Every square is filled — this session is complete.`;
  } else {
    elements.progressCopy.textContent = `Start a ${formatFriendlyDuration(state.timer.inputMs || DEFAULT_DURATION_MS)} session to fill the contribution row.`;
  }
}

function renderStats() {
  const dayTotals = getDayTotals();
  const todayDurationMs = getTodayDurationMs(dayTotals);
  const totalDurationMs = state.sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const streak = getCurrentStreak(dayTotals);

  elements.todayFocus.textContent = formatDuration(todayDurationMs);
  elements.currentStreak.textContent = `${streak} day${streak === 1 ? "" : "s"}`;
  elements.totalSessions.textContent = String(state.sessions.length);
  elements.totalFocus.textContent = formatDuration(totalDurationMs);
}

function renderHistory() {
  const { cells, monthMarkers, totalWeeks } = buildGraphData();
  elements.contributionGraph.innerHTML = "";
  elements.graphMonths.innerHTML = "";
  elements.graphMonths.style.gridTemplateColumns = `repeat(${totalWeeks}, var(--graph-cell))`;

  cells.forEach((cellData) => {
    const cell = document.createElement("span");
    cell.className = `graph-cell level-${cellData.level}`;
    cell.title = cellData.title;
    cell.setAttribute("role", "listitem");
    cell.setAttribute("aria-label", cellData.title);
    elements.contributionGraph.appendChild(cell);
  });

  monthMarkers.forEach((marker) => {
    const label = document.createElement("span");
    label.textContent = marker.label;
    label.style.gridColumn = `${marker.week} / span 4`;
    elements.graphMonths.appendChild(label);
  });

  const sessionsThisWeek = state.sessions.filter((session) => daysBetween(new Date(session.completedAt), new Date()) < 7).length;
  const sevenDayDuration = getLastSevenDayDuration();
  if (state.sessions.length === 0) {
    elements.historySummary.textContent = "No focus sessions yet. Your contribution history will start filling in here.";
  } else {
    elements.historySummary.textContent = `${sessionsThisWeek} session${sessionsThisWeek === 1 ? "" : "s"} completed in the last 7 days • ${formatDuration(sevenDayDuration)} focused.`;
  }

  elements.graphEmptyState.hidden = state.sessions.length > 0;
}

function buildGraphData() {
  const dayTotals = getDayTotals();
  const endDate = startOfDay(new Date());
  const startDate = startOfDay(new Date(endDate));
  startDate.setDate(startDate.getDate() - GRAPH_DAYS);
  while (startDate.getDay() !== 0) {
    startDate.setDate(startDate.getDate() - 1);
  }

  const cells = [];
  const monthMarkers = [];
  const cursor = new Date(startDate);
  let weekIndex = 0;
  let previousMonth = "";

  while (cursor <= endDate) {
    if (cursor.getDay() === 0) {
      const monthLabel = GRAPH_MONTH_FORMATTER.format(cursor);
      if (monthLabel !== previousMonth) {
        monthMarkers.push({ week: weekIndex + 1, label: monthLabel });
        previousMonth = monthLabel;
      }
      weekIndex += 1;
    }

    const key = getLocalDateKey(cursor);
    const durationMs = dayTotals.get(key) || 0;
    cells.push({
      level: getGraphLevel(durationMs),
      title: `${key} • ${durationMs > 0 ? formatDuration(durationMs) : "No focus logged"}`,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return { cells, monthMarkers, totalWeeks: weekIndex };
}

function renderMomentum() {
  const dayTotals = getDayTotals();
  const lastSession = state.sessions.at(-1);
  const bestDayEntry = Array.from(dayTotals.entries()).sort((left, right) => right[1] - left[1])[0];

  if (!lastSession) {
    elements.lastSession.textContent = "No sessions completed yet";
  } else {
    elements.lastSession.textContent = `${lastSession.label} • ${formatFriendlyDuration(lastSession.durationMs)} on ${DATE_TIME_FORMATTER.format(new Date(lastSession.completedAt))}`;
  }

  elements.bestDay.textContent = bestDayEntry
    ? `${bestDayEntry[0]} • ${formatDuration(bestDayEntry[1])}`
    : "No data yet";
  elements.lastSevenDays.textContent = formatDuration(getLastSevenDayDuration(dayTotals));
}

function renderPersistence() {
  elements.persistenceNote.textContent = runtime.storageAvailable
    ? "Saved locally on this device. Export a backup any time."
    : "Local storage is unavailable, so changes may not persist after you close this page.";
}

function getTimerDisplayMs() {
  if (state.timer.status === "running") {
    return Math.max(0, state.timer.targetTime - Date.now());
  }
  if (state.timer.status === "finished") {
    return 0;
  }
  return state.timer.remainingMs;
}

function getElapsedMs() {
  return Math.max(0, state.timer.inputMs - getTimerDisplayMs());
}

function getProgressRatio() {
  if (state.mode === "clock") {
    return 0;
  }
  if (state.timer.inputMs <= 0) {
    return 0;
  }
  if (state.timer.status === "finished") {
    return 1;
  }
  return Math.min(1, Math.max(0, getElapsedMs() / state.timer.inputMs));
}

function getDayTotals() {
  const totals = new Map();
  state.sessions.forEach((session) => {
    const key = getLocalDateKey(new Date(session.completedAt));
    totals.set(key, (totals.get(key) || 0) + session.durationMs);
  });
  return totals;
}

function getTodayDurationMs(dayTotals = getDayTotals()) {
  return dayTotals.get(getLocalDateKey(new Date())) || 0;
}

function getCurrentStreak(dayTotals = getDayTotals()) {
  let streak = 0;
  const cursor = startOfDay(new Date());

  while ((dayTotals.get(getLocalDateKey(cursor)) || 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getLastSevenDayDuration(dayTotals = getDayTotals()) {
  let total = 0;
  const cursor = startOfDay(new Date());
  for (let index = 0; index < 7; index += 1) {
    total += dayTotals.get(getLocalDateKey(cursor)) || 0;
    cursor.setDate(cursor.getDate() - 1);
  }
  return total;
}

function getCurrentTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatClockDisplay(durationMs) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatClockShort(durationMs) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds === 0) {
    return "0m";
  }
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  return `${totalMinutes}m`;
}

function formatFriendlyDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;
  }
  return `${seconds} sec`;
}

function getGraphLevel(durationMs) {
  if (durationMs <= 0) {
    return 0;
  }
  if (durationMs < 25 * 60 * 1000) {
    return 1;
  }
  if (durationMs < 60 * 60 * 1000) {
    return 2;
  }
  if (durationMs < 120 * 60 * 1000) {
    return 3;
  }
  return 4;
}

function updateDocumentTitle() {
  if (state.mode === "clock") {
    document.title = `${getCurrentTimeString()} • GitHubTimer`;
    return;
  }

  if (state.timer.status === "running" || state.timer.status === "paused") {
    document.title = `${formatClockShort(getTimerDisplayMs())} • ${state.currentLabel} • GitHubTimer`;
    return;
  }

  if (state.timer.status === "finished") {
    document.title = `Done • ${state.currentLabel} • GitHubTimer`;
    return;
  }

  document.title = `${formatFriendlyDuration(state.timer.inputMs || DEFAULT_DURATION_MS)} ready • GitHubTimer`;
}

function normalizeLabel(label) {
  return String(label).trim().replace(/\s+/g, " ").slice(0, 40) || "Deep work";
}

function announce(message) {
  elements.srAnnouncer.textContent = "";
  window.setTimeout(() => {
    elements.srAnnouncer.textContent = message;
  }, 10);
}

function showToast(message, isError = false) {
  if (runtime.toastId) {
    clearTimeout(runtime.toastId);
  }

  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  elements.toastRegion.innerHTML = "";
  elements.toastRegion.appendChild(toast);
  runtime.toastId = window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

function isEditableTarget(target) {
  return target instanceof HTMLElement && (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

function daysBetween(left, right) {
  return Math.floor((startOfDay(right) - startOfDay(left)) / (24 * 60 * 60 * 1000));
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    runtime.storageAvailable = false;
    console.warn("Unable to read saved state.", error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    runtime.storageAvailable = true;
    return true;
  } catch (error) {
    runtime.storageAvailable = false;
    console.warn("Unable to save state.", error);
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
    runtime.storageAvailable = true;
  } catch (error) {
    runtime.storageAvailable = false;
    console.warn("Unable to clear saved state.", error);
  }
}

function saveState() {
  safeStorageSet(STORAGE_KEY, JSON.stringify(state));
}
