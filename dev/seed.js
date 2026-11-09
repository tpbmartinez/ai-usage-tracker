// Seeds fake usage, message log and IndexedDB history so the preview pages have something to draw.
(async () => {
  const now = Date.now(), H = 3600e3, D = 24 * H;
  const r5 = now + 2.2 * H, rw = now + 3.2 * D, cw = now + 5 * D;
  __mem.local.usage = {
    claude: { plan: 'Max', updatedAt: now - 2 * 60e3, orgs: [{ uuid: 'a', name: 'Personal' }, { uuid: 'b', name: 'MediaJel Team' }], windows: [
      { key: 'five_hour', label: '5-hour window', pct: 64, resetsAt: r5, kind: 'session' },
      { key: 'seven_day', label: 'Weekly · all models', pct: 78, resetsAt: rw, kind: 'weekly' },
      { key: 'seven_day_opus', label: 'Weekly · Opus', pct: 93, resetsAt: rw, kind: 'weekly' }], raw: { five_hour: { utilization: 64 } } },
    chatgpt: { plan: 'Plus', updatedAt: now - 60e3, windows: [
      { key: 'primary', label: '5-hour window', pct: 12, resetsAt: now + 4 * H, kind: 'session' },
      { key: 'secondary', label: 'Weekly', pct: 41, resetsAt: cw, kind: 'weekly' }] },
  };
  const log = [];
  for (let i = 0; i < 300; i++) { const t = now - Math.random() * 14 * D; log.push({ t, p: ['claude', 'chatgpt', 'gemini'][i % 3], m: ['gpt-5', 'claude-opus', 'Thinking', null][i % 4] }); }
  log.sort((a, b) => a.t - b.t); __mem.local.msgLog = log;
  await CORE.clearHistory();
  for (let t = now - 7 * D; t <= now; t += 30 * 60e3) {
    const frac = (t - (now - 7 * D)) / (7 * D);
    await CORE.addSample({ t, p: 'claude', k: 'seven_day', pct: Math.min(78, frac * 80), r: rw });
    await CORE.addSample({ t, p: 'claude', k: 'seven_day_opus', pct: Math.min(93, frac * 95), r: rw });
    await CORE.addSample({ t, p: 'chatgpt', k: 'secondary', pct: Math.min(41, frac * 42), r: cw });
  }
  for (let i = 0; i < 12; i++) { const t = now - (90 - i * 8) * 60e3; await CORE.addSample({ t, p: 'claude', k: 'five_hour', pct: 20 + i * 4, r: r5 }); }
  for (let w = 1; w <= 6; w++) { await CORE.putPeriod({ id: 'c' + w, p: 'claude', k: 'seven_day', label: 'Weekly · all models', kind: 'weekly', end: now - w * 7 * D + 3 * D, peak: [88, 72, 25, 95, 60, 18][w - 1] }); await CORE.putPeriod({ id: 'g' + w, p: 'chatgpt', k: 'secondary', label: 'Weekly', kind: 'weekly', end: now - w * 7 * D + 5 * D, peak: [40, 22, 55, 10, 35, 50][w - 1] }); }
  __fire();
})();
