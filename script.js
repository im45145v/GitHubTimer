const STORAGE_KEY = "github-timer-state-v1";
const GLYPHS = {
  "0": [
    "11111",
    "10001",
    "10011",
    "10101",
    "11001",
    "10001",
    "11111",
  ],
  "1": [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110",
  ],
  "2": [
    "11111",
    "00001",
    "00001",
    "11111",
    "10000",
    "10000",
    "11111",
  ],
  "3": [
    "11111",
    "00001",
    "00001",
    "01111",
    "00001",
    "00001",
    "11111",
  ],
  "4": [
    "10001",
    "10001",
    "10001",
    "11111",
    "00001",
    "00001",
    "00001",
  ],
  "5": [
    "11111",
    "10000",
    "10000",
    "11111",
    "00001",
    "00001",
    "11111",
  ],
  "6": [
    "11111",
    "10000",
    "10000",
    "11111",
    "10001",
    "10001",
    "11111",
  ],
  "7": [
    "11111",
    "00001",
    "00010",
    "00100",
    "01000",
    "01000",
    "01000",
  ],
  "8": [
    "11111",
    "10001",
    "10001",
    "11111",
    "10001",
    "10001",
    "11111",
  ],
  "9": [
    "11111",
    "10001",
    "10001",
    "11111",
    "00001",
    "00001",
    "11111",
  ],
  ":": [
    "0",
    "1",
    "1",
    "0",
    "1",
    "1",
    "0",
  ],
};

const elements = {
  displayGrid: document.getElementById("display-grid"),
  statusPill: document.getElementById("status-pill"),
  hoursInput: document.getElementById("hours-input"),
  minutesInput: document.getElementById("minutes-input"),
  secondsInput: document.getElementById("seconds-input"),
  sessionLabel: document.getElementById("session-label"),
  startButton: document.getElementById("start-button"),
  pauseButton: document.getElementById("pause-button"),
  resumeButton: document.getElementById("resume-button"),
  resetButton: document.getElementById("reset-button"),
  todayFocus: document.getElementById("today-focus"),
  currentStreak: document.getElementById("current-streak"),
  totalSessions: document.getElementById("total-sessions"),
  totalFocus: document.getElementById("total-focus"),
  contributionGraph: document.getElementById("contribution-graph"),
  exportButton: document.getElementById("export-button"),
  importButton: document.getElementById("import-button"),
  resetDataButton: document.getElementById("reset-data-button"),
  importFileInput: document.getElementById("import-file-input"),
  modeButtons: Array.from(document.querySelectorAll(".mode-button")),
  presetButtons: Array.from(document.querySelectorAll(".preset-button")),
};

const state = loadState();
let displayIntervalId = null;

init();

function init() {
  normalizeState();
  bindEvents();
  renderAll();
  startTicker();
}

function loadState() {
  const fallback = {
    mode: "clock",
    currentLabel: "Coding",
    timer: {
      status: "idle",
      inputMs: 25 * 60 * 1000,
      remainingMs: 25 * 60 * 1000,
      targetTime: null,
      pausedAt: null,
    },
    sessions: [],
  };

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return fallback;
    }

    const parsed = JSON.parse(saved);
    return {
      ...fallback,
      ...parsed,
      timer: {
        ...fallback.timer,
        ...(parsed.timer || {}),
      },
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch (error) {
    console.warn("Unable to load saved state.", error);
    return fallback;
  }
}

function normalizeState() {
  state.mode = state.mode === "timer" ? "timer" : "clock";
  state.timer.status = ["idle", "running", "paused"].includes(state.timer.status) ? state.timer.status : "idle";
  state.currentLabel = ["Coding", "Studying", "Project", "Other"].includes(state.currentLabel)
    ? state.currentLabel
    : "Coding";

  state.sessions = state.sessions
    .filter((session) => session && Number.isFinite(session.durationMs) && session.completedAt)
    .sort((left, right) => new Date(left.completedAt) - new Date(right.completedAt));

  state.timer.inputMs = Number(state.timer.inputMs);
  state.timer.remainingMs = Number(state.timer.remainingMs);
  state.timer.targetTime = state.timer.targetTime === null ? null : Number(state.timer.targetTime);

  if (!Number.isFinite(state.timer.inputMs) || state.timer.inputMs < 0) {
    state.timer.inputMs = 25 * 60 * 1000;
  }

  if (!Number.isFinite(state.timer.remainingMs) || state.timer.remainingMs < 0) {
    state.timer.remainingMs = state.timer.inputMs;
  }

  if (state.timer.status === "running") {
    const remainingMs = Math.max(0, state.timer.targetTime - Date.now());
    if (remainingMs === 0) {
      finishTimer();
      return;
    }
    state.timer.remainingMs = remainingMs;
  }

  syncInputsWithTimer(state.timer.remainingMs);
  elements.sessionLabel.value = state.currentLabel;
  saveState();
}

