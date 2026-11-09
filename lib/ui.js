// Shared rendering helpers for the popup and dashboard. Defines the global UI.
var UI = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const H5 = 5 * 3600e3;
  const WEEK = 7 * 86400e3;
  const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  function s(tag, attrs = {}, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
    for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid);
    return el;
  }

  function ago(ts) {
    const sec = Math.round((Date.now() - ts) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }

  function dur(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days >= 1) return `${days}d ${hrs % 24}h`;
    if (hrs >= 1) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  }

  function when(ts) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }

  function level(pct, settings) {
    const [warn = 75, crit = 90] = [...settings.thresholds].sort((a, b) => a - b);
    return pct >= crit ? 'lvl-crit' : pct >= warn ? 'lvl-warn' : '';
  }

  // Tiny trend line of one window's samples.
  function sparkline(pts, from, to, width = 300, height = 26) {
    if (pts.length < 2) return null;
    const x = (t) => ((t - from) / (to - from)) * width;
    const y = (p) => height - 2 - (p / 100) * (height - 4);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join('');
    return s('svg', { class: 'spark', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      s('path', { d, fill: 'none', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
  }

  function windowRow(w, settings, samples = []) {
    const now = Date.now();
    const reset = w.resetsAt && w.resetsAt <= now;
    const pct = Math.round(w.pct);
    let sub = reset ? 'Window has reset. Refresh to update.'
      : w.resetsAt ? `Resets in ${dur(w.resetsAt - now)} · ${when(w.resetsAt)}` : w.kind === 'monthly' ? 'Resets monthly' : 'Reset time not reported';
    let warn = null;
    if (!reset) {
      const f = CORE.forecast(samples, w, now);
      if (f && f.hitsBeforeReset) warn = h('div', { class: 'forecast' }, `At this pace you'll hit 100% in ${dur(f.eta - now)}`);
    }
    const span = w.kind === 'session' ? H5 : w.kind === 'monthly' ? 30 * 86400e3 : WEEK;
    const bucket = CORE.resetBucket(w.resetsAt);
    const trend = sparkline(samples.filter((x) => x.t >= now - span && (!bucket || CORE.resetBucket(x.r) === bucket)), now - span, now);
    return h('div', { class: `win ${reset ? '' : level(w.pct, settings)} ${reset ? 'reset' : ''}` },
      h('div', { class: 'win-top' }, h('span', { class: 'win-label' }, w.label), h('span', { class: 'win-pct' }, `${pct}%`)),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('span', { style: `width:${reset ? 0 : pct}%` })),
      h('div', { class: 'sub' }, sub, w.link ? [' · ', h('a', { href: w.link.href, target: '_blank' }, w.link.text)] : null),
      warn,
      trend);
  }

  function messageStats(log) {
    const now = Date.now();
    const in5h = log.filter((m) => now - m.t < H5);
    const in7d = log.filter((m) => now - m.t < WEEK);
    const byModel = {};
    for (const m of in5h) byModel[m.m || 'default'] = (byModel[m.m || 'default'] || 0) + 1;
    const models = Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, n]) => `${m}: ${n}`).join(' · ');
    return { n5h: in5h.length, n7d: in7d.length, models };
  }

  function messagesBlock(log, prominent) {
    if (!log.length && !prominent) return null;
    const st = messageStats(log);
    return h('div', { class: prominent ? 'msgs prominent' : 'msgs' },
      h('div', {}, prominent ? h('b', {}, `${st.n5h} prompt${st.n5h === 1 ? '' : 's'} in last 5h · ${st.n7d} in last 7d`)
        : `Sent from this browser: ${st.n5h} in last 5h · ${st.n7d} in last 7d`),
      st.models ? h('div', { class: 'models' }, `Last 5h by model: ${st.models}`) : null);
  }

  function providerCard(p, data, log, settings, samples) {
    const head = h('div', { class: 'card-head' },
      h('h2', {}, p.name),
      data && data.plan ? h('span', { class: 'pill' }, data.plan) : null,
      data && data.updatedAt ? h('span', { class: 'updated' }, `Updated ${ago(data.updatedAt)}`) : null);
    const body = [];
    if (p.local) {
      body.push(messagesBlock(log, true));
      if (!log.length) body.push(h('div', { class: 'empty' }, 'No prompts counted yet. Use ', h('a', { href: p.site, target: '_blank' }, 'gemini.google.com'), ' and they will show here.'));
    } else if (data && data.windows && data.windows.length) {
      body.push(data.windows.map((w) => windowRow(w, settings, samples.filter((x) => x.p === p.id && x.k === w.key))));
    } else if (!data || !data.error) {
      body.push(h('div', { class: 'empty' }, 'No data yet. Sign in at ', h('a', { href: p.site, target: '_blank' }, p.site.replace('https://', '')), ', then press Refresh.'));
    }
    if (data && Array.isArray(data.extras)) body.push(data.extras.map((t) => h('div', { class: 'sub', style: 'margin-top:6px' }, t)));
    if (data && data.error) {
      body.push(h('div', { class: 'err' }, data.windows ? `Last refresh failed: ${data.error} ` : `${data.error} `,
        h('a', { href: p.site, target: '_blank' }, `Open ${p.name}`)));
    }
    if (p.note && (p.local || (data && data.windows))) body.push(h('div', { class: 'note' }, p.note));
    if (!p.local) body.push(messagesBlock(log, false));
    return h('section', { class: 'card' }, head, body);
  }

  // Multi-series line chart of % used over time.
  function lineChart(series, from, to, { width = 720, height = 220 } = {}) {
    const L = 34, R = 8, T = 8, B = 22;
    const W = width - L - R;
    const Hh = height - T - B;
    const x = (t) => L + ((t - from) / (to - from)) * W;
    const y = (p) => T + Hh - (p / 100) * Hh;
    const grid = [0, 25, 50, 75, 100].map((p) => [
      s('line', { x1: L, x2: width - R, y1: y(p), y2: y(p), class: 'grid' }),
      s('text', { x: L - 6, y: y(p) + 4, 'text-anchor': 'end', class: 'axis' }, `${p}%`),
    ]);
    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      const t = from + ((to - from) * i) / 4;
      const d = new Date(t);
      const label = to - from <= 2 * 86400e3 ? d.toLocaleTimeString([], { hour: 'numeric' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      ticks.push(s('text', { x: x(t), y: height - 6, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle', class: 'axis' }, label));
    }
    const lines = series.map((se, i) => {
      const pts = se.pts.filter((p) => p.t >= from && p.t <= to);
      if (!pts.length) return null;
      const d = pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join('');
      return s('path', { d, fill: 'none', stroke: se.color || COLORS[i % COLORS.length], 'stroke-width': 2, 'stroke-linejoin': 'round' },
        s('title', {}, se.name));
    });
    return s('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img' }, grid, ticks, lines);
  }

  function legend(series) {
    return h('div', { class: 'legend' }, series.map((se, i) =>
      h('span', {}, h('i', { style: `background:${se.color || COLORS[i % COLORS.length]}` }), se.name)));
  }

  return { h, s, ago, dur, when, level, sparkline, windowRow, messagesBlock, messageStats, providerCard, lineChart, legend, COLORS };
})();
