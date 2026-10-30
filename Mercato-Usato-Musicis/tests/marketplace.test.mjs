import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../server.mjs';

test('Annunci Musicis: invio, riservatezza, moderazione, richieste e cancellazione', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'musicis-test-'));
  const password = randomBytes(24).toString('hex');
  const instance = await createApp({ dataDir: path.join(dir, 'data'), uploadDir: path.join(dir, 'uploads'), password, submissionLimit: 100 });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/mercato-usato`;
  const headers = { 'X-Musicis-Request': '1' };
  let id, cookie, photo;
  const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#f57e23' } }).jpeg().withMetadata().toBuffer();
  function form(overrides = {}, buffer = image, type = 'image/jpeg') {
    const data = new FormData();
    const values = { firstName: 'Mario', lastName: 'Rossi', phone: '+39 333 1234567', email: 'test@example.com', instrument: 'Chitarra di prova', category: 'Chitarre', condition: 'Ottimo', price: '425.50', city: 'Roma', description: 'Chitarra utilizzata soltanto in casa, con custodia e piccoli segni di usura.', consent: 'on', ...overrides };
    for (const [key, value] of Object.entries(values)) data.append(key, value);
    data.append('photos', new Blob([buffer], { type }), 'strumento.jpg');
    return data;
  }
  try {
    await t.test('pagine HTML, font e salute del servizio rispondono', async () => {
      for (const page of ['/', '/vendi.html', '/come-funziona.html', '/privacy.html', '/assets/fonts/roboto-latin-400-normal.woff2']) {
        const res = await fetch(base + page); assert.equal(res.status, 200, page);
        assert.ok(res.headers.get('content-security-policy'));
      }
      assert.deepEqual(await (await fetch(base + '/api/listings')).json(), { listings: [] });
      assert.equal((await fetch(base + '/.env')).status, 404);
      assert.equal((await fetch(base + '/data/musicis.sqlite')).status, 404);
      assert.equal((await fetch(base + '/gestione.html')).headers.get('x-robots-tag'), 'noindex, nofollow');
    });
    await t.test('richieste esterne e accesso anonimo alla gestione sono bloccati', async () => {
      assert.equal((await fetch(base + '/api/listings', { method: 'POST', body: form() })).status, 403);
      assert.equal((await fetch(base + '/api/listings', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: form() })).status, 403);
      assert.equal((await fetch(base + '/api/admin/listings')).status, 401);
      assert.equal((await fetch(base + '/api/admin/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) })).status, 401);
    });
    await t.test('dati incompleti, prezzi non validi, file contraffatti e immagini eccessive sono rifiutati', async () => {
      for (const values of [{ email: 'invalid' }, { consent: '' }, { price: '-20' }, { price: '1.001' }, { category: 'Invalid' }, { description: 'Breve' }]) {
        const response = await fetch(base + '/api/listings', { method: 'POST', headers, body: form(values) });
        assert.equal(response.status, 400, JSON.stringify(values));
      }
      const invalid = await fetch(base + '/api/listings', { method: 'POST', headers, body: form({}, Buffer.from('<?php echo 1; ?>')) });
      assert.equal(invalid.status, 400);
      const tooLarge = await fetch(base + '/api/listings', { method: 'POST', headers, body: form({}, Buffer.alloc(8 * 1024 * 1024 + 1)) });
      assert.equal(tooLarge.status, 400);
      const mixed = form(); mixed.append('photos', new Blob(['not an image'], { type: 'image/jpeg' }), 'broken.jpg');
      assert.equal((await fetch(base + '/api/listings', { method: 'POST', headers, body: mixed })).status, 400);
      assert.equal((await readdir(path.join(dir, 'uploads'))).length, 0, 'nessuna foto orfana dopo un invio fallito');
    });
    await t.test('una proposta valida è persistita ma non pubblicata', async () => {
      const response = await fetch(base + '/api/listings', { method: 'POST', headers, body: form() });
      assert.equal(response.status, 201);
      const result = await response.json(); id = result.id; assert.equal(result.status, 'pending');
      assert.equal(instance.db.prepare('SELECT count(*) AS n FROM listings').get().n, 1);
      assert.equal((await (await fetch(base + '/api/listings')).json()).listings.length, 0);
      assert.equal((await fetch(base + '/api/listings/' + id)).status, 404);
      const name = (await readdir(path.join(dir, 'uploads')))[0]; photo = `${base}/uploads/${name}`;
      assert.equal((await fetch(photo)).status, 404);
    });
    await t.test('la gestione autenticata vede proposta e foto riservate', async () => {
      const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      assert.equal(login.status, 200); const setCookie = login.headers.get('set-cookie');
      assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/); cookie = setCookie.split(';')[0];
      const rows = (await (await fetch(base + '/api/admin/listings', { headers: { Cookie: cookie } })).json()).listings;
      assert.equal(rows.length, 1); assert.equal(rows[0].email, 'test@example.com');
      const res = await fetch(photo, { headers: { Cookie: cookie } }); assert.equal(res.status, 200);
      const metadata = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
    });
    await t.test('l’approvazione rende pubblico lo strumento senza divulgare i recapiti', async () => {
      const response = await fetch(base + '/api/admin/listings/' + id, { method: 'PATCH', headers: { ...headers, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }) });
      assert.equal(response.status, 200);
      const json = await (await fetch(base + '/api/listings/' + id)).json();
      assert.equal(json.price, 425.5); assert.equal(json.instrument, 'Chitarra di prova');
      for (const key of ['firstName', 'lastName', 'phone', 'email', 'first_name', 'inquiries']) assert.equal(json[key], undefined);
      assert.equal((await fetch(photo)).status, 200);
      assert.equal((await (await fetch(base + '/api/listings')).json()).listings.length, 1);
    });
    await t.test('le richieste sono salvate e visibili solo alla gestione', async () => {
      const inquiry = await fetch(base + '/api/listings/' + id + '/inquiries', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Anna Prova', email: 'anna@example.com', message: 'Vorrei informazioni sulla custodia inclusa.', consent: true }) });
      assert.equal(inquiry.status, 201);
      const rows = (await (await fetch(base + '/api/admin/listings', { headers: { Cookie: cookie } })).json()).listings;
      assert.equal(rows[0].inquiries.length, 1); assert.equal(rows[0].inquiries[0].name, 'Anna Prova');
      await fetch(base + '/api/admin/listings/' + id, { method: 'PATCH', headers: { ...headers, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'sold' }) });
      assert.equal((await (await fetch(base + '/api/listings')).json()).listings.length, 0);
      assert.equal((await (await fetch(base + '/api/listings/' + id)).json()).status, 'sold');
    });
    await t.test('la cancellazione elimina dati, foto e richieste; il logout invalida la sessione', async () => {
      assert.equal((await fetch(base + '/api/admin/listings/' + id, { method: 'DELETE', headers: { ...headers, Cookie: cookie } })).status, 200);
      assert.equal((await readdir(path.join(dir, 'uploads'))).length, 0);
      assert.equal(instance.db.prepare('SELECT count(*) AS n FROM inquiries').get().n, 0);
      assert.equal((await fetch(photo)).status, 404);
      assert.equal((await fetch(base + '/api/admin/logout', { method: 'POST', headers: { ...headers, Cookie: cookie } })).status, 200);
      assert.equal((await fetch(base + '/api/admin/listings', { headers: { Cookie: cookie } })).status, 401);
    });
    await t.test('il limite antispam restituisce 429, senza invii illimitati', async () => {
      for (let n = 0; n < 10; n++) await fetch(base + '/api/admin/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
      const limited = await fetch(base + '/api/admin/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
      assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); instance.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('La produzione richiede configurazione e privacy verificate', async () => {
  await assert.rejects(createApp({ production: true, password: '', publicOrigin: '', privacyApproved: false }), /Produzione/);
});
