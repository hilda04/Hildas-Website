(function(){
  const API_BASE = (window.PORTFOLIO_API_BASE || '').trim().replace(/\/+$/, '');
  const MEDIA_BASE = (window.PORTFOLIO_MEDIA_BASE || '').trim().replace(/\/+$/, '');
  const ADMIN_KEY = window.PORTFOLIO_ADMIN_KEY || '';

  const form = document.getElementById('item-form');
  const titleInput = document.getElementById('title');
  const summaryInput = document.getElementById('summary');
  const linkInput = document.getElementById('link');
  const tagsInput = document.getElementById('tags');
  const featuredInput = document.getElementById('featured');
  const imageInput = document.getElementById('image');
  const formStatus = document.getElementById('form-status');
  const formTitle = document.getElementById('form-title');
  const resetBtn = document.getElementById('reset-btn');
  const saveBtn = document.getElementById('save-btn');
  const currentImageWrap = document.getElementById('current-image-wrap');
  const currentImage = document.getElementById('current-image');
  const configWarning = document.getElementById('config-warning');
  const loadingState = document.getElementById('loading-state');
  const emptyState = document.getElementById('empty-state');
  const listEl = document.getElementById('items-list');
  const refreshBtn = document.getElementById('refresh-btn');

  let editingId = null;
  let items = [];

  function setFormStatus(message, type){
    if (!formStatus) return;
    if (!message){
      formStatus.textContent = '';
      formStatus.hidden = true;
      formStatus.removeAttribute('data-type');
      return;
    }
    formStatus.textContent = message;
    formStatus.dataset.type = type || 'info';
    formStatus.hidden = false;
  }

  function disableForm(disabled){
    if (!form) return;
    form.querySelectorAll('input, textarea, button').forEach(el => {
      if (!el) return;
      el.disabled = disabled;
    });
  }

  function normaliseTags(value){
    if (!value) return [];
    return value.split(',').map(t => t.trim()).filter(Boolean);
  }

  function formatDate(value){
    if (!value) return '';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return '';
      return date.toLocaleString();
    } catch (err) {
      return '';
    }
  }

  function buildImageUrl(item){
    if (!item) return '';
    if (item.imageUrl) return item.imageUrl;
    if (item.imageKey){
      if (MEDIA_BASE) return `${MEDIA_BASE}/${item.imageKey}`;
      return item.imageKey;
    }
    return '';
  }

  function renderItems(){
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!items.length){
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    const frag = document.createDocumentFragment();
    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'item-card';
      card.dataset.id = item.id;
      const header = document.createElement('div');
      header.className = 'item-card-header';
      const h3 = document.createElement('h3');
      h3.textContent = item.title || 'Untitled project';
      const actions = document.createElement('div');
      actions.className = 'item-card-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.dataset.action = 'edit';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'danger';
      deleteBtn.dataset.action = 'delete';
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      header.appendChild(h3);
      header.appendChild(actions);
      card.appendChild(header);

      const imageUrl = buildImageUrl(item);
      if (imageUrl){
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = item.imageAlt || `${item.title || 'Project'} preview`;
        card.appendChild(img);
      }

      if (item.summary){
        const summary = document.createElement('p');
        summary.textContent = item.summary;
        card.appendChild(summary);
      }

      if (item.link){
        const link = document.createElement('p');
        const anchor = document.createElement('a');
        anchor.href = item.link;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.textContent = 'Open link →';
        link.appendChild(anchor);
        card.appendChild(link);
      }

      const meta = document.createElement('p');
      meta.className = 'item-meta';
      const created = formatDate(item.createdAt);
      const updated = formatDate(item.updatedAt);
      meta.textContent = `Created ${created || '—'} · Updated ${updated || created || '—'}`;
      card.appendChild(meta);

      const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
      if (tags.length){
        const tagRow = document.createElement('div');
        tagRow.className = 'tag-row';
        tags.forEach(tag => {
          const pill = document.createElement('span');
          pill.className = 'pill';
          pill.textContent = `#${tag}`;
          tagRow.appendChild(pill);
        });
        card.appendChild(tagRow);
      }

      frag.appendChild(card);
    });
    listEl.appendChild(frag);
  }

  function setEditing(item){
    if (!form) return;
    editingId = item ? item.id : null;
    if (!item){
      form.reset();
      if (currentImageWrap) {
        currentImageWrap.hidden = true;
        if (currentImage) currentImage.removeAttribute('src');
      }
      if (formTitle) formTitle.textContent = 'Create new portfolio item';
      if (saveBtn) saveBtn.textContent = 'Save item';
      return;
    }
    if (formTitle) formTitle.textContent = 'Edit portfolio item';
    if (saveBtn) saveBtn.textContent = 'Update item';
    titleInput.value = item.title || '';
    summaryInput.value = item.summary || '';
    linkInput.value = item.link || '';
    tagsInput.value = Array.isArray(item.tags) ? item.tags.join(', ') : '';
    featuredInput.checked = Boolean(item.featured);
    imageInput.value = '';
    const imageUrl = buildImageUrl(item);
    if (imageUrl){
      if (currentImage) currentImage.src = imageUrl;
      if (currentImageWrap) currentImageWrap.hidden = false;
    } else if (currentImageWrap){
      currentImageWrap.hidden = true;
      if (currentImage) currentImage.removeAttribute('src');
    }
    setFormStatus('', 'info');
  }

  function getHeaders(isJson){
    const headers = {};
    if (isJson) headers['Content-Type'] = 'application/json';
    if (ADMIN_KEY) headers['x-admin-key'] = ADMIN_KEY;
    return headers;
  }

  async function loadItems(showStatus){
    if (!API_BASE){
      if (configWarning) configWarning.hidden = false;
      if (loadingState) loadingState.textContent = 'Configure window.PORTFOLIO_API_BASE to begin.';
      return;
    }
    if (configWarning) configWarning.hidden = true;
    if (loadingState) {
      loadingState.textContent = 'Loading portfolio items…';
      loadingState.hidden = false;
    }
    try {
      const res = await fetch(`${API_BASE}/items`, {
        method: 'GET',
        headers: getHeaders(false)
      });
      if (!res.ok) throw new Error(`Failed to load items (${res.status})`);
      const payload = await res.json();
      items = Array.isArray(payload) ? payload : (payload.items || []);
      renderItems();
      if (loadingState) {
        loadingState.textContent = '';
        loadingState.hidden = true;
      }
      if (showStatus) setFormStatus('Latest data loaded.', 'success');
    } catch (err) {
      console.error(err);
      if (loadingState) {
        loadingState.textContent = 'Unable to load items. Check the API URL, admin key, and CORS settings.';
        loadingState.hidden = false;
      }
      setFormStatus(err.message, 'error');
    }
  }

  async function requestUpload(id, file){
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}/upload-url`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || 'application/octet-stream'
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to get upload URL');
    }
    return res.json();
  }

  async function uploadImage(uploadUrl, file){
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!res.ok) throw new Error('Image upload failed.');
  }

  async function createItem(payload){
    const res = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to create item');
    }
    return res.json();
  }

  async function updateItem(id, payload){
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to update item');
    }
    return res.json();
  }

  async function deleteItem(id){
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(false)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to delete item');
    }
    return res.json();
  }

  async function handleSubmit(event){
    event.preventDefault();
    if (!API_BASE){
      setFormStatus('API base URL is not configured.', 'error');
      return;
    }
    const title = titleInput.value.trim();
    const summary = summaryInput.value.trim();
    if (!title || !summary){
      setFormStatus('Title and summary are required.', 'error');
      return;
    }
    const payload = {
      title,
      summary,
      link: linkInput.value.trim() || undefined,
      tags: normaliseTags(tagsInput.value),
      featured: featuredInput.checked
    };
    const file = imageInput.files && imageInput.files[0];

    disableForm(true);
    setFormStatus('Saving…', 'info');

    try {
      if (editingId){
        await updateItem(editingId, payload);
        if (file){
          const uploadMeta = await requestUpload(editingId, file);
          await uploadImage(uploadMeta.uploadUrl, file);
          await updateItem(editingId, { imageKey: uploadMeta.objectKey, imageAlt: payload.title });
        }
        await loadItems(false);
        const updated = items.find(i => i.id === editingId);
        if (updated){
          setEditing(updated);
        }
        setFormStatus('Project updated.', 'success');
      } else {
        const created = await createItem(payload);
        const item = created.item || created;
        if (file && item && item.id){
          const uploadMeta = await requestUpload(item.id, file);
          await uploadImage(uploadMeta.uploadUrl, file);
          await updateItem(item.id, { imageKey: uploadMeta.objectKey, imageAlt: payload.title });
        }
        await loadItems(false);
        setEditing(null);
        setFormStatus('Project created.', 'success');
      }
    } catch (err) {
      console.error(err);
      setFormStatus(err.message || 'Save failed.', 'error');
    } finally {
      disableForm(false);
      imageInput.value = '';
    }
  }

  function handleListClick(event){
    const button = event.target.closest('button');
    if (!button || !button.dataset.action) return;
    const card = button.closest('.item-card');
    if (!card) return;
    const id = card.dataset.id;
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (button.dataset.action === 'edit'){
      setEditing(item);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (button.dataset.action === 'delete'){
      if (!confirm('Delete this project? This will remove it from the public site.')) return;
      disableForm(true);
      setFormStatus('Deleting…', 'warning');
      deleteItem(id)
        .then(() => loadItems(false))
        .then(() => {
          if (editingId === id) setEditing(null);
          setFormStatus('Project deleted.', 'success');
        })
        .catch(err => {
          console.error(err);
          setFormStatus(err.message || 'Delete failed.', 'error');
        })
        .finally(() => disableForm(false));
    }
  }

  function handleReset(){
    setEditing(null);
    setFormStatus('', 'info');
  }

  function init(){
    if (!form) return;
    form.addEventListener('submit', handleSubmit);
    if (listEl) listEl.addEventListener('click', handleListClick);
    if (resetBtn) resetBtn.addEventListener('click', handleReset);
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadItems(true));
    if (API_BASE) {
      loadItems(false);
    } else if (configWarning) {
      configWarning.hidden = false;
    }
    if (!ADMIN_KEY){
      setFormStatus('Warning: window.PORTFOLIO_ADMIN_KEY is not set; secured endpoints may reject requests.', 'warning');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
