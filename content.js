// Overclock — Content Script
// Multi-platform problem detection + overlay with auto-minimize + theme toggle

// ── PLATFORM DETECTION ────────────────────────────────────────────
function detectPlatform(url) {
  if (url.includes('codeforces.com'))  return 'codeforces';
  if (url.includes('atcoder.jp'))      return 'atcoder';
  if (url.includes('cses.fi'))         return 'cses';
  if (url.includes('codechef.com'))    return 'codechef';
  if (url.includes('leetcode.com'))    return 'leetcode';
  if (url.includes('spoj.com'))        return 'spoj';
  if (url.includes('kattis.com'))      return 'kattis';
  return 'unknown';
}

const PLATFORM_META = {
  codeforces: { label: 'Codeforces', color: '#1a8cff', icon: 'CF' },
  atcoder:    { label: 'AtCoder',    color: '#808080', icon: 'AC' },
  cses:       { label: 'CSES',       color: '#3a86ff', icon: 'CS' },
  codechef:   { label: 'CodeChef',   color: '#5b4638', icon: 'CC' },
  leetcode:   { label: 'LeetCode',   color: '#ffa116', icon: 'LC' },
  spoj:       { label: 'SPOJ',       color: '#27ae60', icon: 'SP' },
  kattis:     { label: 'Kattis',     color: '#ef476f', icon: 'KT' },
  unknown:    { label: 'Unknown',    color: '#888',    icon: '?'  },
};