function bindEvents() {
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      saveState();
      renderAll();
    });
  });

  elements.presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTimerFromDuration(Number(button.dataset.preset));
    });
  });

  [elements.hoursInput, elements.minutesInput, elements.secondsInput].forEach((input) => {
    input.addEventListener("change", handleManualDurationChange);
  });

  elements.sessionLabel.addEventListener("change", () => {
    state.currentLabel = elements.sessionLabel.value;
    saveState();
  });

  elements.startButton.addEventListener("click", startTimer);
  elements.pauseButton.addEventListener("click", pauseTimer);
  elements.resumeButton.addEventListener("click", resumeTimer);
  elements.resetButton.addEventListener("click", resetTimer);

  elements.exportButton.addEventListener("click", exportData);
  elements.importButton.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", importData);
  elements.resetDataButton.addEventListener("click", resetAllData);
}

function startTicker() {
  if (displayIntervalId) {
    clearInterval(displayIntervalId);
  }

  displayIntervalId = setInterval(() => {
    if (state.timer.status === "running") {
      const remainingMs = Math.max(0, state.timer.targetTime - Date.now());
      state.timer.remainingMs = remainingMs;
      if (remainingMs === 0) {
        finishTimer();
        return;
      }
    }

    renderDisplay();
    renderStatus();
  }, 250);
}

function handleManualDurationChange() {
  if (state.timer.status === "running") {
    return;
  }

  setTimerFromDuration(readInputsAsDuration());
}

function setTimerFromDuration(durationMs) {
  const safeDuration = Math.min(Math.max(durationMs, 0), 99 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000);
  state.timer.inputMs = safeDuration;
  state.timer.remainingMs = safeDuration;
  state.timer.status = "idle";
  state.timer.targetTime = null;
  state.timer.pausedAt = null;
  syncInputsWithTimer(safeDuration);
  syncPresetSelection(safeDuration);
  saveState();
  renderAll();
}

