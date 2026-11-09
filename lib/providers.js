// Shared usage fetchers + parsers.
// Loaded by the service worker (importScripts) and by the content scripts,
// so it must stay a plain classic script that defines one global: AIUT.
// Both providers use the internal endpoints their own web apps call; they are
// undocumented and may change, so every parser is defensive.

var AIUT = (() => {
  const CLAUDE_LABELS = {
    five_hour: '5-hour window',
    seven_day: 'Weekly · all models',
    seven_day_opus: 'Weekly · Opus',
    seven_day_sonnet: 'Weekly · Sonnet',
    seven_day_oauth_apps: 'Weekly · Claude Code & apps',
    extra_usage: 'Extra usage · monthly cap',
  };

  async function getJSON(url, headers = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { accept: 'application/json', ...headers },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Not signed in, or the request was blocked. Open the site in a tab and log in.');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).pathname}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) {
      throw new Error('Got a non-JSON reply (probably a bot check). Open the site in a tab.');
    }
    return res.json();
  }

  const prettify = (key) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // ---------- Claude ----------
  // GET /api/organizations                 -> [{ uuid, capabilities: [...] }]
  // GET /api/organizations/{uuid}/usage    -> { five_hour: { utilization, resets_at }, seven_day: {...}, ... }
  function parseClaude(usage) {
    const windows = [];
    for (const [key, v] of Object.entries(usage || {})) {
      if (!v || typeof v !== 'object' || typeof v.utilization !== 'number') continue;
      const extra = key === 'extra_usage';
      if (extra && v.is_enabled === false) continue;
      windows.push({
        key,
        label: CLAUDE_LABELS[key] || prettify(key),
        pct: clampPct(v.utilization),
        resetsAt: v.resets_at ? Date.parse(v.resets_at) || null : null,
        kind: key.startsWith('five_hour') ? 'session' : extra ? 'monthly' : 'weekly',
        link: extra ? { href: 'https://claude.ai/settings/usage', text: 'Change cap' } : undefined,
      });
    }
    return sortWindows(windows);
  }

  function claudePlan(org) {
    const caps = org.capabilities || [];
    if (caps.includes('claude_max')) return 'Max';
    if (caps.includes('claude_pro')) return 'Pro';
    if (caps.includes('raven')) return 'Team';
    return null;
  }

  async function fetchClaude(base = 'https://claude.ai', orgId = '') {
    const orgs = await getJSON(`${base}/api/organizations`);
    if (!Array.isArray(orgs) || !orgs.length) throw new Error('No Claude organization found for this login.');
    const org =
      (orgId && orgs.find((o) => o.uuid === orgId)) ||
      orgs.find((o) => (o.capabilities || []).includes('chat')) ||
      orgs[0];
    const usage = await getJSON(`${base}/api/organizations/${encodeURIComponent(org.uuid)}/usage`);
    const windows = parseClaude(usage);
    if (!windows.length) throw new Error('Claude returned no usage windows for this plan.');
    return {
      plan: claudePlan(org),
      windows,
      orgId: org.uuid,
      orgs: orgs.map((o) => ({ uuid: o.uuid, name: String(o.name || 'Organization').slice(0, 80) })),
      raw: sanitize(usage),
    };
  }

  // ---------- ChatGPT ----------
  // GET /api/auth/session       -> { accessToken, account: { id, planType } }
  // GET /backend-api/wham/usage -> { plan_type, rate_limit: { primary_window, secondary_window }, ... }
  // These are the Codex limits on your ChatGPT plan (5-hour + weekly). The access
  // token is used for this one request and never stored.
  function windowFromSeconds(secs) {
    if (!secs) return { label: 'Window', kind: 'session' };
    const hours = Math.round(secs / 3600);
    if (secs >= 6 * 86400) return { label: 'Weekly', kind: 'weekly' };
    if (secs >= 86400) return { label: `${Math.round(secs / 86400)}-day window`, kind: 'weekly' };
    return { label: `${hours}-hour window`, kind: 'session' };
  }

  function parseChatGPT(usage) {
    const windows = [];
    const add = (w, key, prefix) => {
      if (!w || typeof w.used_percent !== 'number') return;
      const { label, kind } = windowFromSeconds(w.limit_window_seconds);
      let resetsAt = null;
      if (typeof w.reset_at === 'number') resetsAt = w.reset_at * (w.reset_at < 1e12 ? 1000 : 1);
      else if (typeof w.reset_after_seconds === 'number') resetsAt = Date.now() + w.reset_after_seconds * 1000;
      windows.push({ key, label: prefix ? `${prefix} · ${label}` : label, pct: clampPct(w.used_percent), resetsAt, kind });
    };
    const rl = usage && usage.rate_limit;
    if (rl) {
      add(rl.primary_window, 'primary');
      add(rl.secondary_window, 'secondary');
    }
    const cr = usage && usage.code_review_rate_limit;
    if (cr) {
      add(cr.primary_window, 'review_primary', 'Code review');
      add(cr.secondary_window, 'review_secondary', 'Code review');
    }
    return sortWindows(windows);
  }

  async function fetchChatGPT(base = 'https://chatgpt.com') {
    const session = await getJSON(`${base}/api/auth/session`);
    if (!session || !session.accessToken) throw new Error('Not signed in to ChatGPT.');
    const headers = { authorization: `Bearer ${session.accessToken}` };
    if (session.account && session.account.id) headers['chatgpt-account-id'] = session.account.id;
    const usage = await getJSON(`${base}/backend-api/wham/usage`, headers);
    const windows = parseChatGPT(usage);
    if (!windows.length) throw new Error('ChatGPT returned no usage windows for this plan.');
    const plan = usage.plan_type || (session.account && session.account.planType) || null;
    const extras = [];
    const c = usage.credits;
    if (c && typeof c === 'object') {
      if (c.unlimited) extras.push('Codex credits: unlimited');
      else if (c.balance != null && !isNaN(Number(c.balance))) extras.push(`Codex credits balance: ${Number(c.balance).toLocaleString()}`);
    }
    return { plan: plan ? prettify(String(plan)) : null, windows, extras, raw: sanitize(usage) };
  }

  // ---------- helpers ----------
  // Keep raw replies for the dashboard's Data tab, minus anything identifying.
  function sanitize(obj, depth = 0) {
    if (depth > 6 || obj == null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.slice(0, 20).map((v) => sanitize(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/email|user_?id|account_?id|token|name|phone|uuid/i.test(k)) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }

  function clampPct(n) {
    return Math.max(0, Math.min(100, Number(n) || 0));
  }

  function sortWindows(ws) {
    return ws.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'session' ? -1 : 1));
  }

  return { fetchClaude, fetchChatGPT, parseClaude, parseChatGPT };
})();

if (typeof module !== 'undefined') module.exports = AIUT;
