importScripts('lib/core.js', 'lib/providers.js');

const FETCHERS = {
  claude: (s) => AIUT.fetchClaude('https://claude.ai', s.claudeOrg),
  chatgpt: () => AIUT.fetchChatGPT(),
};
const ORIGINS = { claude: 'https://claude.ai', chatgpt: 'https://chatgpt.com' };
const DAY = 86400e3;
const WEEK = 7 * DAY;
const HISTORY_DAYS = 120;

// Serialize read-modify-write on storage so concurrent updates don't clobber each other.
let chain = Promise.resolve();
function serial(fn) {
  const r = chain.then(fn);
  chain = r.catch((e) => console.warn('[aiut]', e));
  return r;
}

const name = (id) => CORE.byId[id].name;

function fmtDur(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${mins % 60}m`;
  return `${mins}m`;
}

// ---------- notifications (respecting quiet hours) ----------
async function notify(id, title, message, priority = 1) {
  const s = await CORE.getSettings();
  if (!s.notify) return;
  if (CORE.inQuietHours(s)) {
    const { held = [] } = await chrome.storage.local.get('held');
    held.push({ title, message, t: Date.now() });
    await chrome.storage.local.set({ held: held.slice(-30) });
    return;
  }
  chrome.notifications.create(`${id}:${Date.now()}:${Math.random()}`, {
    type: 'basic', iconUrl: 'icons/icon128.png', title, message, priority,
  });
}

async function flushHeld() {
  const s = await CORE.getSettings();
  if (CORE.inQuietHours(s)) return;
  const { held = [] } = await chrome.storage.local.get('held');
  if (!held.length) return;
  await chrome.storage.local.set({ held: [] });
  if (!s.notify) return;
  const lines = held.slice(-4).map((h) => `• ${h.title}`).join('\n');
  chrome.notifications.create(`held:${Date.now()}`, {
    type: 'basic', iconUrl: 'icons/icon128.png',
    title: `${held.length} alert${held.length > 1 ? 's' : ''} during quiet hours`,
    message: lines, priority: 1,
  });
}

// ---------- storing a result + running the alert rules ----------
async function saveResult(id, result, source) {
  const { usage = {} } = await chrome.storage.local.get('usage');
  if (result && result.error) {
    usage[id] = { ...(usage[id] || {}), error: result.error, errorAt: Date.now() };
    await chrome.storage.local.set({ usage });
    return;
  }
  usage[id] = { ...result, updatedAt: Date.now(), source, error: null };
  await chrome.storage.local.set({ usage });
  await updateBadge(usage);
  await processWindows(id, result.windows || []);
}

async function processWindows(id, windows) {
  const s = await CORE.getSettings();
  const { winState = {} } = await chrome.storage.local.get('winState');
  const now = Date.now();
  const recent = await CORE.getSamples(now - 2 * DAY);
  const thresholds = [...s.thresholds].filter((n) => n > 0).sort((a, b) => a - b);

  for (const w of windows) {
    const key = `${id}:${w.key}`;
    // Windows without a reset time (e.g. a monthly extra-usage cap) re-arm their alerts each calendar month.
    const d = new Date(now);
    const bucket = CORE.resetBucket(w.resetsAt) || (w.kind === 'monthly' ? `m${d.getFullYear()}-${d.getMonth()}` : 0);
    let st = winState[key];

    // Window rolled over: close out the previous period.
    if (st && st.bucket !== bucket) {
      await finishPeriod(id, st, s);
      st = null;
    }
    if (!st) st = { bucket, end: w.resetsAt, label: w.label, kind: w.kind, peak: 0, level: 0, headsUp: false };
    st.peak = Math.max(st.peak, w.pct);
    st.label = w.label;

    // History: store a sample when the value moved or 30 minutes passed.
    if (st.lastPct !== w.pct || now - (st.lastT || 0) > 30 * 60e3) {
      await CORE.addSample({ t: now, p: id, k: w.key, pct: w.pct, r: w.resetsAt });
      st.lastPct = w.pct;
      st.lastT = now;
    }
    await CORE.putPeriod({ id: `${key}:${bucket}`, p: id, k: w.key, label: w.label, kind: w.kind, end: w.resetsAt, peak: st.peak });

    // Threshold alerts (75 / 90 / 100 by default): only the highest newly crossed level.
    const crossed = thresholds.filter((t) => w.pct >= t).pop() || 0;
    if (crossed > st.level) {
      st.level = crossed;
      const reset = w.resetsAt ? ` Resets in ${fmtDur(w.resetsAt - now)}.` : '';
      await notify(id,
        crossed >= 100 ? `${name(id)}: ${w.label} limit reached` : `${name(id)}: ${Math.round(w.pct)}% of ${w.label} used`,
        crossed >= 100 ? `You've hit the limit.${reset}` : `Crossed your ${crossed}% alert.${reset}`,
        crossed >= 90 ? 2 : 1);
    }

    // Heads-up: on pace to run out before the window resets.
    if (s.headsUp && !st.headsUp && w.pct >= 40 && w.pct < 100) {
      const f = CORE.forecast(recent.filter((x) => x.p === id && x.k === w.key), w, now);
      if (f && f.hitsBeforeReset && w.resetsAt - f.eta > 5 * 60e3) {
        st.headsUp = true;
        await notify(id, `${name(id)}: on pace to hit the ${w.label} limit`,
          `At your current pace you'll run out in about ${fmtDur(f.eta - now)}, ${fmtDur(w.resetsAt - f.eta)} before it resets.`, 2);
      }
    }

    // Limit reached: wake up at reset time to announce it's back.
    if (w.pct >= 100 && w.resetsAt && s.backAlert) {
      chrome.alarms.create(`back|${id}|${w.key}`, { when: Math.max(now + 60e3, w.resetsAt + 60e3) });
    }
    winState[key] = st;
  }
  await chrome.storage.local.set({ winState });
}

