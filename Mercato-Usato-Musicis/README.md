# Mercato Usato Musicis

Sito italiano responsive composto da pagine **HTML, CSS e JavaScript senza framework**, con servizio **Node.js** per il caricamento effettivo di foto, salvataggio su SQLite e moderazione. Il percorso pubblico previsto è:

`https://www.musicis.it/mercato-usato/`

Il progetto fa parte del repository `musicis-cmd/Codex`. Il caricamento del codice su GitHub non pubblica il sito sul dominio: non sono disponibili accesso all’hosting o strumenti Sites in questa sessione. I siti Musicis e MusicWonders indicati non erano leggibili a causa della policy di rete; non si afferma pertanto di averne verificato o riprodotto la struttura. L’identità visiva proviene dal PDF fornito.

## Avvio locale

Requisito: **Node.js 24 LTS** consigliato, minimo 22.13 con `node:sqlite`; npm. Non serve un database esterno né un processo di build del frontend.

```bash
cd Mercato-Usato-Musicis
npm ci --no-fund
npm test
npm start
```

Il server ascolta su `127.0.0.1:3000`, percorso `/mercato-usato/`. In sviluppo `npm run dev` riavvia il servizio alle modifiche. Per avviare su una diversa interfaccia impostare `HOST`; il valore predefinito locale è adatto a un reverse proxy.

Per configurare l’area riservata, copiare `.env.example` in `.env` e impostare **una propria password di almeno 16 caratteri** in `MUSICIS_ADMIN_PASSWORD`. Non esiste una password predefinita. Non condividere o aggiungere `.env` al repository. Senza password l’area riservata è disabilitata; il sito e il modulo restano utilizzabili in sviluppo. `npm start` legge automaticamente `.env`.

Non creare worktree per utilizzare questo progetto: ogni task cloud dispone già di un ambiente isolato. Usare il checkout esistente e preservare i file dell’utente.

## Pagine e funzioni

| File pubblico | Funzione |
| --- | --- |
| `index.html` | Catalogo reale, categorie, ricerca, ordinamento e preferiti nel browser |
| `index.html?demo=1` | Anteprima esplicitamente etichettata con quattro esempi illustrati, non in vendita |
| `come-funziona.html` | Istruzioni, passaggi e domande frequenti |
| `vendi.html` | Proposta di vendita e upload reale delle foto |
| `annuncio.html?id=…` | Galleria, descrizione, prezzo e richiesta di interesse |
| `gestione.html` | Accesso riservato, approvazione, ritiro, stato venduto, rifiuto, richieste ed eliminazione |
| `privacy.html` | Bozza di informativa specifica, da completare prima del lancio |

Il modulo raccoglie nome, cognome, cellulare, email, strumento/marca/modello, categoria, stato, prezzo indicativo, descrizione, città facoltativa e da 1 a 6 foto. Sono accettati JPEG, PNG e WebP fino a 8 MB per foto e 40 megapixel. Non sono accettati HEIC, SVG, PDF o immagini animate: esportare prima in JPEG. La prima foto è la copertina. Si possono visualizzare e rimuovere le anteprime prima dell’invio.

Il server verifica anche i campi e il contenuto effettivo delle immagini, le ridimensiona entro 1.800 × 1.800 px senza ingrandirle, le converte in JPEG ed elimina EXIF/GPS. L’invio riuscito restituisce un codice e lo stato `pending`. **Non si simula il successo tramite localStorage.**

Solo gli annunci approvati compaiono nel catalogo. Il catalogo iniziale è vuoto e i dati demo non vengono inseriti nel database. Telefono, email, nome e cognome non vengono restituiti dalle API pubbliche. Le foto in attesa sono leggibili soltanto dall’amministratore autenticato. Non inserire dati personali nella descrizione o nelle immagini; la revisione deve controllare anche questo aspetto.

Le richieste degli interessati sono salvate nell’area riservata, **senza invio automatico di email**. Il gestore deve controllarla per dare seguito ai contatti. Non sono implementati registrazione con account personale, pagamenti, commissioni, spedizioni o garanzie commerciali. Il modulo è una proposta di vendita, non un contratto o un acquisto.

## Gestione riservata

1. Aprire `/mercato-usato/gestione.html` e usare la password configurata sul server.
2. Controllare descrizione, foto, condizioni, prezzo e assenza di recapiti nei contenuti pubblici.
3. Selezionare **Approva e pubblica** per rendere visibile l’annuncio.
4. Leggere le richieste di interesse nella stessa scheda. L’applicazione non spedisce notifiche.
5. **Ritira dal catalogo** riporta in attesa e rende nuovamente riservate le foto. **Rifiuta** nasconde senza cancellare i dati.
6. **Segna venduto** rimuove dal catalogo attivo, mantenendo la scheda pubblica come venduta e disabilitando le richieste. Ritirare o eliminare per nasconderla del tutto.
7. **Elimina dati e foto** cancella definitivamente proposta, immagini e richieste collegate. I backup restano soggetti alla politica del gestore.

Sessione amministratore: cookie HttpOnly, SameSite Strict, scadenza massima otto ore, Secure in produzione. Le sessioni sono in memoria: un riavvio richiede un nuovo accesso. Il servizio limita tentativi di login, richieste e invii; non inserisce corpi dei moduli o credenziali nei propri log. Questi limiti non sostituiscono la protezione del reverse proxy se il sito riceve traffico elevato.

## Pubblicazione sul dominio

**Prima identificare la tecnologia dell’hosting.** Questo pacchetto richiede un processo Node.js persistente; uno spazio che esegue soltanto PHP o pubblica file statici non può far funzionare questa API. In quel caso occorre un servizio Node separato dietro proxy oppure un adattamento del backend alla piattaforma disponibile. Non caricare tutto il progetto nella radice pubblica di un hosting PHP.

