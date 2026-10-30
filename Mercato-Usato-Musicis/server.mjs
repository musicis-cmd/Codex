import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, writeFile, unlink, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const CATEGORIES = ['Chitarre', 'Bassi', 'Tastiere', 'Batterie e percussioni', 'Fiati e archi', 'Studio e accessori'];
export const CONDITIONS = ['Come nuovo', 'Ottimo', 'Buono', 'Da revisionare'];
const MAX_FILE = 8 * 1024 * 1024;
const MAX_FILES = 6;
const sha = value => createHash('sha256').update(value).digest();
const text = value => typeof value === 'string' ? value.trim().replace(/\r\n/g, '\n') : '';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const emailValid = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function createApp(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const base = (options.base ?? process.env.BASE_PATH ?? '/mercato-usato').replace(/\/$/, '');
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(base)) throw new Error('BASE_PATH non valido.');
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? path.join(ROOT, 'data');
  const uploadDir = options.uploadDir ?? process.env.UPLOAD_DIR ?? path.join(ROOT, 'uploads');
  const password = options.password ?? process.env.MUSICIS_ADMIN_PASSWORD ?? '';
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? '';
  const privacyApproved = options.privacyApproved ?? process.env.MUSICIS_PRIVACY_APPROVED === '1';
  if (password && password.length < 16) throw new Error('La password amministratore deve avere almeno 16 caratteri.');
  if (production && (!password || !/^https:\/\//.test(publicOrigin) || !privacyApproved)) {
    throw new Error('Produzione: configurare MUSICIS_ADMIN_PASSWORD, PUBLIC_ORIGIN HTTPS e MUSICIS_PRIVACY_APPROVED=1 dopo la verifica della privacy.');
  }
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(uploadDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'musicis.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      phone TEXT NOT NULL, email TEXT NOT NULL, instrument TEXT NOT NULL,
      category TEXT NOT NULL, condition TEXT NOT NULL, price_cents INTEGER NOT NULL,
      city TEXT NOT NULL DEFAULT '', description TEXT NOT NULL,
      photos TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      consent_version TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL,
      consent_version TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS listings_status_date ON listings(status, created_at);
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  const sessions = new Map();
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'", 'blob:', 'data:'], fontSrc: ["'self'"],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'self'"],
    formAction: ["'self'"], upgradeInsecureRequests: production ? [] : null
  } }, strictTransportSecurity: production ? undefined : false }));
  const router = express.Router();
  router.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const expected = production ? publicOrigin : `${req.protocol}://${req.get('host')}`;
      if (req.get('x-musicis-request') !== '1' || (origin && origin !== expected)) return next(fail('Richiesta non autorizzata.', 403));
    }
    next();
  });
  router.use('/api', express.json({ limit: '24kb' }));
  function limit(scope, max, seconds) {
    return (req, res, next) => {
      const now = Date.now();
      db.prepare('DELETE FROM limits WHERE expires < ?').run(now);
      const key = `${scope}:${sha(req.ip || 'unknown').toString('hex')}`;
      const record = db.prepare('SELECT * FROM limits WHERE key=?').get(key);
      if (record && record.count >= max) {
        res.set('Retry-After', String(Math.ceil((record.expires - now) / 1000)));
        return next(fail('Hai effettuato troppe richieste. Riprova più tardi.', 429));
      }
      db.prepare('INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + seconds * 1000);
      next();
    };
  }
  const cookieName = 'musicis_admin';
  function authenticated(req) {
    const raw = (req.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`));
    const token = raw?.slice(cookieName.length + 1);
    const session = token && sessions.get(token);
    if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return false; }
    return true;
  }
  const requireAdmin = (req, res, next) => authenticated(req) ? next() : next(fail('Accedi all’area riservata.', 401));
  const publicListing = row => ({ id: row.id, instrument: row.instrument, category: row.category,
    condition: row.condition, price: row.price_cents / 100, city: row.city,
    description: row.description, status: row.status, createdAt: row.created_at,
    photos: JSON.parse(row.photos).map(name => `${base}/uploads/${name}`) });
  const adminListing = row => ({ ...publicListing(row), firstName: row.first_name, lastName: row.last_name,
    phone: row.phone, email: row.email, consentVersion: row.consent_version,
    inquiries: db.prepare('SELECT id,name,email,message,created_at FROM inquiries WHERE listing_id=? ORDER BY created_at DESC').all(row.id) });
  router.get('/api/health', (req, res) => res.json({ ok: true, storage: 'ready' }));
  router.get('/api/listings', (req, res) => {
    const rows = db.prepare("SELECT * FROM listings WHERE status='published' ORDER BY created_at DESC LIMIT 1000").all();
    res.json({ listings: rows.map(publicListing) });
  });
  router.get('/api/listings/:id', (req, res, next) => {
    const row = db.prepare("SELECT * FROM listings WHERE id=? AND status IN ('published','sold')").get(req.params.id);
    if (!row) return next(fail('Questo annuncio non è disponibile.', 404));
    res.json(publicListing(row));
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: MAX_FILES, fields: 16, fieldSize: 8000, parts: 23 },
    fileFilter(req, file, cb) {
      cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
    } });
  router.post('/api/listings', limit('submit', options.submissionLimit ?? 5, 3600), upload.array('photos', MAX_FILES), async (req, res, next) => {
    const saved = [];
    try {
      const b = req.body;
      const firstName = text(b.firstName), lastName = text(b.lastName), phone = text(b.phone), email = text(b.email).toLowerCase();
      const instrument = text(b.instrument), category = text(b.category), condition = text(b.condition);
      const description = text(b.description), city = text(b.city);
      if (text(b.website)) throw fail('Invio non valido.');
      if (firstName.length < 2 || firstName.length > 80 || lastName.length < 2 || lastName.length > 80) throw fail('Controlla nome e cognome (da 2 a 80 caratteri).');
      if (!emailValid(email)) throw fail('Inserisci un indirizzo email valido.');
      if (!/^\+?[\d\s().-]{7,25}$/.test(phone) || phone.replace(/\D/g, '').length < 7) throw fail('Inserisci un numero di cellulare valido.');
      if (instrument.length < 3 || instrument.length > 120) throw fail('Indica marca e modello dello strumento (da 3 a 120 caratteri).');
      if (!CATEGORIES.includes(category) || !CONDITIONS.includes(condition)) throw fail('Seleziona categoria e stato dello strumento.');
      if (description.length < 20 || description.length > 3000 || city.length > 100) throw fail('La descrizione deve contenere da 20 a 3.000 caratteri.');
      const priceString = text(b.price).replace(',', '.');
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(priceString)) throw fail('Inserisci un prezzo valido, con al massimo due decimali.');
      const priceCents = Math.round(Number(priceString) * 100);
      if (priceCents < 100 || priceCents > 10000000) throw fail('Il prezzo deve essere compreso tra 1 e 100.000 euro.');
      if (b.consent !== 'on') throw fail('Conferma di aver letto l’informativa privacy.');
      if (!req.files?.length || req.files.length > MAX_FILES) throw fail('Aggiungi da 1 a 6 foto JPEG, PNG o WebP.');
      if (db.prepare("SELECT count(*) AS n FROM listings WHERE status='pending'").get().n >= 1000) throw fail('Le nuove proposte sono temporaneamente sospese.', 503);
      const files = await readdir(uploadDir);
      let used = 0;
      for (const file of files) { if (file.endsWith('.jpg')) used += (await stat(path.join(uploadDir, file))).size; }
      if (used > (options.storageLimit ?? 2 * 1024 ** 3)) throw fail('Spazio immagini temporaneamente esaurito. Contatta Musicis.', 503);
      // Decode actual bytes, reject spoofed files, re-encode and strip EXIF/GPS metadata.
      for (const file of req.files) {
        let image;
        try {
          const pipeline = sharp(file.buffer, { limitInputPixels: 40000000, animated: false, failOn: 'error' });
          const metadata = await pipeline.metadata();
          if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
          image = await pipeline.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 84, progressive: true }).toBuffer();
        } catch { throw fail('Una foto non è leggibile. Usa immagini JPEG, PNG o WebP, fino a 40 megapixel.'); }
        const name = `${randomUUID()}.jpg`;
        await writeFile(path.join(uploadDir, name), image, { flag: 'wx', mode: 0o600 });
        saved.push(name);
      }
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare(`INSERT INTO listings(id,first_name,last_name,phone,email,instrument,category,condition,price_cents,city,description,photos,consent_version,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, firstName, lastName, phone, email, instrument, category, condition, priceCents, city, description, JSON.stringify(saved), '2026-10-v1', now, now);
      res.status(201).json({ id, status: 'pending', message: 'Proposta ricevuta. Il tuo annuncio è in attesa di verifica da parte di Musicis.' });
    } catch (error) {
      await Promise.allSettled(saved.map(name => unlink(path.join(uploadDir, name))));
      next(error);
    }
  });
  router.post('/api/listings/:id/inquiries', limit('inquiry', 10, 3600), (req, res, next) => {
    const row = db.prepare("SELECT id FROM listings WHERE id=? AND status='published'").get(req.params.id);
    if (!row) return next(fail('Annuncio non disponibile.', 404));
    const name = text(req.body.name), email = text(req.body.email).toLowerCase(), message = text(req.body.message);
    if (name.length < 2 || name.length > 100 || !emailValid(email) || message.length < 10 || message.length > 2000 || req.body.consent !== true || text(req.body.website)) return next(fail('Controlla i campi e conferma la lettura dell’informativa privacy.'));
    db.prepare('INSERT INTO inquiries(id,listing_id,name,email,message,consent_version,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), row.id, name, email, message, '2026-10-v1', new Date().toISOString());
    res.status(201).json({ message: 'Richiesta registrata nell’area riservata Musicis. Nessuna email automatica è stata inviata.' });
  });
  router.get('/uploads/:name', (req, res, next) => {
    if (!/^[a-f\d-]{36}\.jpg$/.test(req.params.name)) return next(fail('Immagine non disponibile.', 404));
    const row = db.prepare('SELECT status FROM listings WHERE EXISTS (SELECT 1 FROM json_each(listings.photos) WHERE value=?)').get(req.params.name);
    if (!row || (!['published', 'sold'].includes(row.status) && !authenticated(req))) return next(fail('Immagine non disponibile.', 404));
    res.set('Cache-Control', 'private, no-store');
    res.type('jpg').sendFile(path.join(uploadDir, req.params.name));
  });
  router.post('/api/admin/login', limit('login', 10, 900), (req, res, next) => {
    if (!password) return next(fail('Area riservata non configurata: impostare MUSICIS_ADMIN_PASSWORD sul server.', 503));
    if (!timingSafeEqual(sha(text(req.body.password)), sha(password))) return next(fail('Password non corretta.', 401));
    for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + 8 * 3600 * 1000 });
    res.cookie(cookieName, token, { httpOnly: true, sameSite: 'strict', secure: production, path: base, maxAge: 8 * 3600 * 1000 });
    res.json({ ok: true });
  });
  router.post('/api/admin/logout', requireAdmin, (req, res) => {
    const raw = (req.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`));
    if (raw) sessions.delete(raw.slice(cookieName.length + 1));
    res.clearCookie(cookieName, { path: base, httpOnly: true, sameSite: 'strict', secure: production }).json({ ok: true });
  });
  router.get('/api/admin/listings', requireAdmin, (req, res) => {
    res.json({ listings: db.prepare('SELECT * FROM listings ORDER BY created_at DESC').all().map(adminListing) });
  });
  router.patch('/api/admin/listings/:id', requireAdmin, (req, res, next) => {
    const status = text(req.body.status);
    if (!['pending', 'published', 'rejected', 'sold'].includes(status)) return next(fail('Stato non valido.'));
    const row = db.prepare('SELECT id FROM listings WHERE id=?').get(req.params.id);
    if (!row) return next(fail('Annuncio non trovato.', 404));
    db.prepare('UPDATE listings SET status=?,updated_at=? WHERE id=?').run(status, new Date().toISOString(), row.id);
    res.json({ ok: true, status });
  });
  router.delete('/api/admin/listings/:id', requireAdmin, async (req, res, next) => {
    const row = db.prepare('SELECT * FROM listings WHERE id=?').get(req.params.id);
    if (!row) return next(fail('Annuncio non trovato.', 404));
    // Unlink files before deleting their DB reference, so an IO failure remains retryable.
    try {
      for (const name of JSON.parse(row.photos)) {
        try { await unlink(path.join(uploadDir, name)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      db.prepare('DELETE FROM listings WHERE id=?').run(row.id);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  router.use('/api', (req, res, next) => next(fail('Endpoint non trovato.', 404)));
  router.use((req, res, next) => {
    if (req.path === '/gestione.html') res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  router.use(express.static(path.join(ROOT, 'public'), { dotfiles: 'deny', index: 'index.html', maxAge: production ? '1h' : 0 }));
  router.use((req, res) => res.status(404).sendFile(path.join(ROOT, 'public', '404.html')));
  app.get('/', (req, res) => res.redirect(`${base}/`));
  app.use(base, router);
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500;
    let message = status < 500 ? error.message : 'Il servizio non è disponibile. Riprova tra poco.';
    if (error instanceof multer.MulterError) {
      status = 400;
      message = error.code === 'LIMIT_FILE_SIZE' ? 'Una foto supera 8 MB.' : 'Carica al massimo 6 foto e controlla i campi del modulo.';
    }
    if (status >= 500) console.error('[Musicis]', error.code || error.name); // No request bodies or personal data in logs.
    res.status(status).json({ error: message });
  });
  return { app, db, close: () => db.close() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, close } = await createApp();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, host, () => console.log(`Musicis pronto sulla porta ${port}, percorso ${process.env.BASE_PATH || '/mercato-usato'}`));
  const stop = () => server.close(() => { close(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