async function finishPeriod(id, st, s) {
  if (st.kind !== 'weekly' || !s.underuse || !st.end || st.end > Date.now()) return;
  if (st.peak >= s.underusePct) return;
  const price = Number(s.planPrices[id]) || 0;
  const unused = price ? ` That's roughly $${Math.round(price * (7 / 30) * (1 - st.peak / 100))} of your plan unused.` : '';
  await notify(id, `${name(id)}: plan under-used last week`,
    `You used only ${Math.round(st.peak)}% of your ${st.label} limit.${unused}`, 0);
}

async function onBackAlarm(id, key, attempt = 0) {
  await refreshProvider(id);
  const { usage = {} } = await chrome.storage.local.get('usage');
  const w = (usage[id]?.windows || []).find((x) => x.key === key);
  if (w && w.pct >= 100 && attempt < 6) {
    chrome.alarms.create(`back|${id}|${key}|${attempt + 1}`, { delayInMinutes: 5 });
    return;
  }
  await notify(id, `${name(id)}: your ${w ? w.label : 'usage'} limit is back`,
    w ? `Now at ${Math.round(w.pct)}%. Happy prompting.` : 'The window has reset.', 2);
}

// ---------- fetching ----------
// Background fetch first; if the site blocks it, ask an open tab to fetch in-page.
async function refreshProvider(id) {
  if (!FETCHERS[id]) return;
  const s = await CORE.getSettings();
  try {
    const result = await FETCHERS[id](s);
    await serial(() => saveResult(id, result, 'background'));
  } catch (bgErr) {
    const tabs = await chrome.tabs.query({ url: `${ORIGINS[id]}/*` });
    for (const tab of tabs) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'aiut-refresh' });
        if (result) return serial(() => saveResult(id, result, 'tab'));
      } catch {
        /* no content script in that tab yet */
      }
    }
    await serial(() => saveResult(id, { error: String(bgErr.message || bgErr) }));
  }
}

const refreshAll = () => Promise.all(Object.keys(FETCHERS).map(refreshProvider));

