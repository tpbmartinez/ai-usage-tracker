// Shared core: provider metadata, settings (synced), IndexedDB history, forecasting.
// Classic script defining the global CORE; loaded by the service worker, popup and dashboard.

var CORE = (() => {
  const PROVIDERS = [
    { id: 'claude', name: 'Claude', site: 'https://claude.ai', billing: 'https://claude.ai/settings/billing' },
    { id: 'chatgpt', name: 'ChatGPT', site: 'https://chatgpt.com', billing: 'https://chatgpt.com/#settings/Account',
      note: 'These are the Codex limits on your ChatGPT plan. ChatGPT does not expose chat message caps, so chat messages are counted locally.' },
    { id: 'gemini', name: 'Gemini', site: 'https://gemini.google.com', billing: 'https://one.google.com/settings', local: true,
      note: 'Gemini does not share usage % yet, so prompts sent from this browser are counted instead.' },
  ];
  const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

  const DEFAULTS = {
    thresholds: [75, 90, 100],
    notify: true,
    headsUp: true,
    backAlert: true,
    underuse: true,
    underusePct: 30,
    digest: true,
    quietStart: '22:00',
    quietEnd: '07:00',
    quietOn: false,
    intervalMin: 5,
    claudeOrg: '',
    planPrices: { claude: 0, chatgpt: 0, gemini: 0 },
  };

  // Settings live in chrome.storage.sync so they follow you across Chrome profiles signed in to the same account.
  async function getSettings() {
    const { settings = {} } = await chrome.storage.sync.get('settings');
    return { ...DEFAULTS, ...settings, planPrices: { ...DEFAULTS.planPrices, ...(settings.planPrices || {}) } };
  }
  const saveSettings = (settings) => chrome.storage.sync.set({ settings });

  function inQuietHours(s, d = new Date()) {
    if (!s.quietOn || !s.quietStart || !s.quietEnd) return false;
    const mins = d.getHours() * 60 + d.getMinutes();
    const [sh, sm] = s.quietStart.split(':').map(Number);
    const [eh, em] = s.quietEnd.split(':').map(Number);
    const a = sh * 60 + sm;
    const b = eh * 60 + em;
    return a <= b ? mins >= a && mins < b : mins >= a || mins < b;
  }

  // ---------- IndexedDB ----------
  // samples: { t, p, k, pct, r }   one reading of one window
  // periods: { id, p, k, label, kind, end, peak }   one finished (or current) limit window
  let dbp;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open('aiut', 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore('samples', { autoIncrement: true }).createIndex('t', 't');
          d.createObjectStore('periods', { keyPath: 'id' }).createIndex('end', 'end');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }

  async function run(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  const addSample = (s) => run('samples', 'readwrite', (st) => st.add(s));
  const getSamples = (since = 0) =>
    run('samples', 'readonly', (st) => st.index('t').getAll(IDBKeyRange.lowerBound(since)));
  const pruneSamples = (before) =>
    run('samples', 'readwrite', (st) => {
      const req = st.index('t').openCursor(IDBKeyRange.upperBound(before));
      req.onsuccess = () => {
        const c = req.result;
        if (c) { c.delete(); c.continue(); }
      };
      return null;
    });
  const putPeriod = (p) => run('periods', 'readwrite', (st) => st.put(p));
  const getPeriods = () => run('periods', 'readonly', (st) => st.getAll());
  const clearHistory = () => Promise.all([
    run('samples', 'readwrite', (st) => st.clear()),
    run('periods', 'readwrite', (st) => st.clear()),
  ]);

  // ---------- forecasting ----------
  // Linear burn rate over recent samples in the *current* window.
  // Returns { eta, hitsBeforeReset } or null when there isn't enough signal.
  function forecast(samples, w, now = Date.now()) {
    if (!w.resetsAt || w.pct >= 100) return null;
    const span = w.kind === 'session' ? 2 * 3600e3 : w.kind === 'monthly' ? 7 * 86400e3 : 48 * 3600e3;
    const bucket = resetBucket(w.resetsAt);
    const pts = samples
      .filter((s) => s.t >= now - span && resetBucket(s.r) === bucket)
      .sort((a, b) => a.t - b.t);
    if (pts.length < 2) return null;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const dt = last.t - first.t;
    const dp = last.pct - first.pct;
    if (dt < 10 * 60e3 || dp <= 0) return null;
    const eta = last.t + ((100 - last.pct) / dp) * dt;
    return { eta, hitsBeforeReset: eta < w.resetsAt };
  }

  // Reset timestamps from the APIs can drift by seconds between calls; bucket them to 10 minutes.
  const resetBucket = (r) => (r ? Math.round(r / 600e3) : 0);

  return {
    PROVIDERS, byId, DEFAULTS, getSettings, saveSettings, inQuietHours,
    addSample, getSamples, pruneSamples, putPeriod, getPeriods, clearHistory,
    forecast, resetBucket,
  };
})();
