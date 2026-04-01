// CF Timer Popup JS

const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52

// State
let timerState = {
  running: false,
  elapsed: 0,       // seconds
  targetMin: 30,    // minutes
  intervalId: null,
  startTs: null,    // timestamp when started/resumed
  baseElapsed: 0,   // elapsed before current run
};

let currentProblem = { problemId: '', problemName: 'Unknown Problem', tags: [], rating: '' };

// DOM refs
const timerTime = document.getElementById('timer-time');
const timerLabel = document.getElementById('timer-label');
const ringProgress = document.getElementById('ring-progress');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');
const targetVal = document.getElementById('target-val');
const targetInc = document.getElementById('target-inc');
const targetDec = document.getElementById('target-dec');
const notesInput = document.getElementById('notes-input');
const statusSelect = document.getElementById('status-select');
const btnSave = document.getElementById('btn-save');
const problemBadge = document.getElementById('problem-badge');
const problemName = document.getElementById('problem-name');
const problemMeta = document.getElementById('problem-meta');

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadProblem();
  await loadTimerState();
  renderTabs();
  initLogControls();
  renderLog();
  renderStats();
  updateTimerDisplay();
});

// ── TAB SWITCHING ──
function renderTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'log') renderLog();
      if (tab.dataset.tab === 'stats') renderStats();
    });
  });
}

// ── PROBLEM DETECTION ──
async function loadProblem() {
  // Try to get from storage (set by content script)
  const data = await chrome.storage.local.get('currentProblem');
  if (data.currentProblem && data.currentProblem.problemId) {
    currentProblem = data.currentProblem;
  }

  // Also try to query active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && SUPPORTED_HOSTS.some(h => tab.url.includes(h))) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PROBLEM_INFO' });
      if (response && response.problemId) {
        currentProblem = response;
        chrome.storage.local.set({ currentProblem });
      }
    }
  } catch (e) {
    // Content script not injected (non-problem page), use stored
  }

  updateProblemCard();
}

const PLATFORM_COLORS = {
  codeforces: '#1a8cff', atcoder: '#808080', cses: '#3a86ff',
  codechef: '#5b4638', leetcode: '#ffa116', spoj: '#27ae60',
  kattis: '#ef476f', unknown: '#888',
};
const PLATFORM_LABELS = {
  codeforces: 'Codeforces', atcoder: 'AtCoder', cses: 'CSES',
  codechef: 'CodeChef', leetcode: 'LeetCode', spoj: 'SPOJ',
  kattis: 'Kattis', unknown: 'Unknown',
};

function updateProblemCard() {
  if (currentProblem.problemId || currentProblem.problemName) {
    const platform = currentProblem.platform || 'unknown';
    const color    = PLATFORM_COLORS[platform] || '#888';
    const label    = PLATFORM_LABELS[platform] || platform;

    problemBadge.textContent = label.toUpperCase() + (currentProblem.problemId ? ` · ${currentProblem.problemId}` : '');
    problemBadge.style.color = color;
    problemName.textContent  = currentProblem.problemName || 'Untitled Problem';
    problemMeta.innerHTML    = '';

    if (currentProblem.rating) {
      const r = document.createElement('span');
      r.textContent = `★ ${currentProblem.rating}`;
      r.style.color = getRatingColor(parseInt(currentProblem.rating));
      problemMeta.appendChild(r);
    }

    if (currentProblem.difficulty) {
      const d = document.createElement('span');
      d.textContent = `⬡ ${currentProblem.difficulty}`;
      d.style.color = color;
      problemMeta.appendChild(d);
    }

    if (currentProblem.tags && currentProblem.tags.length > 0) {
      currentProblem.tags.slice(0, 3).forEach(tag => {
        const el = document.createElement('span');
        el.className = 'tag';
        el.textContent = tag;
        problemMeta.appendChild(el);
      });
    }
  } else {
    problemBadge.textContent = 'NO PROBLEM DETECTED';
    problemBadge.style.color = '';
    problemName.textContent  = 'Open a problem page to auto-detect';
    problemMeta.innerHTML    = '';
  }
}

function getRatingColor(r) {
  if (r >= 2400) return '#ff0000';
  if (r >= 2100) return '#ff7700';
  if (r >= 1900) return '#aa00aa';
  if (r >= 1600) return '#0000ff';
  if (r >= 1400) return '#03a89e';
  if (r >= 1200) return '#008000';
  return '#808080';
}

