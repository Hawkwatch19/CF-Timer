// CF Timer — Content Script
// Problem detection + overlay with auto-minimize (sliver) + theme toggle

// ── PROBLEM DETECTION ─────────────────────────────────────────────
function getProblemInfo() {
  const titleEl = document.querySelector('.title');
  let problemName = titleEl ? titleEl.textContent.trim() : '';
  const url = window.location.href;
  let problemId = '';
  const contestMatch    = url.match(/contest\/(\d+)\/problem\/([A-Z0-9]+)/i);
  const problemsetMatch = url.match(/problemset\/problem\/(\d+)\/([A-Z0-9]+)/i);
  if (contestMatch)         problemId = `${contestMatch[1]}${contestMatch[2]}`;
  else if (problemsetMatch) problemId = `${problemsetMatch[1]}${problemsetMatch[2]}`;
  const tagEls = document.querySelectorAll('.tag-box');
  const tags = Array.from(tagEls).map(el => el.textContent.trim()).filter(t => t && !t.includes('*'));
  let rating = '';
  const ratingSpan = document.querySelector('span[title]');
  if (ratingSpan && ratingSpan.title.includes('Difficulty'))
    rating = ratingSpan.textContent.trim().replace('*', '');
  return { problemId, problemName, tags, rating, url };
}

// ── THEMES ────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '#111118', border: '#2a2a3a', accent: '#e8ff47', label: '#e8ff47',
    timeIdle: '#e8e8f0', timeRunning: '#e8ff47', timePaused: '#6a6a80', timeOver: '#ff6b47',
    btnBg: '#1a1a28', btnBorder: '#2a2a3a', btnColor: '#a0a0b8',
    shadow: 'rgba(0,0,0,0.85)', toggleIcon: '☀️', toggleTitle: 'Switch to light theme',
  },
  light: {
    bg: '#ffffff', border: '#d0d0d8', accent: '#1a6eff', label: '#1a6eff',
    timeIdle: '#1a1a2e', timeRunning: '#1a6eff', timePaused: '#9090a0', timeOver: '#e03030',
    btnBg: '#f0f0f5', btnBorder: '#d0d0d8', btnColor: '#505060',
    shadow: 'rgba(0,0,0,0.18)', toggleIcon: '🌙', toggleTitle: 'Switch to dark theme',
  },
};
let currentTheme = 'dark';

function applyThemeSync(themeName) {
  if (!overlayEl) return;
  const t = THEMES[themeName];
  const o = overlayEl;
  o.style.setProperty('background',        t.bg,     'important');
  o.style.setProperty('background-color',  t.bg,     'important');
  o.style.setProperty('border-color',      t.border, 'important');
  o.style.setProperty('border-left-color', t.accent, 'important');
  o.style.setProperty('box-shadow', `0 4px 32px ${t.shadow}, 0 0 0 1px ${t.accent}18`, 'important');
  o.style.setProperty('color', t.timeIdle, 'important');
  const label = o.querySelector('#cft-label');
  if (label) {
    label.style.setProperty('color', t.label, 'important');
    label.style.setProperty('text-shadow', themeName === 'dark' ? '0 0 8px rgba(232,255,71,0.45)' : 'none', 'important');
  }
  const timeEl = o.querySelector('#cft-time');
  if (timeEl) renderOverlayTimeColors(timeEl, themeName);
  o.querySelectorAll('#cft-controls button').forEach(btn => {
    btn.style.setProperty('background',       t.btnBg,     'important');
    btn.style.setProperty('background-color', t.btnBg,     'important');
    btn.style.setProperty('border-color',     t.btnBorder, 'important');
    btn.style.setProperty('color',            t.btnColor,  'important');
  });
  const toggleBtn = o.querySelector('#cft-theme-btn');
  if (toggleBtn) { toggleBtn.textContent = t.toggleIcon; toggleBtn.title = t.toggleTitle; }
  currentTheme = themeName;
  chrome.storage.local.set({ overlayTheme: themeName });
}

function renderOverlayTimeColors(timeEl, themeName) {
  if (!timeEl) return;
  const t = THEMES[themeName || currentTheme];
  const cls = timeEl.className.split(' ').find(c => ['running','paused','over'].includes(c));
  let color, shadow = 'none';
  if      (cls === 'running') { color = t.timeRunning; shadow = themeName === 'dark' ? '0 0 16px rgba(232,255,71,0.5)' : 'none'; }
  else if (cls === 'paused')  { color = t.timePaused; }
  else if (cls === 'over')    { color = t.timeOver; shadow = themeName === 'dark' ? '0 0 16px rgba(255,107,71,0.55)' : 'none'; }
  else                        { color = t.timeIdle; }
  timeEl.style.setProperty('color',       color,  'important');
  timeEl.style.setProperty('text-shadow', shadow, 'important');
}

// ── OVERLAY STATE ─────────────────────────────────────────────────
let overlayEl         = null;
let overlayInterval   = null;
let overlayElapsed    = 0;
let overlayRunning    = false;
let overlayStartTs    = null;
let overlayTargetSecs = 1800;
let isDragging        = false;
let dragOffX = 0, dragOffY = 0;

