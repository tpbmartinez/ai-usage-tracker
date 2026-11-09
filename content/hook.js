// Runs in the page's own JS world (MAIN) at document_start on claude.ai and chatgpt.com.
// Spots "send message" requests so the extension can count messages and refresh usage right after.
// It reads only the model name (when the request body has one); prompts are never read or forwarded.
(() => {
  const SEND_PATH = new RegExp([
    '^/backend-api/(f/)?conversation$', // ChatGPT
    '^/api/organizations/[^/]+/chat_conversations/[^/]+/(completion|retry_completion)$', // Claude
  ].join('|'));
  // Gemini is handled in site.js: it now streams prompts over a cross-origin channel, so sends are detected from the UI.

  function report(method, url, body) {
    try {
      if (String(method || 'GET').toUpperCase() !== 'POST' || !url) return;
      const u = new URL(url, location.href);
      if (u.origin !== location.origin || !SEND_PATH.test(u.pathname)) return;
      let model = null;
      if (typeof body === 'string' && body[0] === '{') {
        try {
          model = JSON.parse(body).model || null;
        } catch {}
      }
      window.postMessage({ __aiut: true, type: 'sent', model: typeof model === 'string' ? model : null }, location.origin);
    } catch {}
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url;
    const method = (init && init.method) || (input instanceof Request ? input.method : 'GET');
    report(method, url, init && init.body);
    return origFetch.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__aiut = { method, url: String(url) };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__aiut) report(this.__aiut.method, this.__aiut.url, body);
    return origSend.apply(this, arguments);
  };
})();