1. Installare il progetto **fuori dalla document root**, per esempio in `/srv/musicis/mercato-usato`, e usare `npm ci --omit=dev`.
2. Completare `public/privacy.html` con dati del titolare, contatti, base giuridica, destinatari e tempi di conservazione effettivi. Definire la procedura operativa per richieste degli utenti, cancellazioni e backup. Non pubblicare il servizio con i segnaposto della bozza.
3. Configurare le variabili del processo, senza inserirle nel frontend:

   ```dotenv
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=3000
   BASE_PATH=/mercato-usato
   PUBLIC_ORIGIN=https://www.musicis.it
   MUSICIS_PRIVACY_APPROVED=1
   DATA_DIR=/var/lib/musicis-usato/data
   UPLOAD_DIR=/var/lib/musicis-usato/uploads
   TRUST_PROXY=1
   ```

   Impostare separatamente `MUSICIS_ADMIN_PASSWORD` con il sistema di gestione dei segreti del server o nel file di ambiente protetto. `MUSICIS_PRIVACY_APPROVED=1` va usato solo dopo la verifica dell’informativa. La modalità produzione rifiuta l’avvio se mancano queste condizioni. `TRUST_PROXY=1` è corretto **solo dietro un unico reverse proxy fidato**, senza esposizione diretta della porta Node.

4. Creare le directory persistenti e assegnarle all’utente del servizio. Non concedere permessi globali `777`. Il database e gli upload devono restare disponibili dopo riavvii e nuove release. Eseguire backup coerenti di SQLite tramite la sua API di backup o a servizio fermo, includendo la cartella foto.
5. Aggiungere al virtual host HTTPS **esistente** il solo blocco di esempio in `deploy/nginx.conf`, adattandolo al server. Non sostituire la configurazione del sito principale. Il proxy inoltra il percorso completo, incluso `/mercato-usato/`, senza rimuoverlo.
6. Avviare Node come servizio persistente. `deploy/musicis-usato.service` è un esempio da adattare; non è stato installato nel server Musicis.
7. Verificare la risposta JSON `{"ok":true,"storage":"ready"}` da `/mercato-usato/api/health`, il catalogo, l’invio di prova, l’approvazione, le foto e la cancellazione. Controllare che le pagine siano sotto il dominio HTTPS e che `.env`, database e file server non siano accessibili via web.

### Cartella delle foto

Nel pacchetto è presente `uploads/`. Per impostazione predefinita le foto vengono salvate qui; in produzione è preferibile assegnare `UPLOAD_DIR` a una directory persistente. In entrambi i casi gli indirizzi pubblici sono:

`https://www.musicis.it/mercato-usato/uploads/<identificativo-casuale>.jpg`

**Non esporre `uploads/` con un alias statico di Nginx/Apache.** Le richieste devono passare dal servizio, che rende visibili soltanto le foto di annunci pubblicati/venduti o le foto riservate per l’amministratore. Il nome originale del file non entra nell’URL. Il limite del proxy è 55 MB per accogliere fino a sei foto da 8 MB più i campi; il controllo per singola foto rimane sul server. Il servizio sospende nuove proposte oltre 1.000 annunci in attesa o 2 GiB di foto già presenti, per richiedere una gestione operativa dello spazio.

## Struttura

```text
Mercato-Usato-Musicis/
  public/                  # Unica directory di pagine e asset statici
    index.html
    come-funziona.html
    vendi.html
    annuncio.html
    gestione.html
    privacy.html
    404.html
    assets/
      style.css
      *.js
      fonts/               # Roboto locale e licenza
      images/              # Logo, fotografie e illustrazioni
  uploads/                 # Immagini reali, mai servite come directory statica
  data/                    # SQLite; generata all’avvio, esclusa dal repository
  server.mjs
  tests/marketplace.test.mjs
  deploy/
  .env.example
  package.json
  package-lock.json
  CREDITI.md
```

## Verifiche eseguite

`npm test`: **11 test passati**, inclusi upload reale, rifiuto di file contraffatti o troppo grandi, rimozione dei metadati, stato in attesa, protezione foto e recapiti, autenticazione, approvazione, richiesta di interesse, stato venduto, cancellazione, logout e limitazione dei tentativi. `npm audit --omit=dev --audit-level=high`: **0 vulnerabilità note** al momento della verifica.

Il sito è stato verificato anche nel browser Chromium su desktop e smartphone: navigazione, categorie, ricerca, preferiti, scheda demo, FAQ e menu mobile. La prova completa comprende inoltre compilazione del modulo, anteprima/rimozione e caricamento di due foto, accesso alla gestione, approvazione, annuncio pubblico, galleria, invio e lettura di una richiesta di interesse, stato venduto, eliminazione e logout. Sono state controllate larghezze di 1440, 390 e 320 px, senza errori JavaScript o overflow orizzontale. Le prove browser e di upload riguardano l’ambiente locale, non il server musicis.it. La compatibilità del processo Node con l’hosting e la pubblicazione sul dominio restano da verificare.

### Ripetere la prova browser (facoltativo)

`tests/browser_check.py` richiede Python 3, il pacchetto `playwright` e Chromium. Non sono dipendenze del sito in produzione. Con questi strumenti già installati, eseguire dalla directory del progetto:

```bash
python tests/browser_check.py
```

Lo script avvia un server su una porta locale libera, usa dati e password temporanei, esegue il flusso completo e cancella i dati alla fine. Gli screenshot e il report vanno in `test-results/`, esclusa dal repository. Usa Chromium di sistema quando disponibile; si può indicare il binario tramite `CHROMIUM_EXECUTABLE`, oppure installare Chromium con gli strumenti Playwright.