// ── AUTO-MINIMIZE STATE ───────────────────────────────────────────
let minimizeTimer  = null;   // setTimeout handle
let isMinimized    = false;
const MINIMIZE_DELAY = 3000; // 30 seconds

function resetMinimizeTimer() {
  if (minimizeTimer) clearTimeout(minimizeTimer);
  if (isMinimized) expandOverlay();
  minimizeTimer = setTimeout(() => {
    if (overlayEl && !isDragging) minimizeOverlay();
  }, MINIMIZE_DELAY);
}

function minimizeOverlay() {
  if (!overlayEl || isMinimized) return;
  isMinimized = true;
  overlayEl.classList.add('cft-minimized');
}

function expandOverlay() {
  if (!overlayEl || !isMinimized) return;
  isMinimized = false;
  overlayEl.classList.remove('cft-minimized');
}

// ── BUILD OVERLAY ─────────────────────────────────────────────────
function buildOverlay() {
  if (overlayEl) return;

  const style = document.createElement('style');
  style.id = 'cf-timer-overlay-style';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');

    #cf-timer-overlay {
      all: initial;
      position: fixed !important;
      top: 120px !important;
      right: 0px !important;
      z-index: 2147483647 !important;
      border: 1px solid !important;
      border-right: none !important;
      border-left-width: 4px !important;
      border-radius: 6px 0 0 6px !important;
      padding: 10px 14px 10px 12px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 6px !important;
      font-family: 'Space Mono', monospace !important;
      min-width: 130px !important;
      user-select: none !important;
      /* Slide transition */
      transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s !important;
      transform: translateX(0) !important;
    }

    /* Minimized: slide almost all the way off — only the left border peeks out */
    #cf-timer-overlay.cft-minimized {
      transform: translateX(calc(100% - 4px)) !important;
      opacity: 0.85 !important;
      cursor: pointer !important;
    }

    /* Hidden (X button) */
    #cf-timer-overlay.cft-hidden {
      opacity: 0 !important;
      pointer-events: none !important;
      transform: translateX(100%) !important;
    }

    @keyframes cft-in {
      from { opacity:0; transform:translateX(100%); }
      to   { opacity:1; transform:translateX(0); }
    }

    #cf-timer-overlay {
      animation: cft-in 0.35s cubic-bezier(0.34,1.56,0.64,1) !important;
    }

    #cft-handle {
      display: flex !important;
      align-items: center !important;
      gap: 5px !important;
      cursor: grab !important;
      width: 100% !important;
      background: transparent !important;
    }
    #cft-handle:active { cursor: grabbing !important; }

    #cft-icon  { font-size: 11px !important; }

    #cft-label {
      font-family: 'Space Mono', monospace !important;
      font-size: 8px !important;
      letter-spacing: 2.5px !important;
    }

    #cft-time {
      font-family: 'Space Mono', monospace !important;
      font-size: 30px !important;
      font-weight: 700 !important;
      letter-spacing: 1px !important;
      line-height: 1 !important;
      text-align: center !important;
      padding: 2px 0 !important;
      background: transparent !important;
    }

    #cft-time.over { animation: cft-blink 1s ease-in-out infinite !important; }

    @keyframes cft-blink {
      0%,100% { opacity:1; }
      50%      { opacity:0.4; }
    }

    #cft-controls {
      display: flex !important;
      gap: 5px !important;
      align-items: center !important;
    }

    #cft-controls button {
      all: initial !important;
      font-size: 12px !important;
      cursor: pointer !important;
      width: 24px !important;
      height: 24px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 4px !important;
      border: 1px solid !important;
      transition: opacity 0.15s !important;
      font-family: 'Space Mono', monospace !important;
      box-sizing: border-box !important;
    }
    #cft-controls button:hover { opacity: 0.7 !important; }

    /* Hide content when minimized so only the border sliver is visible */
    #cf-timer-overlay.cft-minimized #cft-handle,
    #cf-timer-overlay.cft-minimized #cft-time,
    #cf-timer-overlay.cft-minimized #cft-controls {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  if (!document.getElementById('cf-timer-overlay-style'))
    document.head.appendChild(style);

  const div = document.createElement('div');
  div.id = 'cf-timer-overlay';
  div.innerHTML = `
    <div id="cft-handle">
      <span id="cft-icon">⚡</span>
      <span id="cft-label">CF TIMER</span>
    </div>
    <div id="cft-time">00:00</div>
    <div id="cft-controls">
      <button id="cft-pause-btn" title="Pause / Resume">⏸</button>
      <button id="cft-theme-btn" title="Switch theme">☀️</button>
      <button id="cft-hide-btn"  title="Hide overlay">✕</button>
    </div>
  `;

  document.body.appendChild(div);
  overlayEl = div;

  // Apply dark theme immediately, then load saved
  applyThemeSync('dark');
  chrome.storage.local.get('overlayTheme', data => {
    const saved = data.overlayTheme || 'dark';
    if (saved !== currentTheme) applyThemeSync(saved);
  });

  // ── Hover to expand when minimized ──
  div.addEventListener('mouseenter', () => {
    resetMinimizeTimer();
  });
  div.addEventListener('mousemove', () => {
    resetMinimizeTimer();
  });

  // ── Drag (only when not minimized) ──
  const handle = div.querySelector('#cft-handle');
  handle.addEventListener('mousedown', e => {
    if (isMinimized) return;
    isDragging = true;
    const rect = div.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    div.style.transition = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    // Lock to right edge (no horizontal drag — overlay is anchored right)
    let y = Math.max(0, Math.min(window.innerHeight - div.offsetHeight, e.clientY - dragOffY));
    div.style.top = y + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) { isDragging = false; div.style.transition = ''; }
  });

  // ── Pause/Resume ──
  div.querySelector('#cft-pause-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OVERLAY_PAUSE_TOGGLE' });
    resetMinimizeTimer();
  });

  // ── Theme toggle ──
  div.querySelector('#cft-theme-btn').addEventListener('click', () => {
    applyThemeSync(currentTheme === 'dark' ? 'light' : 'dark');
    resetMinimizeTimer();
  });

  // ── Hide ──
  div.querySelector('#cft-hide-btn').addEventListener('click', () => {
    if (minimizeTimer) clearTimeout(minimizeTimer);
    hideOverlay();
  });

  // Start the 30-sec minimize countdown
  resetMinimizeTimer();
}

