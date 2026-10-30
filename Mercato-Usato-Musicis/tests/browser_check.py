from playwright.sync_api import sync_playwright
from pathlib import Path
import os,subprocess,tempfile,secrets,time,urllib.request,json,socket,shutil
root=Path(__file__).resolve().parents[1]
out=root/'test-results';out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='musicis-browser-') as tmp:
 with socket.socket() as probe:
  probe.bind(('127.0.0.1',0)); test_port=probe.getsockname()[1]
 password=secrets.token_urlsafe(30)
 cfg=dict(os.environ,PORT=str(test_port),HOST='127.0.0.1',NODE_ENV='development',MUSICIS_ADMIN_PASSWORD=password,DATA_DIR=tmp+'/data',UPLOAD_DIR=tmp+'/uploads')
 server=subprocess.Popen(['node','server.mjs'],cwd=root,env=cfg,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 base=f'http://127.0.0.1:{test_port}/mercato-usato/'
 try:
  for _ in range(60):
   if server.poll() is not None: raise RuntimeError('Il server di prova si è arrestato')
   try:
    urllib.request.urlopen(base+'api/health',timeout=1).read();break
   except Exception:time.sleep(.1)
  else:raise RuntimeError('Server di prova non avviato')
  with sync_playwright() as p:
   executable=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
   browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),headless=True,args=['--no-sandbox'])
   page=browser.new_page(viewport={'width':1440,'height':1050})
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base+'vendi.html',wait_until='networkidle')
   for field,value in {'firstName':'Utente','lastName':'Di Prova','phone':'+39 333 1234567','email':'test@example.com','instrument':'Strumento di prova browser','price':'450','city':'Milano','description':'Strumento di prova per verificare il funzionamento del modulo e delle foto.'}.items():
    page.locator('#'+field).fill(value)
   page.locator('#category').select_option('Chitarre')
   page.locator('#condition').select_option('Ottimo')
   page.locator('#photos').set_input_files([str(root/'public/assets/images/hero-ukulele.webp'),str(root/'public/assets/images/music-together.webp')])
   assert page.locator('.photo-item').count()==2
   page.locator('[data-remove="1"]').click()
   assert page.locator('.photo-item').count()==1
   page.locator('#photos').set_input_files(str(root/'public/assets/images/music-together.webp'))
   page.locator('input[name=consent]').check()
   page.locator('#submit-listing').click()
   page.wait_for_selector('#submission-success:not([hidden])')
   proposal=page.locator('#submission-reference').inner_text().split(': ')[-1]
   page.screenshot(path=str(out/'submission-success.png'),full_page=True)
   page.goto(base+'index.html',wait_until='networkidle')
   assert page.locator('.product-card').count()==0
   page.goto(base+'gestione.html',wait_until='networkidle')
   page.locator('#admin-password').fill(password)
   page.locator('#admin-login button').click()
   page.wait_for_selector('.admin-card')
   assert page.locator('.admin-gallery img').count()==2
   page.get_by_role('button',name='Approva e pubblica',exact=True).click()
   page.wait_for_selector('.admin-status:has-text("Pubblicato")')
   page.goto(base+'index.html',wait_until='networkidle')
   assert page.locator('.product-card').count()==1
   page.locator('.product-info h3 a').click()
   page.wait_for_selector('#inquiry-form')
   page.locator('[data-photo="1"]').click()
   assert page.locator('[data-photo="1"]').get_attribute('aria-pressed')=='true'
   page.locator('#contact-name').fill('Interessato di prova')
   page.locator('#contact-email').fill('interessato@example.com')
   page.locator('#contact-message').fill('Vorrei conoscere maggiori dettagli sullo strumento.')
   page.locator('#inquiry-form input[name=consent]').check()
   page.get_by_role('button',name='Richiedi informazioni',exact=True).click()
   page.wait_for_selector('#inquiry-form .success-panel')
   page.goto(base+'gestione.html',wait_until='networkidle')
   page.wait_for_selector('.admin-inquiry')
   assert 'Interessato di prova' in page.locator('.admin-inquiry').inner_text()
   page.get_by_role('button',name='Segna venduto',exact=True).click()
   page.wait_for_selector('.admin-status:has-text("Venduto")')
   page.goto(base+'annuncio.html?id='+proposal,wait_until='networkidle')
   page.wait_for_selector('.detail-layout')
   assert page.locator('#inquiry-form').count()==0
   assert 'venduto' in page.locator('.detail-contact').inner_text()
   page.goto(base+'gestione.html',wait_until='networkidle')
   page.wait_for_selector('.admin-card')
   page.once('dialog',lambda dialog:dialog.accept())
   page.get_by_role('button',name='Elimina dati e foto').click()
   page.wait_for_selector('#admin-listings .empty-state')
   assert not list(Path(tmp+'/uploads').iterdir())
   page.get_by_role('button',name='Esci',exact=True).click()
   page.wait_for_selector('#admin-login-panel:not([hidden])')
   page.goto(base+'index.html?demo=1',wait_until='networkidle')
   assert page.locator('.product-card').count()==4
   page.get_by_role('button',name='Chitarre',exact=True).click()
   assert page.locator('.product-card').count()==1
   page.get_by_role('button',name='Tutti gli strumenti',exact=True).click()
   page.locator('#catalog-search').fill('88 tasti')
   assert page.locator('.product-card').count()==1
   page.locator('#catalog-search').fill('')
   page.locator('[data-favorite]').first.click()
   page.locator('#favorites-only').click()
   assert page.locator('.product-card').count()==1
   page.locator('#favorites-only').click()
   page.locator('#catalog-sort').select_option('price-asc')
   assert '280' in page.locator('.product-price').first.inner_text()
   page.goto(base+'come-funziona.html',wait_until='networkidle')
   page.get_by_text('Come devono essere le foto?',exact=True).click()
   assert page.locator('details[open]').count()==1
   # Capture completed pages, including content below the first viewport.
   for name,url in [('home-desktop','index.html?demo=1'),('sell-desktop','vendi.html'),('how-desktop','come-funziona.html'),('home-real-desktop','index.html')]:
    page.goto(base+url,wait_until='networkidle')
    page.evaluate("document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'))")
    page.wait_for_timeout(650)
    page.screenshot(path=str(out/(name+'.png')),full_page=True)
   mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   mobile.on('pageerror',lambda e:errors.append(str(e)))
   for name,url in [('home-mobile','index.html?demo=1'),('sell-mobile','vendi.html'),('how-mobile','come-funziona.html')]:
    mobile.goto(base+url,wait_until='networkidle')
    assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth'),name
    mobile.evaluate("document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'))")
    mobile.wait_for_timeout(650)
    mobile.screenshot(path=str(out/(name+'.png')),full_page=True)
   mobile.get_by_role('button',name='Apri menu').click()
   assert mobile.locator('#main-nav').is_visible()
   mobile.get_by_role('link',name='Vendi il tuo usato',exact=True).first.click()
   mobile.wait_for_selector('#sell-form')
   # Narrowest common viewport.
   mobile.set_viewport_size({'width':320,'height':700})
   for url in ['index.html?demo=1','vendi.html','come-funziona.html']:
    mobile.goto(base+url,wait_until='networkidle')
    assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth'),url
   assert not errors,errors
   report={'result':'passed','javascriptErrors':errors,'viewports':[1440,390,320],'flows':['compilazione modulo reale','anteprime e rimozione foto','upload 2 immagini','attesa e catalogo vuoto','login amministratore','foto riservate','approvazione','annuncio nel catalogo','galleria','richiesta di interesse e lettura nella gestione','stato venduto','cancellazione di dati e foto','logout','menu mobile','assenza di overflow']}
   (out/'browser-e2e.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
   browser.close()
   print('Browser E2E: invio, foto, approvazione, interesse, vendita e cancellazione PASS. Desktop 1440, mobile 390/320. Nessun errore JavaScript.')
 finally:
  server.terminate();server.wait(timeout=5)
