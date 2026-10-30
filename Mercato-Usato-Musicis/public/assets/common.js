export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
export const euro = value => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
export const date = value => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(value));
export async function api(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`./api/${endpoint}`, { ...options, credentials: 'same-origin', headers: { 'X-Musicis-Request': '1', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch { throw new Error('Connessione non disponibile. Controlla la rete e riprova.'); }
  const result = await response.json().catch(() => ({ error: 'Servizio annunci non disponibile. Apri il sito tramite il server Musicis.' }));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Operazione non riuscita.'), { status: response.status });
  return result;
}
let toastTimer;
export function toast(message) {
  const node = document.querySelector('#toast');
  if (!node) return;
  clearTimeout(toastTimer); node.textContent = message; node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 4000);
}
export function getFavorites() {
  try { const data = JSON.parse(localStorage.getItem('musicis-favorites') || '[]'); return Array.isArray(data) ? data.filter(id => typeof id === 'string').slice(0, 1000) : []; }
  catch { return []; }
}
export function toggleFavorite(id) {
  const favorites = new Set(getFavorites());
  const active = !favorites.has(id);
  active ? favorites.add(id) : favorites.delete(id);
  try { localStorage.setItem('musicis-favorites', JSON.stringify([...favorites])); }
  catch { toast('Il browser non consente di salvare i preferiti.'); return false; }
  document.dispatchEvent(new CustomEvent('favorites-changed'));
  toast(active ? 'Strumento aggiunto ai tuoi salvati.' : 'Strumento rimosso dai salvati.');
  return active;
}
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-nav');
function closeMenu() { nav?.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); menu?.setAttribute('aria-label', 'Apri menu'); }
menu?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Chiudi menu' : 'Apri menu');
});
nav?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js-motion');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(node => observer.observe(node));
}