function showOverlay() {
  if (!overlayEl) buildOverlay();
  overlayEl.classList.remove('cft-hidden');
  resetMinimizeTimer();
}

function hideOverlay() {
  if (overlayEl) overlayEl.classList.add('cft-hidden');
}

function destroyOverlay() {
  if (minimizeTimer) clearTimeout(minimizeTimer);
  stopOverlayTick();
  if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  const s = document.getElementById('cf-timer-overlay-style');
  if (s) s.remove();
  overlayRunning = false;
  overlayElapsed = 0;
  overlayStartTs = null;
  isMinimized    = false;
}

function stopOverlayTick() {
  if (overlayInterval) { clearInterval(overlayInterval); overlayInterval = null; }
}

function startOverlayTick() {
  stopOverlayTick();
  overlayInterval = setInterval(() => {
    if (!overlayRunning) return;
    overlayElapsed = Math.floor((Date.now() - overlayStartTs) / 1000);
    renderOverlayTime();
  }, 500);
}

function renderOverlayTime() {
  if (!overlayEl) return;
  const mm = String(Math.floor(overlayElapsed / 60)).padStart(2, '0');
  const ss = String(overlayElapsed % 60).padStart(2, '0');
  const timeEl = overlayEl.querySelector('#cft-time');
  if (!timeEl) return;
  timeEl.textContent = `${mm}:${ss}`;
  timeEl.className = '';
  if      (overlayElapsed > overlayTargetSecs) timeEl.classList.add('over');
  else if (overlayRunning)                     timeEl.classList.add('running');
  else                                         timeEl.classList.add('paused');
  renderOverlayTimeColors(timeEl, currentTheme);
  const pauseBtn = overlayEl.querySelector('#cft-pause-btn');
  if (pauseBtn) pauseBtn.textContent = overlayRunning ? '⏸' : '▶';
}

// ── MESSAGE LISTENER ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PROBLEM_INFO') { sendResponse(getProblemInfo()); return; }
  if (message.type === 'TIMER_STARTED') {
    overlayTargetSecs = message.targetSecs || 1800;
    overlayElapsed    = message.elapsed || 0;
    overlayRunning    = true;
    overlayStartTs    = Date.now() - overlayElapsed * 1000;
    showOverlay(); startOverlayTick(); renderOverlayTime(); return;
  }
  if (message.type === 'TIMER_PAUSED') {
    overlayRunning    = false;
    overlayElapsed    = message.elapsed;
    overlayTargetSecs = message.targetSecs || overlayTargetSecs;
    stopOverlayTick(); renderOverlayTime(); return;
  }
  if (message.type === 'TIMER_RESUMED') {
    overlayTargetSecs = message.targetSecs || overlayTargetSecs;
    overlayElapsed    = message.elapsed;
    overlayRunning    = true;
    overlayStartTs    = Date.now() - overlayElapsed * 1000;
    showOverlay(); startOverlayTick(); renderOverlayTime(); return;
  }
  if (message.type === 'TIMER_RESET') { destroyOverlay(); return; }
});

// ── AUTO RESTORE ON PAGE LOAD ─────────────────────────────────────
window.addEventListener('load', () => {
  const info = getProblemInfo();
  if (info.problemId) chrome.storage.local.set({ currentProblem: info });
  chrome.storage.local.get(['timerState', 'overlayTheme'], data => {
    const s = data.timerState;
    if (s && s.running && s.startTs) {
      const elapsed     = Math.floor((Date.now() - s.startTs) / 1000);
      overlayTargetSecs = (s.targetMin || 30) * 60;
      overlayElapsed    = elapsed;
      overlayRunning    = true;
      overlayStartTs    = Date.now() - elapsed * 1000;
      showOverlay();
      startOverlayTick();
      renderOverlayTime();
    }
  });
});
