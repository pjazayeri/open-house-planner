(function () {
  'use strict';

  const APP_URL = 'https://open-house-planner.vercel.app';
  const ROOT_ID = 'ohp-ext-root';

  let mlsId = null;
  let appState = null; // { hiddenIds, priorityIds, visits, listingSnapshots }
  let panelOpen = false;

  // ── SPA navigation ──────────────────────────────────────────────────────────
  // Redfin is a React SPA; detect URL changes and re-init.

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      reset();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  function reset() {
    document.getElementById(ROOT_ID)?.remove();
    mlsId = null;
    appState = null;
    panelOpen = false;
    if (isListingPage()) waitForMlsAndInit();
  }

  // ── Page detection ───────────────────────────────────────────────────────────

  function isListingPage() {
    return /\/home\/\d+/.test(location.pathname);
  }

  // ── MLS# extraction ──────────────────────────────────────────────────────────
  // Redfin renders MLS# in the listing facts section as text like "MLS# 426108943".

  function extractMlsId() {
    const text = document.body?.innerText ?? '';
    const m = text.match(/MLS[#\s:]+(\d{6,10})/i);
    return m ? m[1] : null;
  }

  function getListingAddress() {
    // Try the page <h1> first, then fall back to title
    const h1 = document.querySelector('[data-rf-test-name="abp-streetLine"], h1');
    if (h1) return h1.innerText.split('\n')[0].trim();
    const m = document.title.match(/^(.+?)\s*[|–\-]/);
    return m ? m[1].trim() : `MLS# ${mlsId}`;
  }

  // ── Background fetch ─────────────────────────────────────────────────────────

  function bgFetch(url, method = 'GET', body = undefined) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'fetch', url, method, body }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!resp || !resp.ok) {
          reject(new Error(resp?.error ?? `HTTP ${resp?.status}`));
          return;
        }
        resolve(resp.data);
      });
    });
  }

  async function loadState() {
    const json = await bgFetch(`${APP_URL}/api/sync`);
    // JSONBin returns { record: CloudState, metadata: {...} }
    return json.record ?? json;
  }

  async function saveState(state) {
    await bgFetch(`${APP_URL}/api/sync`, 'PUT', state);
  }

  // ── Trigger button ───────────────────────────────────────────────────────────

  function renderTrigger(root) {
    const visit = appState?.visits?.[mlsId];
    const rating = visit?.rating;
    const label = visit
      ? (rating ? `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` : '✓ Visited')
      : 'Notes';

    root.innerHTML = `
      <button class="ohp-trigger${visit ? ' ohp-trigger--active' : ''}" id="ohp-trigger" title="Open House Planner notes">
        <svg class="ohp-trigger-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 12L12 3l9 9v10a1 1 0 01-1 1H14v-6h-4v6H4a1 1 0 01-1-1V12z"/>
        </svg>
        <span class="ohp-trigger-label">${label}</span>
      </button>
      <div class="ohp-card" id="ohp-card" style="display:none"></div>
    `;

    root.querySelector('#ohp-trigger').addEventListener('click', togglePanel);
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    const card = document.getElementById('ohp-card');
    if (!card) return;
    if (panelOpen) {
      card.style.display = 'block';
      renderCard(card);
    } else {
      card.style.display = 'none';
    }
  }

  // ── Card ─────────────────────────────────────────────────────────────────────

  function renderCard(card) {
    const visit = appState?.visits?.[mlsId];
    const snapshots = appState?.listingSnapshots ?? {};
    const snapshot = snapshots[mlsId];
    const address = snapshot?.address ?? getListingAddress();

    card.innerHTML = `
      <div class="ohp-card-header">
        <div class="ohp-card-title-group">
          <div class="ohp-card-app-name">Open House Planner</div>
          <div class="ohp-card-address">${escHtml(address)}</div>
        </div>
        <div class="ohp-header-actions">
          <a class="ohp-app-link" href="${APP_URL}/#data" target="_blank" title="Open in app">↗</a>
          <button class="ohp-close-btn" id="ohp-close">✕</button>
        </div>
      </div>
      <div class="ohp-card-body">
        ${visit ? buildVisitedHtml(visit) : buildNotVisitedHtml()}
      </div>
    `;

    card.querySelector('#ohp-close').addEventListener('click', () => {
      panelOpen = false;
      card.style.display = 'none';
    });

    if (visit) {
      wireVisitedUI(card, visit);
    } else {
      card.querySelector('#ohp-mark-visited')?.addEventListener('click', markVisited);
    }
  }

  function buildVisitedHtml(visit) {
    const rating = visit.rating ?? 0;
    const stars = [1, 2, 3, 4, 5]
      .map(n => `<span class="ohp-star${n <= rating ? ' ohp-star--filled' : ''}" data-n="${n}">★</span>`)
      .join('');

    return `
      <div class="ohp-row ohp-row--between">
        <div class="ohp-like-group">
          <button class="ohp-like-btn${visit.liked === true ? ' ohp-like-btn--liked' : ''}" data-action="liked" title="Liked">👍</button>
          <button class="ohp-like-btn${visit.liked === false ? ' ohp-like-btn--disliked' : ''}" data-action="disliked" title="Disliked">👎</button>
        </div>
        <div class="ohp-stars" id="ohp-stars">${stars}</div>
      </div>
      <div class="ohp-field">
        <label class="ohp-field-label">Pros</label>
        <textarea class="ohp-textarea" id="ohp-pros" placeholder="What did you like?">${escHtml(visit.pros ?? '')}</textarea>
      </div>
      <div class="ohp-field">
        <label class="ohp-field-label">Cons</label>
        <textarea class="ohp-textarea" id="ohp-cons" placeholder="What didn't work?">${escHtml(visit.cons ?? '')}</textarea>
      </div>
      <label class="ohp-offer-label">
        <input type="checkbox" id="ohp-offer" class="ohp-offer-check"${visit.wantOffer ? ' checked' : ''}>
        Want to make an offer
      </label>
      <div class="ohp-card-footer">
        <span class="ohp-status" id="ohp-status"></span>
        <button class="ohp-save-btn" id="ohp-save">Save</button>
      </div>
    `;
  }

  function buildNotVisitedHtml() {
    return `
      <div class="ohp-not-visited">
        <p class="ohp-not-visited-text">No notes for this listing yet.</p>
        <div class="ohp-not-visited-actions">
          <button class="ohp-mark-btn" id="ohp-mark-visited">Mark as Visited</button>
          <a class="ohp-app-btn" href="${APP_URL}/#data" target="_blank">Open in App ↗</a>
        </div>
      </div>
    `;
  }

  // ── Visit UI wiring ──────────────────────────────────────────────────────────

  function wireVisitedUI(card, currentVisit) {
    const localVisit = { ...currentVisit };
    const starsEl = card.querySelector('#ohp-stars');
    const starEls = [...starsEl.querySelectorAll('.ohp-star')];

    // Star hover
    starsEl.addEventListener('mousemove', (e) => {
      const star = e.target.closest('.ohp-star');
      if (!star) return;
      const n = parseInt(star.dataset.n, 10);
      starEls.forEach((s, i) => s.classList.toggle('ohp-star--filled', i + 1 <= n));
    });
    starsEl.addEventListener('mouseleave', () => {
      starEls.forEach((s, i) => s.classList.toggle('ohp-star--filled', i + 1 <= (localVisit.rating ?? 0)));
    });

    // Star click
    starsEl.addEventListener('click', (e) => {
      const star = e.target.closest('.ohp-star');
      if (!star) return;
      const n = parseInt(star.dataset.n, 10);
      localVisit.rating = localVisit.rating === n ? null : n;
      starEls.forEach((s, i) => s.classList.toggle('ohp-star--filled', i + 1 <= (localVisit.rating ?? 0)));
    });

    // Like / dislike
    card.querySelectorAll('.ohp-like-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const isLiked = btn.dataset.action === 'liked';
        const newVal = isLiked ? true : false;
        localVisit.liked = localVisit.liked === newVal ? null : newVal;
        card.querySelector('[data-action="liked"]').classList.toggle('ohp-like-btn--liked', localVisit.liked === true);
        card.querySelector('[data-action="disliked"]').classList.toggle('ohp-like-btn--disliked', localVisit.liked === false);
      });
    });

    // Save
    card.querySelector('#ohp-save').addEventListener('click', async () => {
      localVisit.pros = card.querySelector('#ohp-pros').value;
      localVisit.cons = card.querySelector('#ohp-cons').value;
      localVisit.wantOffer = card.querySelector('#ohp-offer').checked;

      const statusEl = card.querySelector('#ohp-status');
      statusEl.textContent = 'Saving…';
      statusEl.className = 'ohp-status';

      try {
        const newState = { ...appState, visits: { ...appState.visits, [mlsId]: localVisit } };
        await saveState(newState);
        appState = newState;
        statusEl.textContent = 'Saved ✓';
        statusEl.className = 'ohp-status ohp-status--ok';
        // Update trigger label
        renderTrigger(document.getElementById(ROOT_ID));
        // Re-open panel
        const newCard = document.getElementById('ohp-card');
        newCard.style.display = 'block';
        renderCard(newCard);
      } catch (e) {
        statusEl.textContent = 'Save failed';
        statusEl.className = 'ohp-status ohp-status--err';
        console.error('[OHP]', e);
      }
    });
  }

  // ── Mark as visited ──────────────────────────────────────────────────────────

  async function markVisited() {
    const newVisit = {
      visitedAt: new Date().toISOString(),
      liked: null,
      rating: null,
      pros: '',
      cons: '',
      wantOffer: false,
    };
    try {
      const newState = { ...appState, visits: { ...appState.visits, [mlsId]: newVisit } };
      await saveState(newState);
      appState = newState;
      // Re-render trigger + panel
      const root = document.getElementById(ROOT_ID);
      renderTrigger(root);
      const card = document.getElementById('ohp-card');
      card.style.display = 'block';
      panelOpen = true;
      renderCard(card);
    } catch (e) {
      console.error('[OHP] markVisited failed:', e);
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  async function waitForMlsAndInit() {
    // Redfin renders dynamically — poll until MLS# appears in the DOM.
    for (let i = 0; i < 24; i++) {
      mlsId = extractMlsId();
      if (mlsId) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!mlsId) return;

    try {
      appState = await loadState();
    } catch (e) {
      console.warn('[OHP] Could not load state:', e.message);
      return;
    }

    // Inject root
    if (document.getElementById(ROOT_ID)) return; // already injected (race guard)
    const root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
    renderTrigger(root);
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Entry ────────────────────────────────────────────────────────────────────

  if (isListingPage()) waitForMlsAndInit();
})();
