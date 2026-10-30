import { icon, escapeHTML as e } from './common.js';
const form = document.querySelector('#sell-form');
const input = document.querySelector('#photos');
const zone = document.querySelector('#upload-zone');
const grid = document.querySelector('#photo-grid');
const photoError = document.querySelector('#photo-error');
const submitError = document.querySelector('#submit-error');
const button = document.querySelector('#submit-listing');
let files = [], submitting = false;
function showError(node, message) { node.textContent = message; node.hidden = !message; }
function renderPhotos() {
  grid.innerHTML = files.map((item, index) => `<div class="photo-item"><img src="${item.url}" alt="Anteprima foto ${index + 1}: ${e(item.file.name)}"><button type="button" data-remove="${index}" aria-label="Rimuovi foto ${index + 1}">${icon('close')}</button>${index === 0 ? '<b>COPERTINA</b>' : ''}<span>${e(item.file.name)}</span></div>`).join('');
}
function addFiles(incoming) {
  if (submitting) return;
  const errors = [];
  for (const file of incoming) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { errors.push(`${file.name}: usa JPG, PNG o WebP.`); continue; }
    if (file.size > 8 * 1024 * 1024) { errors.push(`${file.name}: il limite è 8 MB per foto.`); continue; }
    if (files.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
    if (files.length >= 6) { errors.push('Puoi caricare al massimo 6 foto.'); break; }
    files.push({ file, url: URL.createObjectURL(file) });
  }
  input.value = ''; renderPhotos(); showError(photoError, errors.join(' '));
}
document.querySelector('#choose-photos').addEventListener('click', () => { if (!submitting) input.click(); });
input.addEventListener('change', () => addFiles(input.files));
zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('dragover'); addFiles(event.dataTransfer.files); });
grid.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  if (!remove || submitting) return;
  const index = Number(remove.dataset.remove);
  URL.revokeObjectURL(files[index].url); files.splice(index, 1); renderPhotos();
  (grid.querySelector(`[data-remove="${Math.min(index, files.length - 1)}"]`) || document.querySelector('#choose-photos')).focus();
});
form.addEventListener('focusin', event => {
  const section = event.target.closest('[data-step]');
  if (!section) return;
  document.querySelectorAll('.steps-tabs span').forEach(step => step.classList.toggle('active', step.id === `step-${section.dataset.step}`));
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || !form.reportValidity()) return;
  if (!files.length) {
    showError(photoError, 'Aggiungi almeno una foto del tuo strumento.');
    zone.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelector('#choose-photos').focus({ preventScroll: true }); return;
  }
  submitting = true; button.disabled = true; button.textContent = 'Invio in corso…';
  showError(submitError, ''); showError(photoError, '');
  const data = new FormData(form); data.delete('photos'); files.forEach(item => data.append('photos', item.file));
  const progressWrap = document.querySelector('#upload-progress-wrap');
  const progress = document.querySelector('#upload-progress');
  const progressLabel = document.querySelector('#upload-progress-label');
  progress.value = 0; progressWrap.hidden = false;
  try {
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', './api/listings'); xhr.setRequestHeader('X-Musicis-Request', '1'); xhr.timeout = 120000;
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          const percent = Math.round(event.loaded / event.total * 100); progress.value = percent;
          progressLabel.textContent = percent === 100 ? 'Foto inviate. Verifica e salvataggio in corso…' : `Caricamento foto: ${percent}%`;
        }
      };
      xhr.onload = () => {
        let result; try { result = JSON.parse(xhr.responseText); } catch { return reject(new Error('Il servizio di invio non è disponibile. La proposta non è stata confermata.')); }
        if (xhr.status !== 201 || !result.id) return reject(new Error(result.error || 'Invio non riuscito. Riprova.'));
        resolve(result);
      };
      xhr.onerror = () => reject(new Error('Connessione interrotta. La ricezione non è stata confermata: riprova o contatta Musicis prima di inviare una seconda volta.'));
      xhr.ontimeout = () => reject(new Error('Il server non ha confermato la ricezione entro il tempo previsto. Verifica con Musicis prima di ripetere l’invio.'));
      xhr.send(data);
    });
    document.querySelector('#submission-reference').textContent = `Codice proposta: ${result.id}`;
    document.querySelector('#submission-layout').hidden = true;
    const success = document.querySelector('#submission-success'); success.hidden = false;
    form.reset(); files.forEach(item => URL.revokeObjectURL(item.url)); files = []; renderPhotos();
    success.focus(); success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) { showError(submitError, error.message); submitError.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  finally { submitting = false; button.disabled = false; button.innerHTML = `Invia la tua proposta ${icon('arrow')}`; progressWrap.hidden = true; }
});
window.addEventListener('pagehide', () => files.forEach(item => URL.revokeObjectURL(item.url)));
