import { api, escapeHTML as e, euro, date, toast } from './common.js';
const loginPanel = document.querySelector('#admin-login-panel');
const dashboard = document.querySelector('#admin-dashboard');
const filter = document.querySelector('#admin-filter');
const list = document.querySelector('#admin-listings');
const status = document.querySelector('#admin-status');
const labels = { pending: 'Da verificare', published: 'Pubblicato', sold: 'Venduto', rejected: 'Rifiutato' };
let listings = [];
function render() {
  const items = listings.filter(item => !filter.value || item.status === filter.value);
  status.textContent = `${items.length} annunci · ${listings.filter(item => item.status === 'pending').length} in attesa di verifica`;
  list.innerHTML = items.length ? items.map(item => `<article class="admin-card" data-id="${e(item.id)}"><img src="${e(item.photos[0])}" alt="${e(item.instrument)}" loading="lazy"><div><p class="admin-status">${labels[item.status]} · ${date(item.createdAt)}</p><h2>${e(item.instrument)} · ${euro(item.price)}</h2><p><strong>${e(item.firstName)} ${e(item.lastName)}</strong> · <a href="mailto:${e(item.email)}">${e(item.email)}</a> · <a href="tel:${e(item.phone.replace(/[^+\d]/g, ''))}">${e(item.phone)}</a></p><p>${e(item.category)} · ${e(item.condition)}${item.city ? ` · ${e(item.city)}` : ''}</p><p class="detail-description">${e(item.description)}</p><p class="hint">Codice: ${e(item.id)} · Informativa: ${e(item.consentVersion)}</p><div class="admin-gallery">${item.photos.map((photo, index) => `<a href="${e(photo)}" target="_blank" rel="noopener" aria-label="Apri foto ${index + 1}"><img src="${e(photo)}" alt="Foto ${index + 1}"></a>`).join('')}</div><div class="admin-actions">${item.status !== 'published' ? '<button class="btn btn-small" data-action="published">Approva e pubblica</button>' : '<button class="btn btn-small btn-outline" data-action="pending">Ritira dal catalogo</button>'}${item.status !== 'sold' ? '<button class="btn btn-small btn-outline" data-action="sold">Segna venduto</button>' : ''}${item.status !== 'rejected' ? '<button class="btn btn-small btn-outline" data-action="rejected">Rifiuta</button>' : ''}<button class="btn btn-small btn-outline btn-danger" data-action="delete">Elimina dati e foto</button></div>${item.inquiries.length ? `<div class="admin-inquiries"><h3>Richieste di interesse (${item.inquiries.length})</h3>${item.inquiries.map(inquiry => `<div class="admin-inquiry"><p><strong>${e(inquiry.name)}</strong> · <a href="mailto:${e(inquiry.email)}">${e(inquiry.email)}</a> · ${date(inquiry.created_at)}</p><p class="detail-description">${e(inquiry.message)}</p></div>`).join('')}</div>` : '<p class="hint">Nessuna richiesta di interesse.</p>'}</div></article>`).join('') : '<div class="empty-state"><h2>Nessun annuncio in questo stato.</h2></div>';
}
async function load() {
  try {
    listings = (await api('admin/listings')).listings;
    loginPanel.hidden = true; dashboard.hidden = false; render();
  } catch (error) {
    if (error.status === 401) { loginPanel.hidden = false; dashboard.hidden = true; }
    else { status.textContent = error.message; toast(error.message); }
  }
}
document.querySelector('#admin-login').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button');
  button.disabled = true; const errorNode = document.querySelector('#admin-error'); errorNode.hidden = true;
  try {
    await api('admin/login', { method: 'POST', body: JSON.stringify({ password: form.elements.password.value }) });
    form.reset(); await load(); document.querySelector('#admin-filter').focus();
  } catch (error) { errorNode.textContent = error.message; errorNode.hidden = false; }
  finally { button.disabled = false; }
});
filter.addEventListener('change', render);
document.querySelector('#admin-refresh').addEventListener('click', load);
document.querySelector('#admin-logout').addEventListener('click', async () => {
  try { await api('admin/logout', { method: 'POST' }); listings = []; list.innerHTML = ''; loginPanel.hidden = false; dashboard.hidden = true; document.querySelector('#admin-password').focus(); }
  catch (error) { toast(error.message); }
});
list.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action, id = button.closest('[data-id]').dataset.id;
  if (action === 'delete' && !confirm('Eliminare definitivamente annuncio, dati personali, foto e richieste collegate? Questa operazione non può essere annullata.')) return;
  button.disabled = true;
  try {
    await api(`admin/listings/${encodeURIComponent(id)}`, { method: action === 'delete' ? 'DELETE' : 'PATCH', ...(action === 'delete' ? {} : { body: JSON.stringify({ status: action }) }) });
    toast(action === 'delete' ? 'Annuncio e dati collegati eliminati.' : 'Stato dell’annuncio aggiornato.'); await load();
  } catch (error) { toast(error.message); button.disabled = false; if (error.status === 401) await load(); }
});
await load();