// ── TIMER STATE PERSISTENCE ──
async function loadTimerState() {
  const data = await chrome.storage.local.get('timerState');
  if (data.timerState) {
    const s = data.timerState;
    timerState.targetMin = s.targetMin || 30;
    timerState.baseElapsed = s.baseElapsed || 0;
    timerState.elapsed = s.elapsed || 0;

    // If it was running when popup closed, compute elapsed from startTs directly
    if (s.running && s.startTs) {
      const elapsed = Math.floor((Date.now() - s.startTs) / 1000);
      timerState.baseElapsed = elapsed;
      timerState.elapsed = elapsed;
      timerState.startTs = s.startTs; // preserve original startTs
      startTimer();
    }
  }
  targetVal.textContent = `${timerState.targetMin} min`;
  updateTimerDisplay();
}

function saveTimerState() {
  chrome.storage.local.set({
    timerState: {
      running: timerState.running,
      elapsed: timerState.elapsed,
      targetMin: timerState.targetMin,
      baseElapsed: timerState.baseElapsed,
      startTs: timerState.running ? timerState.startTs : null,
    }
  });
}

const SUPPORTED_HOSTS = ['codeforces.com','atcoder.jp','cses.fi','codechef.com','leetcode.com','spoj.com','kattis.com'];

async function broadcastToTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && SUPPORTED_HOSTS.some(h => tab.url.includes(h))) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  } catch (e) {}
}

// ── TIMER CONTROLS ──
btnStart.addEventListener('click', () => {
  if (!timerState.running) startTimer();
});

btnPause.addEventListener('click', () => {
  if (timerState.running) pauseTimer();
});

btnReset.addEventListener('click', resetTimer);

targetInc.addEventListener('click', () => {
  timerState.targetMin = Math.min(timerState.targetMin + 5, 180);
  targetVal.textContent = `${timerState.targetMin} min`;
  updateRing();
  saveTimerState();
});

targetDec.addEventListener('click', () => {
  timerState.targetMin = Math.max(timerState.targetMin - 5, 5);
  targetVal.textContent = `${timerState.targetMin} min`;
  updateRing();
  saveTimerState();
});

function startTimer() {
  timerState.running = true;
  // Only recompute startTs if we don't already have one (i.e. fresh start or resume after pause)
  if (!timerState.startTs) {
    timerState.startTs = Date.now() - (timerState.baseElapsed * 1000);
  }

  timerState.intervalId = setInterval(() => {
    timerState.elapsed = Math.floor((Date.now() - timerState.startTs) / 1000);
    timerState.baseElapsed = timerState.elapsed;
    updateTimerDisplay();

    // Warning at 5 min remaining
    const target = timerState.targetMin * 60;
    if (timerState.elapsed === target - 300) {
      chrome.runtime.sendMessage({ type: 'TIMER_WARNING' });
    }
    // At target
    if (timerState.elapsed === target) {
      chrome.runtime.sendMessage({
        type: 'TIMER_FINISHED',
        problem: currentProblem.problemName || currentProblem.problemId
      });
    }
  }, 500);

  btnStart.disabled = true;
  btnPause.disabled = false;
  timerLabel.textContent = 'ELAPSED';
  saveTimerState();
  broadcastToTab({
    type: timerState.baseElapsed > 0 ? 'TIMER_RESUMED' : 'TIMER_STARTED',
    elapsed: timerState.elapsed,
    targetSecs: timerState.targetMin * 60,
    platform: currentProblem.platform || 'unknown',
  });
}

function pauseTimer() {
  timerState.running = false;
  timerState.baseElapsed = timerState.elapsed;
  timerState.startTs = null;
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;

  btnStart.disabled = false;
  btnPause.disabled = true;
  btnStart.querySelector('.btn-icon').textContent = '▶';
  saveTimerState();
  broadcastToTab({
    type: 'TIMER_PAUSED',
    elapsed: timerState.elapsed,
    targetSecs: timerState.targetMin * 60,
  });
}

function resetTimer() {
  clearInterval(timerState.intervalId);
  timerState.running = false;
  timerState.elapsed = 0;
  timerState.baseElapsed = 0;
  timerState.intervalId = null;
  timerState.startTs = null;

  btnStart.disabled = false;
  btnPause.disabled = true;
  timerTime.classList.remove('running', 'over');
  ringProgress.classList.remove('warning', 'over');
  updateTimerDisplay();
  saveTimerState();
  broadcastToTab({ type: 'TIMER_RESET' });
}

function updateTimerDisplay() {
  const s = timerState.elapsed;
  const target = timerState.targetMin * 60;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  timerTime.textContent = `${mm}:${ss}`;

  if (timerState.running) {
    timerTime.classList.add('running');
    timerTime.classList.remove('over');
  }

  if (s > target) {
    timerTime.classList.remove('running');
    timerTime.classList.add('over');
    ringProgress.classList.add('over');
    ringProgress.classList.remove('warning');
    timerLabel.textContent = 'OVER TIME';
  } else if (s > target * 0.8) {
    ringProgress.classList.add('warning');
    ringProgress.classList.remove('over');
  } else {
    ringProgress.classList.remove('warning', 'over');
  }

  updateRing();
}

