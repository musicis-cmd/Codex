import { api, icon, escapeHTML as e, euro, date, toast } from './common.js';
import { DEMO } from './demo.js';
const root = document.querySelector('#detail-root');
const status = document.querySelector('#detail-status');
const id = new URLSearchParams(location.search).get('id');
const demo = id?.startsWith('demo-');
try {
  if (!id) throw new Error('Seleziona uno strumento dal catalogo per visualizzare l’annuncio.');
  const item = demo ? DEMO.find(item => item.id === id) : await api(`listings/${encodeURIComponent(id)}`);
  if (!item) throw new Error('Annuncio non disponibile.');
  document.title = `${item.instrument} | Mercato Usato Musicis`;
  status.hidden = true;
  root.innerHTML = `${demo ? '<p class="demo-notice">ANTEPRIMA · Annuncio illustrativo, non in vendita. Il modulo di interesse è disabilitato.</p>' : ''}<article class="detail-layout"><div><img id="main-photo" class="main-photo" src="${e(item.photos[0])}" alt="${e(item.instrument)} · foto 1" width="700" height="640"><div class="thumbnails" aria-label="Foto dello strumento">${item.photos.map((photo, index) => `<button type="button" data-photo="${index}" aria-pressed="${index === 0}" aria-label="Visualizza foto ${index + 1}"><img src="${e(photo)}" alt="" width="75" height="70"></button>`).join('')}</div></div><div class="detail-copy"><p class="eyebrow">${e(item.category)}</p><h1>${e(item.instrument)}</h1><p class="detail-price">${euro(item.price)}</p><p class="price-caption">Prezzo indicativo richiesto dal proponente</p><dl class="specs"><div><dt>Condizioni</dt><dd>${e(item.condition)}</dd></div>${item.city ? `<div><dt>Città</dt><dd>${e(item.city)}</dd></div>` : ''}<div><dt>Proposta del</dt><dd>${date(item.createdAt)}</dd></div><div><dt>Disponibilità</dt><dd>${demo ? 'Esempio, non in vendita' : item.status === 'sold' ? 'Venduto' : 'Annuncio pubblicato'}</dd></div></dl><h2>La sua storia.</h2><p class="detail-description">${e(item.description)}</p><div class="detail-contact"><h2>È il suono che cercavi?</h2><p>Lascia una richiesta di interesse a Musicis. Non è una prenotazione né un acquisto. I recapiti del proponente rimangono riservati.</p>${demo || item.status === 'sold' ? `<p class="form-message">${demo ? 'Questo annuncio è dimostrativo: non è possibile inviare richieste.' : 'Questo strumento risulta venduto. Esplora gli altri annunci.'}</p><a class="text-link" href="./index.html${demo ? '?demo=1' : ''}#annunci">Torna al catalogo ${icon('arrow')}</a>` : `<form id="inquiry-form"><div class="fields"><div class="field"><label for="contact-name">Nome *</label><input id="contact-name" name="name" autocomplete="name" minlength="2" maxlength="100" required></div><div class="field"><label for="contact-email">Email *</label><input id="contact-email" name="email" type="email" autocomplete="email" maxlength="254" required></div><div class="field full"><label for="contact-message">Il tuo messaggio *</label><textarea id="contact-message" name="message" minlength="10" maxlength="2000" required placeholder="Cosa vorresti sapere su questo strumento?"></textarea></div></div><label class="checkbox-label"><input type="checkbox" name="consent" required><span>Ho letto l’<a href="./privacy.html" target="_blank" rel="noopener">informativa privacy</a> e richiedo la gestione della mia richiesta. *</span></label><label class="hp-field" aria-hidden="true">Sito web<input name="website" tabindex="-1" autocomplete="off"></label><button class="btn" type="submit">Richiedi informazioni ${icon('arrow')}</button><p id="inquiry-result" class="form-message" role="status" hidden></p></form>`}</div></div></article>`;
  root.querySelectorAll('[data-photo]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.photo); const main = document.querySelector('#main-photo');
    main.src = item.photos[index]; main.alt = `${item.instrument} · foto ${index + 1}`;
    root.querySelectorAll('[data-photo]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
  }));
  document.querySelector('#inquiry-form')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type=submit]'); if (button.disabled) return;
    button.disabled = true; const result = document.querySelector('#inquiry-result'); result.hidden = true;
    try {
      const values = Object.fromEntries(new FormData(form)); values.consent = values.consent === 'on';
      await api(`listings/${encodeURIComponent(id)}/inquiries`, { method: 'POST', body: JSON.stringify(values) });
      form.innerHTML = `<div class="success-panel" tabindex="-1">${icon('check-circle')}<h2>Richiesta ricevuta.</h2><p>La tua richiesta è stata registrata nell’area Musicis. Musicis potrà contattarti all’indirizzo fornito. La richiesta non prenota lo strumento.</p></div>`;
      form.querySelector('.success-panel').focus(); toast('Richiesta registrata.');
    } catch (error) { result.textContent = error.message; result.classList.add('error'); result.hidden = false; button.disabled = false; }
  });
} catch (error) {
  status.hidden = true;
  root.innerHTML = `<div class="empty-state">${icon('info')}<h1>Questo strumento non è qui.</h1><p>${e(error.message)}</p><a class="btn" href="./index.html#annunci">Torna al mercato ${icon('arrow')}</a></div>`;
}
