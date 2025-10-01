// Load header/footer partials into placeholders, then init helpers
async function loadPartials() {
  // Replace each <div data-include="..."> with the fetched HTML
  const zones = document.querySelectorAll('[data-include]');
  for (const z of zones) {
    const url = z.getAttribute('data-include');
    const res = await fetch(url);         
    const html = await res.text();
    z.outerHTML = html;
  }
  markActiveLink();
  initFooterYear();
  initVisitorCounter(); 
}

function markActiveLink() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(a => {
    const target = a.getAttribute('href').split('/').pop() || 'index.html';
    a.setAttribute('aria-current', target === here ? 'page' : 'false');
  });
}

function initFooterYear() {
  const y = document.getElementById('y');
  if (y) y.textContent = new Date().getFullYear();
}

function initVisitorCounter() {
  const el = document.getElementById('visitor-count');
  if (!el) return;

  // Set this as an Amplify env var (step 7) or hardcode temporarily
  const COUNTER_API = window.COUNTER_API_URL || 'https://bvtfd619y9.execute-api.us-east-1.amazonaws.com/prod/counter';

  const host = location.hostname || 'local';
  let path = location.pathname || '/';
  path = path.replace(/index\.html$/i, '');
  if (!path) path = '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  const finalPath = path === '/' ? '' : path;
  const SITE_ID = `${host}${finalPath}`; // counts per page
  const key = SITE_ID || host;
  const stampKey = 'vc-stamp-' + key;
  const today = new Date().toISOString().slice(0,10);
  const shouldHit = localStorage.getItem(stampKey) !== today;

  const url = `${COUNTER_API}?site=${encodeURIComponent(key)}`;
  const opts = shouldHit ? { method: 'POST' } : { method: 'GET' };

  fetch(url, opts)
    .then(r => r.text())
    .then(text => {
      let payload = text;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (_) { /* noop */ }
      }
      if (payload && typeof payload.body === 'string') {
        try { payload = JSON.parse(payload.body); } catch (_) { /* noop */ }
      } else if (payload && payload.body && typeof payload.body === 'object') {
        payload = payload.body;
      }

      const candidates = [payload];
      if (payload && typeof payload === 'object') {
        candidates.push(payload.count, payload.value, payload.total, payload.visits, payload.Count, payload.Total);
        if (payload.Item) {
          candidates.push(payload.Item.count, payload.Item.value, payload.Item.total, payload.Item.Count, payload.Item.Total);
          if (payload.Item.count && typeof payload.Item.count === 'object') {
            candidates.push(payload.Item.count.N);
          }
        }
        if (payload.Attributes) {
          candidates.push(payload.Attributes.count, payload.Attributes.value, payload.Attributes.total);
          if (payload.Attributes.count && typeof payload.Attributes.count === 'object') {
            candidates.push(payload.Attributes.count.N);
          }
        }
        if (Array.isArray(payload.Items)) {
          payload.Items.forEach(item => {
            if (item && typeof item === 'object') {
              candidates.push(item.count, item.value, item.total, item.Count, item.Total);
              Object.values(item).forEach(v => {
                if (v && typeof v === 'object' && 'N' in v) {
                  candidates.push(v.N);
                }
              });
            }
          });
        }
        if (payload.Item && typeof payload.Item === 'object') {
          Object.values(payload.Item).forEach(v => {
            if (v && typeof v === 'object' && 'N' in v) candidates.push(v.N);
          });
        }
      }

      let value = null;
      for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          value = candidate;
          break;
        }
        if (typeof candidate === 'string') {
          const numeric = Number(candidate.replace(/[,\s]/g, ''));
          if (Number.isFinite(numeric)) {
            value = numeric;
            break;
          }
        }
      }

      el.textContent = (value !== null) ? value.toLocaleString() : '—';
      if (value !== null && shouldHit) localStorage.setItem(stampKey, today);
    })
    .catch(() => { el.textContent = '—'; });
}

document.addEventListener('DOMContentLoaded', loadPartials);