function updateRing() {
  const target = timerState.targetMin * 60;
  const ratio = Math.min(timerState.elapsed / target, 1);
  const offset = CIRCUMFERENCE * (1 - ratio);
  ringProgress.style.strokeDashoffset = offset;
}

// ── SAVE ATTEMPT ──
btnSave.addEventListener('click', async () => {
  const attempt = {
    id: Date.now(),
    problemId: currentProblem.problemId || 'CUSTOM',
    problemName: currentProblem.problemName || 'Unknown Problem',
    url: currentProblem.url || '',
    platform: currentProblem.platform || 'unknown',
    elapsed: timerState.elapsed,
    targetMin: timerState.targetMin,
    status: statusSelect.value,
    notes: notesInput.value.trim(),
    tags: currentProblem.tags || [],
    rating: currentProblem.rating || '',
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    timestamp: Date.now(),
  };

  const data = await chrome.storage.local.get('attempts');
  const attempts = data.attempts || [];
  attempts.unshift(attempt);
  await chrome.storage.local.set({ attempts });

  showToast('ATTEMPT SAVED ✓');
  notesInput.value = '';
  resetTimer();
  renderLog();
  renderStats();
});

// ── RENDER LOG ──
let activeFilter = 'all';
let searchQuery  = '';

// Wire up search + filters once DOM ready
function initLogControls() {
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderLog();
  });
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderLog();
    });
  });
}

async function renderLog() {
  const data = await chrome.storage.local.get('attempts');
  let attempts = data.attempts || [];
  const list  = document.getElementById('log-list');
  const count = document.getElementById('log-count');

  // ── Filter by status/starred ──
  if (activeFilter === 'starred') attempts = attempts.filter(a => a.starred);
  else if (activeFilter !== 'all') attempts = attempts.filter(a => a.status === activeFilter);

  // ── Search: name, problemId, tags ──
  if (searchQuery) {
    attempts = attempts.filter(a => {
      const haystack = [
        a.problemName || '',
        a.problemId   || '',
        ...(a.tags    || []),
      ].join(' ').toLowerCase();
      return haystack.includes(searchQuery);
    });
  }

  count.textContent = `${attempts.length} attempt${attempts.length !== 1 ? 's' : ''}`;

  if (attempts.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${searchQuery || activeFilter !== 'all' ? '🔍' : '📋'}</div>
        <div class="empty-text">${searchQuery || activeFilter !== 'all' ? 'No results found.' : 'No attempts logged yet.<br>Start solving!'}</div>
      </div>`;
    return;
  }

  list.innerHTML = attempts.map(a => {
    const url = a.url || buildCfUrl(a.problemId, a.platform, null);
    return `
    <div class="log-item ${a.status}" data-id="${a.id}">
      <div class="log-item-top">
        <button class="log-star-btn ${a.starred ? 'starred' : ''}" data-id="${a.id}" title="${a.starred ? 'Unstar' : 'Star'}">${a.starred ? '⭐' : '☆'}</button>
        <a class="log-problem log-link" data-url="${escHtml(url)}" title="Open on Codeforces">${escHtml(a.problemName)}</a>
        <div class="log-right">
          <div class="log-time">${formatTime(a.elapsed)}</div>
          <button class="log-delete-btn" data-id="${a.id}" title="Delete attempt">🗑</button>
        </div>
      </div>
      <div class="log-meta">
        <span class="log-status ${a.status}">${statusLabel(a.status)}</span>
        ${a.platform && a.platform !== 'unknown' ? `<span class="log-platform" style="color:${PLATFORM_COLORS[a.platform]||'#888'}">${PLATFORM_LABELS[a.platform]||a.platform}</span>` : ''}
        <span>${a.date}</span>
        ${a.targetMin ? `<span>/ ${a.targetMin}min target</span>` : ''}
        ${a.rating ? `<span>★${a.rating}</span>` : ''}
      </div>
      ${a.tags && a.tags.length ? `<div class="log-tags">${a.tags.slice(0,4).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
      ${a.notes ? `<div class="log-notes">${escHtml(a.notes)}</div>` : ''}
    </div>
  `}).join('');

  // ── Star toggle ──
  list.querySelectorAll('.log-star-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const d  = await chrome.storage.local.get('attempts');
      const updated = (d.attempts || []).map(a =>
        a.id === id ? { ...a, starred: !a.starred } : a
      );
      await chrome.storage.local.set({ attempts: updated });
      renderLog();
    });
  });

  // ── Open link ──
  list.querySelectorAll('.log-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const url = link.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  });

  // ── Delete ──
  list.querySelectorAll('.log-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const d  = await chrome.storage.local.get('attempts');
      const updated = (d.attempts || []).filter(a => a.id !== id);
      await chrome.storage.local.set({ attempts: updated });
      renderLog();
      renderStats();
    });
  });
}

