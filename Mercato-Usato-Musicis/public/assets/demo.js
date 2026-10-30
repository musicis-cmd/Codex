// Explicit preview only. These illustrative proposals are never inserted into the database.
export const DEMO = [
  { id: 'demo-guitar', instrument: 'Chitarra elettrica S-style', category: 'Chitarre', condition: 'Ottimo', price: 420, city: 'Milano', art: 'guitar' },
  { id: 'demo-keys', instrument: 'Pianoforte digitale · 88 tasti', category: 'Tastiere', condition: 'Come nuovo', price: 590, city: 'Roma', art: 'keys' },
  { id: 'demo-drums', instrument: 'Batteria acustica · 5 pezzi', category: 'Batterie e percussioni', condition: 'Buono', price: 350, city: 'Torino', art: 'drums' },
  { id: 'demo-bass', instrument: 'Basso elettrico · 4 corde', category: 'Bassi', condition: 'Ottimo', price: 280, city: 'Bologna', art: 'bass' }
].map((item, index) => ({ ...item, status: 'published', description: 'Questo è un annuncio dimostrativo, creato per presentare il mercato usato Musicis. L’illustrazione non rappresenta uno strumento realmente in vendita. Dettagli, prezzo e città sono esempi. Gli annunci reali verranno pubblicati dopo la verifica di Musicis.', createdAt: `2026-10-${25 - index}T10:00:00Z`, photos: [`./assets/images/example-${item.art}.svg`] }));
