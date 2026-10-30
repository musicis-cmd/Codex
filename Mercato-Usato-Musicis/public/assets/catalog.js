import { api, icon, escapeHTML as e, euro, getFavorites, toggleFavorite } from './common.js';
import { DEMO } from './demo.js';
const grid = document.querySelector('#product-grid');
const status = document.querySelector('#catalog-status');
const count = document.querySelector('#catalog-count');
const params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
let listings = [], category = '', favoritesOnly = false;
const search = document.querySelector('#catalog-search');
const sort = document.querySelector('#catalog-sort');
const favoriteFilter = document.querySelector('#favorites-only');
document.querySelector('#demo-notice').hidden = !demo;
function render() {
  const favorites = new Set(getFavorites());
  document.querySelector('#favorites-count').textContent = favorites.size;
  const query = search.value.trim().toLocaleLowerCase('it');
  let visible = listings.filter(item => (!category || item.category === category) && (!favoritesOnly || favorites.has(item.id)) && `${item.instrument} ${item.category} ${item.description} ${item.city}`.toLocaleLowerCase('it').includes(query));
  if (sort.value === 'price-asc') visible.sort((a, b) => a.price - b.price);
  if (sort.value === 'price-desc') visible.sort((a, b) => b.price - a.price);
  if (sort.value === 'recent') visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  count.textContent = `${visible.length} ${visible.length === 1 ? 'strumento' : 'strumenti'}${demo ? ' di esempio' : ' disponibili'}`;
  status.textContent = `${visible.length} ${visible.length === 1 ? 'annuncio trovato' : 'annunci trovati'}${category ? ` · ${category}` : ''}.`;
  status.classList.add('sr-only');
  if (!visible.length) {
    const empty = !listings.length;
    grid.innerHTML = `<div class="empty-state">${icon(empty ? 'music' : 'search')}<h3>${empty ? 'Il prossimo annuncio potrebbe essere il tuo.' : 'Facciamo spazio a un’altra ricerca.'}</h3><p>${empty ? 'Il mercato è pronto ad accogliere nuove storie. Proponi il tuo strumento: dopo la verifica, comparirà qui.' : favoritesOnly ? 'Nessuno strumento salvato corrisponde ai filtri. Usa il cuore su un annuncio per ritrovarlo qui.' : 'Nessun annuncio corrisponde ai filtri selezionati. Prova un’altra categoria o una ricerca diversa.'}</p>${empty ? `<a class="btn" href="./vendi.html">Proponi il primo strumento ${icon('plus')}</a><a class="text-link" href="./index.html?demo=1#annunci">Guarda un esempio ${icon('arrow-up')}</a>` : '<button type="button" class="btn btn-outline" id="reset-filters">Azzera i filtri</button>'}</div>`;
    document.querySelector('#reset-filters')?.addEventListener('click', () => {
      category = ''; favoritesOnly = false; favoriteFilter.setAttribute('aria-pressed', 'false'); search.value = ''; sort.value = 'recent';
      document.querySelectorAll('.category-tab').forEach(button => button.setAttribute('aria-pressed', String(!button.dataset.category)));
      render(); search.focus();
    });
    return;
  }
  grid.innerHTML = visible.map(item => {
    const href = `./annuncio.html?id=${encodeURIComponent(item.id)}`;
    return `<article class="product-card" data-id="${e(item.id)}"><div class="product-picture"><a href="${href}" tabindex="-1" aria-hidden="true"><img src="${e(item.photos[0])}" alt="" loading="lazy" width="480" height="480"></a><span class="product-tag">${demo ? 'ESEMPIO · NON IN VENDITA' : e(item.condition)}</span><button type="button" class="favorite-btn" data-favorite="${e(item.id)}" aria-label="Salva ${e(item.instrument)}" aria-pressed="${favorites.has(item.id)}">${icon('heart')}</button></div><div class="product-info"><p class="category">${e(item.category)}</p><h3><a href="${href}">${e(item.instrument)}</a></h3><div class="product-meta"><span class="condition-dot"></span><span>${e(item.condition)}</span>${item.city ? `<span>·</span><span>${e(item.city)}</span>` : ''}</div><div class="product-bottom"><strong class="product-price">${euro(item.price)}</strong><span>Prezzo indicativo</span></div></div></article>`;
  }).join('');
}
document.querySelectorAll('.category-tab').forEach(button => button.addEventListener('click', () => {
  category = button.dataset.category;
  document.querySelectorAll('.category-tab').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
  render();
}));
search.addEventListener('input', render); sort.addEventListener('change', render);
favoriteFilter.addEventListener('click', () => { favoritesOnly = !favoritesOnly; favoriteFilter.setAttribute('aria-pressed', String(favoritesOnly)); render(); });
grid.addEventListener('click', event => {
  const button = event.target.closest('[data-favorite]');
  if (!button) return;
  const id = button.dataset.favorite;
  toggleFavorite(id); render();
  grid.querySelector(`[data-favorite="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
});
window.addEventListener('storage', render);
try {
  listings = demo ? DEMO : (await api('listings')).listings;
  render();
} catch (error) {
  status.textContent = error.message;
  count.textContent = 'Catalogo non disponibile';
  grid.innerHTML = `<div class="empty-state">${icon('info')}<h3>Il mercato torna tra poco.</h3><p>${e(error.message)} Nessun annuncio è stato caricato.</p><button class="btn btn-outline" id="retry-catalog" type="button">Riprova</button></div>`;
  document.querySelector('#retry-catalog').addEventListener('click', () => location.reload());
}
