document.getElementById('ver').textContent = `v${chrome.runtime.getManifest().version}`;
async function render() {
  const [{ usage = {}, msgLog = [] }, settings, samples] = await Promise.all([
    chrome.storage.local.get(['usage', 'msgLog']),
    CORE.getSettings(),
    CORE.getSamples(Date.now() - 7 * 86400e3),
  ]);
  document.getElementById('cards').replaceChildren(
    ...CORE.PROVIDERS.map((p) => UI.providerCard(p, usage[p.id], msgLog.filter((m) => m.p === p.id), settings, samples)));
}

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
document.getElementById('dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
});
chrome.storage.onChanged.addListener(render);
setInterval(render, 30000);

render();
chrome.runtime.sendMessage({ type: 'aiut-refresh-all' }).catch(() => {});