function getProblemInfo() {
  const url      = window.location.href;
  const platform = detectPlatform(url);
  let problemId   = '';
  let problemName = '';
  let tags        = [];
  let rating      = '';
  let difficulty  = '';

  // ── Codeforces ──────────────────────────────────────────────────
  if (platform === 'codeforces') {
    const contestMatch    = url.match(/contest\/(\d+)\/problem\/([A-Z0-9]+)/i);
    const problemsetMatch = url.match(/problemset\/problem\/(\d+)\/([A-Z0-9]+)/i);
    if (contestMatch)         problemId = `${contestMatch[1]}${contestMatch[2]}`;
    else if (problemsetMatch) problemId = `${problemsetMatch[1]}${problemsetMatch[2]}`;

    const titleEl = document.querySelector('.title');
    if (titleEl) problemName = titleEl.textContent.trim();

    const tagEls = document.querySelectorAll('.tag-box');
    tags = Array.from(tagEls).map(el => el.textContent.trim()).filter(t => t && !t.includes('*'));

    const ratingSpan = document.querySelector('span[title]');
    if (ratingSpan && ratingSpan.title.includes('Difficulty'))
      rating = ratingSpan.textContent.trim().replace('*', '');
  }

  // ── AtCoder ─────────────────────────────────────────────────────
  else if (platform === 'atcoder') {
    const m = url.match(/contests\/([^/]+)\/tasks\/([^/?#]+)/);
    if (m) problemId = m[2];

    const titleEl = document.querySelector('span.h2') ||
                    document.querySelector('#main-container h2');
    if (titleEl) problemName = titleEl.textContent.trim();

    // AtCoder difficulty from external badge (best-effort)
    const diffEl = document.querySelector('.difficulty-circle');
    if (diffEl) difficulty = diffEl.textContent.trim();
  }

  // ── CSES ────────────────────────────────────────────────────────
  else if (platform === 'cses') {
    const m = url.match(/task\/(\d+)/);
    if (m) problemId = m[1];

    const titleEl = document.querySelector('h1') ||
                    document.querySelector('.title-block h1');
    if (titleEl) problemName = titleEl.textContent.trim();
  }

  // ── CodeChef ────────────────────────────────────────────────────
  else if (platform === 'codechef') {
    const m = url.match(/problems\/([A-Z0-9_]+)/i);
    if (m) problemId = m[1];

    const titleEl = document.querySelector('h1') ||
                    document.querySelector('[class*="problem-title"]');
    if (titleEl) problemName = titleEl.textContent.trim();

    const diffEl = document.querySelector('[class*="difficulty"]');
    if (diffEl) difficulty = diffEl.textContent.trim();
  }

  // ── LeetCode ────────────────────────────────────────────────────
  else if (platform === 'leetcode') {
    const m = url.match(/problems\/([^/]+)/);
    if (m) problemId = m[1];

    // LeetCode uses React, try multiple selectors
    const titleEl = document.querySelector('[data-cy="question-title"]') ||
                    document.querySelector('div[class*="title"] a') ||
                    document.querySelector('h4[class*="title"]') ||
                    document.querySelector('.mr-2.text-label-1');
    if (titleEl) problemName = titleEl.textContent.trim();

    const diffEl = document.querySelector('[diff]') ||
                   document.querySelector('div[class*="Difficulty"]') ||
                   document.querySelector('span[class*="difficulty"]');
    if (diffEl) difficulty = diffEl.textContent.trim();

    const tagEls = document.querySelectorAll('a[class*="topic-tag"]');
    tags = Array.from(tagEls).map(el => el.textContent.trim());
  }

  // ── SPOJ ────────────────────────────────────────────────────────
  else if (platform === 'spoj') {
    const m = url.match(/problems\/([^/]+)/);
    if (m) problemId = m[1];

    const titleEl = document.querySelector('#problem-name') ||
                    document.querySelector('h1.title');
    if (titleEl) problemName = titleEl.textContent.trim();
  }

  // ── Kattis ──────────────────────────────────────────────────────
  else if (platform === 'kattis') {
    const m = url.match(/problems\/([^/]+)/);
    if (m) problemId = m[1];

    const titleEl = document.querySelector('h1[class*="book"]') ||
                    document.querySelector('h1');
    if (titleEl) problemName = titleEl.textContent.trim();

    const diffEl = document.querySelector('.difficulty_number');
    if (diffEl) difficulty = diffEl.textContent.trim();
  }

  // Fallback: use page title
  if (!problemName) {
    problemName = document.title.split(/[-|–]/)[0].trim();
  }

  return { problemId, problemName, tags, rating, difficulty, platform, url };
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
  o.style.setProperty('border-left-color', overlayAccent || t.accent, 'important');
  o.style.setProperty('box-shadow', `0 4px 32px ${t.shadow}`, 'important');
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
  else if (cls === 'over')    { color = t.timeOver;   shadow = themeName === 'dark' ? '0 0 16px rgba(255,107,71,0.55)' : 'none'; }
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
let overlayAccent     = '#e8ff47';
let isDragging        = false;
let dragOffY          = 0;

// ── AUTO-MINIMIZE ─────────────────────────────────────────────────
let minimizeTimer = null;
let isMinimized   = false;
const MINIMIZE_DELAY = 30000;

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
function buildOverlay(platform) {
  if (overlayEl) return;

  const meta   = PLATFORM_META[platform] || PLATFORM_META.unknown;
  overlayAccent = meta.color;

  const style = document.createElement('style');
  style.id = 'cft-style';
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
      transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s !important;
      transform: translateX(0) !important;
      animation: cft-in 0.35s cubic-bezier(0.34,1.2,0.64,1) !important;
    }

    @keyframes cft-in {
      from { opacity:0; transform:translateX(100%); }
      to   { opacity:1; transform:translateX(0); }
    }

    #cf-timer-overlay.cft-minimized {
      transform: translateX(calc(100% - 4px)) !important;
      opacity: 0.9 !important;
      cursor: pointer !important;
    }

    #cf-timer-overlay.cft-hidden {
      opacity: 0 !important;
      pointer-events: none !important;
      transform: translateX(110%) !important;
    }

    #cf-timer-overlay.cft-minimized #cft-handle,
    #cf-timer-overlay.cft-minimized #cft-time,
    #cf-timer-overlay.cft-minimized #cft-platform,
    #cf-timer-overlay.cft-minimized #cft-controls {
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity 0.2s !important;
    }

    #cft-handle {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      cursor: grab !important;
      width: 100% !important;
      background: transparent !important;
    }
    #cft-handle:active { cursor: grabbing !important; }

    #cft-icon  { font-size: 11px !important; }

    #cft-label {
      font-family: 'Space Mono', monospace !important;
      font-size: 9px !important;
      font-weight: 700 !important;
      letter-spacing: 2px !important;
    }

    #cft-platform {
      font-family: 'Space Mono', monospace !important;
      font-size: 8px !important;
      letter-spacing: 1px !important;
      padding: 1px 6px !important;
      border-radius: 3px !important;
      align-self: flex-start !important;
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
  `;

  if (!document.getElementById('cft-style'))
    document.head.appendChild(style);

  const div = document.createElement('div');
  div.id = 'cf-timer-overlay';
  div.innerHTML = `
    <div id="cft-handle">
      <span id="cft-icon">⚡</span>
      <span id="cft-label">OVERCLOCK</span>
    </div>
    <div id="cft-platform">${meta.icon} ${meta.label}</div>
    <div id="cft-time">00:00</div>
    <div id="cft-controls">
      <button id="cft-pause-btn" title="Pause / Resume">⏸</button>
      <button id="cft-theme-btn" title="Switch theme">☀️</button>
      <button id="cft-hide-btn"  title="Hide">✕</button>
    </div>
  `;

  document.body.appendChild(div);
  overlayEl = div;

  // Style platform badge
  const badge = div.querySelector('#cft-platform');
  badge.style.setProperty('color',            meta.color,            'important');
  badge.style.setProperty('background-color', meta.color + '18',     'important');
  badge.style.setProperty('border', `1px solid ${meta.color}44`,     'important');

  // Apply theme immediately
  applyThemeSync('dark');
  chrome.storage.local.get('overlayTheme', data => {
    const saved = data.overlayTheme || 'dark';
    if (saved !== currentTheme) applyThemeSync(saved);
  });

  // ── Hover to expand ──
  div.addEventListener('mouseenter', resetMinimizeTimer);
  div.addEventListener('mousemove',  resetMinimizeTimer);

  // ── Vertical drag only ──
  const handle = div.querySelector('#cft-handle');
  handle.addEventListener('mousedown', e => {
    if (isMinimized) return;
    isDragging = true;
    dragOffY   = e.clientY - div.getBoundingClientRect().top;
    div.style.setProperty('transition', 'none', 'important');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const y = Math.max(0, Math.min(window.innerHeight - div.offsetHeight, e.clientY - dragOffY));
    div.style.setProperty('top', y + 'px', 'important');
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      div.style.setProperty('transition', 'transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s', 'important');
    }
  });

  // ── Buttons ──
  div.querySelector('#cft-pause-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OVERLAY_PAUSE_TOGGLE' });
    resetMinimizeTimer();
  });
  div.querySelector('#cft-theme-btn').addEventListener('click', () => {
    applyThemeSync(currentTheme === 'dark' ? 'light' : 'dark');
    resetMinimizeTimer();
  });
  div.querySelector('#cft-hide-btn').addEventListener('click', () => {
    if (minimizeTimer) clearTimeout(minimizeTimer);
    hideOverlay();
  });

  resetMinimizeTimer();
}

function showOverlay(platform) {
  if (!overlayEl) buildOverlay(platform || detectPlatform(window.location.href));
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
  const s = document.getElementById('cft-style');
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
    showOverlay(message.platform); startOverlayTick(); renderOverlayTime(); return;
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
    showOverlay(message.platform); startOverlayTick(); renderOverlayTime(); return;
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
      showOverlay(detectPlatform(window.location.href));
      startOverlayTick();
      renderOverlayTime();
    }
  });
});
