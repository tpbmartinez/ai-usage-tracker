// Isolated-world content script for claude.ai, chatgpt.com and gemini.google.com.
// Claude/ChatGPT: fetches usage in-page (same origin, your normal session) as the reliable path
// when background fetches are blocked. All three: logs messages you send (for local counts).
(() => {
  const host = location.hostname;
  const PROVIDER = host.endsWith('claude.ai') ? 'claude' : host.endsWith('chatgpt.com') ? 'chatgpt' : 'gemini';

  const send = (msg) => {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      /* extension was reloaded; this old content script is orphaned */
    }
  };

  // Gemini model name, read from the mode picker ("Open mode picker, currently 3.5 Flash").
  function geminiMode() {
    const el = document.querySelector('button[aria-label*="mode picker" i], [data-test-id="bard-mode-menu-button"]');
    if (!el) return null;
    const m = /currently\s+(.+)$/i.exec(el.getAttribute('aria-label') || '');
    const text = (m ? m[1] : el.textContent).trim().replace(/\s+/g, ' ');
    return text ? text.slice(0, 40) : null;
  }

  // Gemini sends prompts over a cross-origin streaming channel, so count sends from the UI instead:
  // Enter in the prompt box, or a click on "Send message". Only checks the box is non-empty; never reads it.
  if (PROVIDER === 'gemini') {
    const BOX = 'rich-textarea [contenteditable="true"], [role="textbox"][contenteditable="true"]';
    const hasText = () => {
      const b = document.querySelector(BOX);
      return !!b && b.textContent.trim().length > 0;
    };
    let last = 0;
    const counted = () => {
      const now = Date.now();
      if (now - last < 1500) return; // Enter + click can both fire for one send
      last = now;
      send({ type: 'aiut-msg', provider: 'gemini', model: geminiMode() });
    };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.closest && e.target.closest(BOX) && hasText()) counted();
    }, true);
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button[aria-label]');
      if (b && !b.disabled && /^send/i.test(b.getAttribute('aria-label')) && hasText()) counted();
    }, true);
  }

  let push = null;
  if (PROVIDER !== 'gemini') {
    const collect = async () => {
      try {
        if (PROVIDER === 'claude') {
          const { settings = {} } = await chrome.storage.sync.get('settings');
          return await AIUT.fetchClaude(location.origin, settings.claudeOrg || '');
        }
        return await AIUT.fetchChatGPT(location.origin);
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    };
    push = async () => send({ type: 'aiut-usage', provider: PROVIDER, result: await collect() });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'aiut-refresh') {
        collect().then(sendResponse);
        return true;
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') push();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') push();
    }, 3 * 60 * 1000);
    push();
  }

  // A message was just sent from the page: log it, then refresh usage once the reply settles.
  let pending;
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__aiut !== true || e.data.type !== 'sent') return;
    if (PROVIDER === 'gemini') return;
    const model = typeof e.data.model === 'string' ? e.data.model : null;
    send({ type: 'aiut-msg', provider: PROVIDER, model });
    if (push) {
      clearTimeout(pending);
      pending = setTimeout(push, 15000);
    }
  });
})();
