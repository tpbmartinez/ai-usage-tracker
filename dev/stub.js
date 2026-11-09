// Fake chrome.* APIs (in-memory storage, recorded notifications/alarms) for testing pages outside Chrome.
(() => {
  const mem = { local: {}, sync: {} };
  const listeners = [];
  const area = (name) => ({
    async get(keys) { const ks = keys == null ? Object.keys(mem[name]) : [].concat(keys); const o = {}; for (const k of ks) if (k in mem[name]) o[k] = structuredClone(mem[name][k]); return o; },
    async set(obj) { Object.assign(mem[name], structuredClone(obj)); listeners.forEach((f) => f(obj, name)); },
    async remove(ks) { for (const k of [].concat(ks)) delete mem[name][k]; },
  });
  const ev = () => ({ addListener() {} });
  window.__notes = []; window.__alarms = {};
  window.chrome = {
    storage: { local: area('local'), sync: area('sync'), onChanged: { addListener: (f) => listeners.push(f) } },
    runtime: { id: 'x', sendMessage: async () => ({}), getURL: (p) => p, getManifest: () => ({ version: 'dev' }), onMessage: ev(), onInstalled: ev(), onStartup: ev(), openOptionsPage() {} },
    tabs: { create() {}, query: async () => [], sendMessage: async () => null },
    notifications: { create: (id, o) => window.__notes.push(o) },
    alarms: { create: (n, o) => (window.__alarms[n] = o), clear: async () => {}, get: async () => null, onAlarm: ev() },
    action: { setBadgeText: async (o) => (window.__badge = o.text), setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
    commands: { onCommand: ev() },
  };
  window.importScripts = () => {};
  window.__mem = mem;
  window.__fire = () => listeners.forEach((f) => f({}, 'local'));
})();
