// Service worker — handles cross-origin fetches on behalf of the content script.
// Content scripts on redfin.com can't fetch open-house-planner.vercel.app directly
// due to CORS, but service workers in extensions bypass this restriction.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'fetch') return;

  const { url, method = 'GET', body } = message;

  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
  })
    .then(async (r) => {
      const data = await r.json().catch(() => null);
      sendResponse({ ok: r.ok, status: r.status, data });
    })
    .catch((err) => {
      sendResponse({ ok: false, status: 0, error: err.message });
    });

  return true; // Keep message channel open for async response
});
