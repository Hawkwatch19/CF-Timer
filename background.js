// CF Timer — Background Service Worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Notification: time's up
  if (message.type === 'TIMER_FINISHED') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '⏱ CF Timer — Time\'s Up!',
      message: `Target time reached for ${message.problem || 'this problem'}. Review your approach!`,
      priority: 2
    });
  }

  // The overlay pause button sends this; relay the toggle back to the popup
  // and update storage so popup stays in sync when reopened.
  if (message.type === 'OVERLAY_PAUSE_TOGGLE') {
    chrome.storage.local.get('timerState', data => {
      const s = data.timerState;
      if (!s) return;

      if (s.running) {
        // Pause
        const elapsed = Math.floor((Date.now() - s.startTs) / 1000);
        const updated = { ...s, running: false, elapsed, baseElapsed: elapsed, startTs: null };
        chrome.storage.local.set({ timerState: updated });

        // Tell the content script (same tab) to show paused state
        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'TIMER_PAUSED',
            elapsed,
            targetSecs: (s.targetMin || 30) * 60,
          }).catch(() => {});
        }
      } else {
        // Resume
        const startTs = Date.now() - (s.baseElapsed || 0) * 1000;
        const updated = { ...s, running: true, startTs };
        chrome.storage.local.set({ timerState: updated });

        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'TIMER_RESUMED',
            elapsed: s.baseElapsed || 0,
            targetSecs: (s.targetMin || 30) * 60,
          }).catch(() => {});
        }
      }
    });
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'cf-timer-warning') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '⚠️ CF Timer — 5 Minutes Left',
      message: 'You have 5 minutes remaining on your target time.',
      priority: 1
    });
  }
});