// ── RENDER STATS ──
async function renderStats() {
  const data = await chrome.storage.local.get('attempts');
  const attempts = data.attempts || [];

  const total = attempts.length;
  const solved = attempts.filter(a => a.status === 'solved').length;
  const solvedTimes = attempts.filter(a => a.status === 'solved').map(a => a.elapsed);
  const avgTime = solvedTimes.length > 0
    ? Math.floor(solvedTimes.reduce((a, b) => a + b, 0) / solvedTimes.length)
    : null;

  // Streak: consecutive days with at least one solve
  let streak = 0;
  const dates = [...new Set(attempts.map(a => new Date(a.timestamp).toDateString()))];
  const today = new Date().toDateString();
  const sorted = dates.sort((a, b) => new Date(b) - new Date(a));
  for (let i = 0; i < sorted.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    if (sorted[i] === expected.toDateString()) streak++;
    else break;
  }

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-solved').textContent = solved;
  document.getElementById('stat-avg').textContent = avgTime ? formatTime(avgTime) : '—';
  document.getElementById('stat-streak').textContent = streak;

  renderBarChart(attempts);
  renderSparkline(attempts);
}

function renderBarChart(attempts) {
  const chart = document.getElementById('bar-chart');
  if (attempts.length === 0) {
    chart.innerHTML = '<div class="chart-empty">No data yet</div>';
    return;
  }

  // Bucket by time ranges
  const buckets = [
    { label: '<10m', min: 0, max: 600 },
    { label: '10-20', min: 600, max: 1200 },
    { label: '20-30', min: 1200, max: 1800 },
    { label: '30-45', min: 1800, max: 2700 },
    { label: '45-60', min: 2700, max: 3600 },
    { label: '>60m', min: 3600, max: Infinity },
  ];

  const counts = buckets.map(b => ({
    ...b,
    count: attempts.filter(a => a.elapsed >= b.min && a.elapsed < b.max).length
  }));

  const max = Math.max(...counts.map(c => c.count), 1);

  chart.innerHTML = counts.map(c => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;">
      <div class="bar" style="width:100%;height:${Math.max((c.count / max) * 52, c.count > 0 ? 4 : 0)}px;background:${c.count > 0 ? 'var(--accent)' : 'var(--bg3)'};"
        title="${c.count} problem${c.count !== 1 ? 's' : ''}"></div>
      <div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim);white-space:nowrap;">${c.label}</div>
    </div>
  `).join('');
}

function renderSparkline(attempts) {
  const wrap = document.getElementById('sparkline-wrap');
  const recent = attempts.slice(0, 10).reverse();

  if (recent.length < 2) {
    wrap.innerHTML = '<div class="chart-empty">Solve more problems to see trends</div>';
    return;
  }

  const times = recent.map(a => a.elapsed);
  const max = Math.max(...times);
  const min = Math.min(...times);
  const range = max - min || 1;

  const W = 300, H = 46, PAD = 4;
  const pts = times.map((t, i) => {
    const x = PAD + (i / (times.length - 1)) * (W - PAD * 2);
    const y = PAD + ((max - t) / range) * (H - PAD * 2);
    return [x, y];
  });

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${path} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="sparkline-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sg)"/>
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="var(--accent)" opacity="0.8"/>`).join('')}
    </svg>
  `;
}

// ── CLEAR LOG ──
document.getElementById('btn-clear-log').addEventListener('click', async () => {
  if (confirm('Clear all saved attempts?')) {
    await chrome.storage.local.remove('attempts');
    renderLog();
    renderStats();
    showToast('LOG CLEARED');
  }
});

// ── HELPERS ──
function buildCfUrl(problemId, platform, url) {
  if (url) return url;
  if (!problemId || problemId === 'CUSTOM') return 'https://codeforces.com/problemset';
  if (platform === 'cses')     return `https://cses.fi/problemset/task/${problemId}`;
  if (platform === 'leetcode') return `https://leetcode.com/problems/${problemId}`;
  if (platform === 'codechef') return `https://www.codechef.com/problems/${problemId}`;
  if (platform === 'spoj')     return `https://www.spoj.com/problems/${problemId}`;
  if (platform === 'kattis')   return `https://open.kattis.com/problems/${problemId}`;
  if (platform === 'atcoder')  return `https://atcoder.jp`;
  // Codeforces fallback
  const match = problemId.match(/^(\d+)([A-Z][0-9]?)$/i);
  if (match) return `https://codeforces.com/problemset/problem/${match[1]}/${match[2].toUpperCase()}`;
  return 'https://codeforces.com/problemset';
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function statusLabel(s) {
  return { solved: '✓ Solved', partial: '◑ Partial', stuck: '✗ Stuck', skipped: '→ Skipped' }[s] || s;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
