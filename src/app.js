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

  const SITE_ID = (location.hostname || 'local') + location.pathname; // counts per page
  const stampKey = 'vc-stamp-' + SITE_ID;
  const today = new Date().toISOString().slice(0,10);
  const shouldHit = localStorage.getItem(stampKey) !== today;

  const url = `${COUNTER_API}?site=${encodeURIComponent(SITE_ID)}`;
  const opts = shouldHit ? { method: 'POST' } : { method: 'GET' };

  fetch(url, opts)
    .then(r => r.json())
    .then(d => {
      const value = (typeof d.count === 'number') ? d.count
                 : (typeof d.value === 'number') ? d.value
                 : (typeof d.total === 'number') ? d.total
                 : (d && d.Item && typeof d.Item.count === 'number') ? d.Item.count
                 : null;
      el.textContent = (typeof value === 'number') ? value.toLocaleString() : '—';
      if (shouldHit) localStorage.setItem(stampKey, today);
    })
    .catch(() => { el.textContent = '—'; });
}

document.addEventListener('DOMContentLoaded', loadPartials);
