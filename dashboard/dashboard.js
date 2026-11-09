document.getElementById('ver').textContent = `v${chrome.runtime.getManifest().version}`;
const { h } = UI;
const DAY = 86400e3;
const view = document.getElementById('view');
let state = { range: 7 };

async function load() {
  const [{ usage = {}, msgLog = [] }, settings, samples, periods] = await Promise.all([
    chrome.storage.local.get(['usage', 'msgLog']),
    CORE.getSettings(),
    CORE.getSamples(Date.now() - 120 * DAY),
    CORE.getPeriods(),
  ]);
  return { usage, msgLog, settings, samples, periods };
}

// ---------- tabs ----------
const TABS = {
  async overview(d) {
    return [
      h('div', { class: 'grid' }, CORE.PROVIDERS.map((p) =>
        UI.providerCard(p, d.usage[p.id], d.msgLog.filter((m) => m.p === p.id), d.settings, d.samples))),
    ];
  },

  async history(d) {
    const now = Date.now();
    const from = now - state.range * DAY;
    const picker = h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Range:'),
      [1, 7, 30, 90].map((n) => h('button', {
        class: state.range === n ? 'active' : '',
        onclick: () => { state.range = n; render(); },
      }, n === 1 ? '24 hours' : `${n} days`)));
    const out = [picker];
    for (const p of CORE.PROVIDERS.filter((x) => !x.local)) {
      const mine = d.samples.filter((x) => x.p === p.id && x.t >= from);
      const labels = Object.fromEntries((d.usage[p.id]?.windows || []).map((w) => [w.key, w.label]));
      const keys = [...new Set(mine.map((x) => x.k))];
      const series = keys.map((k) => ({ name: labels[k] || k, pts: mine.filter((x) => x.k === k) }));
      out.push(h('div', { class: 'panel' }, h('h3', {}, `${p.name}: % of limit used`),
        series.length ? [UI.lineChart(series, from, now), UI.legend(series)]
          : h('div', { class: 'muted' }, 'No history in this range yet. It builds up as the extension refreshes.')));
    }
    // Weekly peaks: how much of each weekly limit you actually used.
    const weekly = d.periods.filter((x) => x.kind === 'weekly' && x.end).sort((a, b) => a.end - b.end);
    const rows = CORE.PROVIDERS.filter((x) => !x.local).flatMap((p) => {
      const ps = weekly.filter((x) => x.p === p.id).slice(-24);
      return ps.map((x) => h('div', { class: 'b' },
        h('span', {}, `${p.name} · ${new Date(x.end).toLocaleDateString([], { month: 'short', day: 'numeric' })}`),
        h('div', { class: 'track', title: x.label }, h('span', { style: `width:${x.peak}%;background:${x.peak < d.settings.underusePct ? 'var(--muted)' : 'var(--ok)'}` })),
        h('span', { class: 'num' }, `${Math.round(x.peak)}%`)));
    });
    out.push(h('div', { class: 'panel' }, h('h3', {}, 'Weekly limits: peak usage per week'),
      h('div', { class: 'muted', style: 'margin-bottom:8px' }, `Grey bars are weeks below your ${d.settings.underusePct}% under-use mark. Dates are when each week reset.`),
      rows.length ? h('div', { class: 'bars' }, rows) : h('div', { class: 'muted' }, 'No finished weeks recorded yet.')));
    return out;
  },

  async messages(d) {
    const days = 14;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const out = [];
    for (const p of CORE.PROVIDERS) {
      const mine = d.msgLog.filter((m) => m.p === p.id);
      const counts = [];
      for (let i = days - 1; i >= 0; i--) {
        const a = start.getTime() - i * DAY;
        counts.push({ a, n: mine.filter((m) => m.t >= a && m.t < a + DAY).length });
      }
      const max = Math.max(1, ...counts.map((c) => c.n));
      const st = UI.messageStats(mine);
      out.push(h('div', { class: 'panel' },
        h('h3', {}, `${p.name}: messages sent from this browser`),
        h('div', { class: 'muted', style: 'margin-bottom:8px' }, `${st.n5h} in last 5h · ${st.n7d} in last 7d${st.models ? ` · last 5h by model: ${st.models}` : ''}`),
        h('div', { class: 'bars' }, counts.map((c) => h('div', { class: 'b' },
          h('span', {}, new Date(c.a).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })),
          h('div', { class: 'track' }, h('span', { style: `width:${(c.n / max) * 100}%;background:var(--accent)` })),
          h('span', { class: 'num' }, String(c.n)))))));
    }
    return out;
  },

  async settings(d) {
    const s = d.settings;
    const orgs = d.usage.claude?.orgs || [];
    const status = h('span', { class: 'status' });
    const field = (label, hint, input) => h('label', {}, h('span', {}, label, hint ? h('small', {}, hint) : null), input);
    const form = h('form', { class: 'settings panel' },
      h('h3', {}, 'Alerts'),
      field('Alert levels (%)', 'Comma-separated. You get one alert per level per window.', h('input', { type: 'text', name: 'thresholds', value: s.thresholds.join(', ') })),
      field('Desktop notifications', null, h('input', { type: 'checkbox', name: 'notify', checked: s.notify })),
      field('Heads-up before you hit a limit', 'Warns when your current pace would use up a window before it resets.', h('input', { type: 'checkbox', name: 'headsUp', checked: s.headsUp })),
      field('Alert when a limit is back', null, h('input', { type: 'checkbox', name: 'backAlert', checked: s.backAlert })),
      field('Under-use alert', 'When a weekly window resets below this %, you get a nudge.', h('span', { class: 'row' },
        h('input', { type: 'checkbox', name: 'underuse', checked: s.underuse }),
        h('input', { type: 'number', name: 'underusePct', min: 1, max: 99, value: s.underusePct }))),
      field('Monday digest', 'A summary of last week, Mondays from 9am.', h('input', { type: 'checkbox', name: 'digest', checked: s.digest })),
      field('Quiet hours', 'Alerts are held and summarized when quiet hours end.', h('span', { class: 'row' },
        h('input', { type: 'checkbox', name: 'quietOn', checked: s.quietOn }),
        h('input', { type: 'time', name: 'quietStart', value: s.quietStart }), 'to',
        h('input', { type: 'time', name: 'quietEnd', value: s.quietEnd }))),
      h('h3', { style: 'margin-top:18px' }, 'Plans'),
      CORE.PROVIDERS.map((p) => field(`${p.name} monthly price ($)`, 'Used to show unused value. Leave 0 to skip.',
        h('input', { type: 'number', name: `price_${p.id}`, min: 0, step: 1, value: s.planPrices[p.id] || 0 }))),
      field('Claude organization', orgs.length > 1 ? 'You belong to more than one. Pick which one to track.' : 'Shown when your login has more than one.',
        h('select', { name: 'claudeOrg', disabled: orgs.length < 2 },
          h('option', { value: '' }, 'Automatic'),
          orgs.map((o) => h('option', { value: o.uuid, selected: o.uuid === s.claudeOrg }, o.name)))),
      h('h3', { style: 'margin-top:18px' }, 'Refresh'),
      field('Background refresh every (minutes)', null, h('input', { type: 'number', name: 'intervalMin', min: 1, max: 120, value: s.intervalMin })),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { type: 'submit' }, 'Save'), status),
      h('p', { class: 'muted' }, 'Settings sync across Chrome browsers signed in to the same Google account. Shortcut to open this page: Alt+Shift+U (change it at chrome://extensions/shortcuts).'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const num = (v, lo, hi, dflt) => Math.min(hi, Math.max(lo, Number(v) || dflt));
      const thresholds = [...new Set(f.thresholds.value.split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 100))].sort((a, b) => a - b);
      const next = {
        ...s,
        thresholds: thresholds.length ? thresholds : CORE.DEFAULTS.thresholds,
        notify: f.notify.checked,
        headsUp: f.headsUp.checked,
        backAlert: f.backAlert.checked,
        underuse: f.underuse.checked,
        underusePct: num(f.underusePct.value, 1, 99, 30),
        digest: f.digest.checked,
        quietOn: f.quietOn.checked,
        quietStart: f.quietStart.value || '22:00',
        quietEnd: f.quietEnd.value || '07:00',
        intervalMin: num(f.intervalMin.value, 1, 120, 5),
        claudeOrg: f.claudeOrg.value,
        planPrices: Object.fromEntries(CORE.PROVIDERS.map((p) => [p.id, num(f[`price_${p.id}`].value, 0, 10000, 0)])),
      };
      await CORE.saveSettings(next);
      chrome.runtime.sendMessage({ type: 'aiut-settings-changed' }).catch(() => {});
      status.textContent = 'Saved';
      setTimeout(() => (status.textContent = ''), 2000);
    });
    return [form];
  },

  async data(d) {
    const status = h('span', { class: 'status' });
    const download = (name, text, type) => {
      const url = URL.createObjectURL(new Blob([text], { type }));
      h('a', { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const raw = Object.fromEntries(Object.entries(d.usage).map(([k, v]) => [k, v.raw || null]));
    return [
      h('div', { class: 'panel' }, h('h3', {}, 'Export'),
        h('div', { class: 'row' },
          h('button', { onclick: () => download(`ai-usage-${stamp}.json`, JSON.stringify({ exportedAt: Date.now(), settings: d.settings, usage: d.usage, samples: d.samples, periods: d.periods, messages: d.msgLog }, null, 2), 'application/json') }, 'Download everything (JSON)'),
          h('button', { onclick: () => download(`ai-usage-history-${stamp}.csv`,
            'time,provider,window,percent_used,resets_at\n' + d.samples.map((x) => [new Date(x.t).toISOString(), x.p, x.k, x.pct, x.r ? new Date(x.r).toISOString() : ''].join(',')).join('\n'), 'text/csv') }, 'Usage history (CSV)'),
          h('button', { onclick: () => download(`ai-messages-${stamp}.csv`,
            'time,provider,model\n' + d.msgLog.map((m) => [new Date(m.t).toISOString(), m.p, JSON.stringify(m.m || '')].join(',')).join('\n'), 'text/csv') }, 'Messages (CSV)'))),
      h('div', { class: 'panel' }, h('h3', {}, 'Last raw replies'),
        h('p', { class: 'muted' }, 'What each site returned last time, with emails and IDs removed. Handy if something looks wrong.'),
        h('pre', {}, JSON.stringify(raw, null, 2))),
      h('div', { class: 'panel' }, h('h3', {}, 'Reset'),
        h('div', { class: 'row' },
          h('button', { onclick: async () => { if (confirm('Delete all usage history? This cannot be undone.')) { await CORE.clearHistory(); await chrome.storage.local.remove('winState'); status.textContent = 'History cleared'; } } }, 'Clear usage history'),
          h('button', { onclick: async () => { if (confirm('Delete the local message log?')) { await chrome.storage.local.set({ msgLog: [] }); status.textContent = 'Message log cleared'; } } }, 'Clear message log'),
          status)),
    ];
  },
};

// ---------- routing ----------
const current = () => (TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'overview');
let busy = false;

async function render() {
  if (busy) return;
  busy = true;
  try {
    const tab = current();
    for (const a of document.querySelectorAll('#tabs a')) a.classList.toggle('active', a.getAttribute('href') === `#${tab}`);
    const d = await load();
    view.replaceChildren(...(await TABS[tab](d)));
  } finally {
    busy = false;
  }
}

window.addEventListener('hashchange', render);
// Don't re-render the settings form while someone is typing in it.
chrome.storage.onChanged.addListener(() => { if (current() !== 'settings') render(); });
setInterval(() => { if (current() !== 'settings') render(); }, 60000);

document.getElementById('refresh').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  try {
    await chrome.runtime.sendMessage({ type: 'aiut-refresh-all' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh';
    render();
  }
});

render();