// ---------- badge ----------
async function updateBadge(usage) {
  const s = await CORE.getSettings();
  let max = null;
  for (const p of Object.values(usage || {})) {
    for (const w of p.windows || []) {
      if (w.resetsAt && w.resetsAt < Date.now()) continue;
      max = Math.max(max ?? 0, w.pct);
    }
  }
  if (max === null) return chrome.action.setBadgeText({ text: '' });
  const [warn = 75, crit = 90] = [...s.thresholds].sort((a, b) => a - b);
  const n = Math.round(max);
  await chrome.action.setBadgeBackgroundColor({ color: n >= crit ? '#d93025' : n >= warn ? '#e8a200' : '#1e8e3e' });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setBadgeText({ text: n >= 100 ? '100' : `${n}%` });
}

// ---------- local message log ----------
async function logMessage(provider, model) {
  const { msgLog = [] } = await chrome.storage.local.get('msgLog');
  const cutoff = Date.now() - 35 * DAY;
  const next = msgLog.filter((m) => m.t >= cutoff);
  next.push({ t: Date.now(), p: provider, m: model });
  await chrome.storage.local.set({ msgLog: next });
}

// ---------- weekly digest (Mondays from 9am) ----------
function mondayKey(d = new Date()) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m.toISOString().slice(0, 10);
}

async function maybeDigest() {
  const s = await CORE.getSettings();
  const now = new Date();
  if (!s.digest || now.getDay() !== 1 || now.getHours() < 9) return;
  const week = mondayKey(now);
  const { lastDigest } = await chrome.storage.local.get('lastDigest');
  if (lastDigest === week) return;
  await chrome.storage.local.set({ lastDigest: week });

  const periods = (await CORE.getPeriods()).filter((p) => p.kind === 'weekly' && p.end > Date.now() - WEEK - DAY);
  const { msgLog = [] } = await chrome.storage.local.get('msgLog');
  const lines = [];
  for (const p of CORE.PROVIDERS) {
    const peaks = periods.filter((x) => x.p === p.id).map((x) => `${x.label} ${Math.round(x.peak)}%`);
    const sent = msgLog.filter((m) => m.p === p.id && m.t > Date.now() - WEEK).length;
    if (peaks.length || sent) lines.push(`${p.name}: ${peaks.join(', ') || 'no limit data'}${sent ? ` · ${sent} msgs` : ''}`);
  }
  if (lines.length) await notify('digest', 'Your AI usage last week', lines.join('\n'), 0);
}

// ---------- scheduling ----------
async function setupAlarms() {
  const s = await CORE.getSettings();
  await chrome.alarms.clear('refresh');
  chrome.alarms.create('refresh', { periodInMinutes: Math.max(1, Number(s.intervalMin) || 5), delayInMinutes: 0.1 });
  if (!(await chrome.alarms.get('tick'))) chrome.alarms.create('tick', { periodInMinutes: 15 });
}

chrome.runtime.onInstalled.addListener(async () => {
  // Carry over thresholds from v1 (stored in local storage) on upgrade.
  const { settings: old } = await chrome.storage.local.get('settings');
  if (old) {
    const s = await CORE.getSettings();
    await CORE.saveSettings({ ...s, notify: old.notify ?? s.notify, intervalMin: old.intervalMin ?? s.intervalMin });
    await chrome.storage.local.remove(['settings', 'notified']);
  }
  setupAlarms();
});
chrome.runtime.onStartup.addListener(setupAlarms);

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'refresh') return refreshAll();
  if (a.name === 'tick') {
    await flushHeld();
    await maybeDigest();
    await CORE.pruneSamples(Date.now() - HISTORY_DAYS * DAY);
    return;
  }
  if (a.name.startsWith('back|')) {
    const [, id, key, attempt] = a.name.split('|');
    return onBackAlarm(id, key, Number(attempt) || 0);
  }
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'open-dashboard') chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'aiut-usage':
      if (FETCHERS[msg.provider] && msg.result) serial(() => saveResult(msg.provider, msg.result, 'tab'));
      return;
    case 'aiut-msg':
      if (CORE.byId[msg.provider]) {
        const model = typeof msg.model === 'string' ? msg.model.slice(0, 64) : null;
        serial(() => logMessage(msg.provider, model));
      }
      return;
    case 'aiut-refresh-all':
      refreshAll().then(() => sendResponse({ ok: true }));
      return true;
    case 'aiut-settings-changed':
      setupAlarms();
      chrome.storage.local.get('usage').then(({ usage }) => updateBadge(usage));
      return;
  }
});