function readInputsAsDuration() {
  const hours = clampWholeNumber(elements.hoursInput.value, 0, 99);
  const minutes = clampWholeNumber(elements.minutesInput.value, 0, 59);
  const seconds = clampWholeNumber(elements.secondsInput.value, 0, 59);
  return (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
}

function clampWholeNumber(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(Math.max(parsed, min), max);
}

function syncInputsWithTimer(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  elements.hoursInput.value = String(hours);
  elements.minutesInput.value = String(minutes);
  elements.secondsInput.value = String(seconds);
  syncPresetSelection(durationMs);
}

function syncPresetSelection(durationMs) {
  elements.presetButtons.forEach((button) => {
    button.classList.toggle("is-selected", Number(button.dataset.preset) === durationMs);
  });
}

function startTimer() {
  const durationMs = readInputsAsDuration();
  if (durationMs <= 0) {
    return;
  }

  state.mode = "timer";
  state.timer.status = "running";
  state.timer.inputMs = durationMs;
  state.timer.remainingMs = durationMs;
  state.timer.targetTime = Date.now() + durationMs;
  state.timer.pausedAt = null;
  saveState();
  renderAll();
}

function pauseTimer() {
  if (state.timer.status !== "running") {
    return;
  }

  state.timer.remainingMs = Math.max(0, state.timer.targetTime - Date.now());
  state.timer.status = "paused";
  state.timer.targetTime = null;
  state.timer.pausedAt = Date.now();
  saveState();
  renderAll();
}

function resumeTimer() {
  if (state.timer.status !== "paused" || state.timer.remainingMs <= 0) {
    return;
  }

  state.mode = "timer";
  state.timer.status = "running";
  state.timer.targetTime = Date.now() + state.timer.remainingMs;
  state.timer.pausedAt = null;
  saveState();
  renderAll();
}

function resetTimer() {
  state.timer.status = "idle";
  state.timer.targetTime = null;
  state.timer.pausedAt = null;
  state.timer.remainingMs = state.timer.inputMs;
  syncInputsWithTimer(state.timer.inputMs);
  saveState();
  renderAll();
}

function finishTimer() {
  const completedDuration = state.timer.inputMs;

  state.timer.status = "idle";
  state.timer.targetTime = null;
  state.timer.pausedAt = null;
  state.timer.remainingMs = completedDuration;
  syncInputsWithTimer(completedDuration);

  state.sessions.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    completedAt: new Date().toISOString(),
    durationMs: completedDuration,
    label: state.currentLabel,
  });

  saveState();
  renderAll();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `github-timer-export-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      state.timer.status = "idle";
      state.timer.targetTime = null;
      state.timer.pausedAt = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      Object.assign(state, loadState());
      normalizeState();
      renderAll();
    } catch (error) {
      window.alert("That file could not be imported.");
    } finally {
      elements.importFileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (!window.confirm("Reset all timer and focus session data?")) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  const fresh = loadState();
  Object.assign(state, fresh);
  normalizeState();
  renderAll();
}

function renderAll() {
  renderMode();
  renderDisplay();
  renderStatus();
  renderControls();
  renderStats();
  renderGraph();
}

function renderMode() {
  elements.modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderDisplay() {
  const displayText = state.mode === "clock" ? getCurrentTimeString() : formatDurationAsClock(getDisplayDuration());
  const frameSeed = Math.floor(Date.now() / 800);
  elements.displayGrid.innerHTML = "";

  [...displayText].forEach((character, charIndex) => {
    const pattern = GLYPHS[character];
    const columnCount = Math.max(...pattern.map((row) => row.length));
    const glyphElement = document.createElement("div");
    glyphElement.className = "glyph";
    glyphElement.style.setProperty("--columns", columnCount);

    pattern.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        const cell = document.createElement("span");
        const isLit = pixel === "1";
        const level = isLit ? getDisplayLevel(charIndex, rowIndex, columnIndex, frameSeed) : 0;
        cell.className = `display-cell level-${level}${isLit ? " is-lit" : ""}`;
        cell.style.setProperty("--pulse-delay", `${((charIndex + rowIndex + columnIndex) % 6) * 0.15}s`);
        glyphElement.appendChild(cell);
      });
    });

    elements.displayGrid.appendChild(glyphElement);
  });
}

function renderStatus() {
  let label = "Clock mode";

  if (state.mode === "timer") {
    if (state.timer.status === "running") {
      label = `Running • ${state.currentLabel}`;
    } else if (state.timer.status === "paused") {
      label = `Paused • ${state.currentLabel}`;
    } else {
      label = `Timer ready • ${state.currentLabel}`;
    }
  }

  elements.statusPill.textContent = label;
}

function getDisplayDuration() {
  if (state.timer.status === "running") {
    return Math.max(0, state.timer.targetTime - Date.now());
  }
  return state.timer.remainingMs;
}

function renderControls() {
  const isTimerMode = state.mode === "timer";
  const isRunning = state.timer.status === "running";
  const isPaused = state.timer.status === "paused";

  const inputsDisabled = isRunning;
  elements.hoursInput.disabled = inputsDisabled;
  elements.minutesInput.disabled = inputsDisabled;
  elements.secondsInput.disabled = inputsDisabled;
  elements.sessionLabel.disabled = false;
  elements.presetButtons.forEach((button) => {
    button.disabled = inputsDisabled;
  });

  elements.startButton.disabled = !isTimerMode || isRunning;
  elements.pauseButton.disabled = !isTimerMode || !isRunning;
  elements.resumeButton.disabled = !isTimerMode || !isPaused;
  elements.resetButton.disabled = !isTimerMode;
}

function renderStats() {
  const dayTotals = getDayTotals();
  const todayKey = getLocalDateKey(new Date());
  const todayDurationMs = dayTotals.get(todayKey) || 0;
  const totalDurationMs = state.sessions.reduce((sum, session) => sum + session.durationMs, 0);

  elements.todayFocus.textContent = formatDuration(todayDurationMs);
  elements.currentStreak.textContent = String(getCurrentStreak(dayTotals));
  elements.totalSessions.textContent = String(state.sessions.length);
  elements.totalFocus.textContent = formatDuration(totalDurationMs);
}

function renderGraph() {
  const dayTotals = getDayTotals();
  const endDate = startOfDay(new Date());
  const startDate = startOfDay(new Date(endDate));
  startDate.setDate(startDate.getDate() - 371);
  while (startDate.getDay() !== 0) {
    startDate.setDate(startDate.getDate() - 1);
  }

  const cells = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = getLocalDateKey(cursor);
    const level = getGraphLevel(dayTotals.get(key) || 0);
    const title = `${key} • ${formatDuration(dayTotals.get(key) || 0)}`;
    cells.push({ level, title });
    cursor.setDate(cursor.getDate() + 1);
  }

  elements.contributionGraph.innerHTML = "";
  cells.forEach((cellData) => {
    const cell = document.createElement("span");
    cell.className = `graph-cell level-${cellData.level}`;
    cell.title = cellData.title;
    cell.setAttribute("role", "listitem");
    cell.setAttribute("aria-label", cellData.title);
    elements.contributionGraph.appendChild(cell);
  });
}

function getDayTotals() {
  const totals = new Map();

  state.sessions.forEach((session) => {
    const key = getLocalDateKey(new Date(session.completedAt));
    totals.set(key, (totals.get(key) || 0) + session.durationMs);
  });

  return totals;
}

function getCurrentStreak(dayTotals) {
  let streak = 0;
  const cursor = startOfDay(new Date());

  while ((dayTotals.get(getLocalDateKey(cursor)) || 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getCurrentTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDurationAsClock(durationMs) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
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

function getDisplayLevel(charIndex, rowIndex, columnIndex, frameSeed) {
  return 1 + ((charIndex * 5 + rowIndex * 3 + columnIndex + frameSeed) % 4);
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

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
