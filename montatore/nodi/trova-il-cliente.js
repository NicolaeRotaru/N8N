// Modulo → la scheda del cliente nel foglio Clienti (per «cliente» o per nome del locale, senza badare a maiuscole e accenti).
const CFG = $('Config').first().json;
const r = $input.first().json || {};
const cercato = chiaveNome(CFG.cliente);
const no = (messaggio) => [{ json: { ok: false, messaggio } }];
if (r.error || !Array.isArray(r.values)) return no('Non riesco a leggere il foglio Clienti. Riprova tra qualche minuto; se succede ancora, controlla la credenziale «Google Sheets - Agenzia» in n8n.');
if (!cercato) return no('Scrivi il nome del cliente, come nella colonna «cliente» del foglio (oppure il nome del locale).');
const righe = righeFoglio(r).filter((x) => testo(x.cliente));
const nomi = (x) => [chiaveNome(x.cliente), chiaveNome(x.nome_locale)].filter(Boolean);
let trovati = righe.filter((x) => nomi(x).includes(cercato));
if (!trovati.length) trovati = righe.filter((x) => nomi(x).some((n) => n.includes(cercato) || (n.length >= 4 && cercato.includes(n))));
if (trovati.length > 1) return no('Ho trovato più clienti che somigliano a «' + testo(CFG.cliente) + '»: ' + trovati.map((x) => testo(x.nome_locale) || testo(x.cliente)).join(', ') + '. Scrivi il nome esatto.');
if (!trovati.length) return no('Non trovo «' + testo(CFG.cliente) + '» nel foglio Clienti. Clienti che ci sono: ' + accorcia(righe.map((x) => testo(x.nome_locale) || testo(x.cliente)).join(', '), 600) + '.');
const c = trovati[0];
const cartella = idDrive(c.cartella_drive);
if (!cartella) return no('Il cliente «' + (testo(c.nome_locale) || testo(c.cliente)) + '» non ha la cartella di Google Drive (colonna «cartella_drive» del foglio Clienti). Aggiungila e riprova.');
const m = leggiMarchio(c.marchio);
// I campi della scheda che servono a Claude per il piano (gli altri restano nel foglio).
const CAMPI = ['cliente', 'nome_locale', 'tipo_locale', 'categoria', 'descrizione', 'tono_di_voce', 'orari', 'giorni_chiusura', 'indirizzo', 'telefono', 'link_prenotazione', 'link_menu', 'menu_testo', 'hashtag_fissi', 'account_da_taggare', 'note_piano', 'esempi_didascalie', 'regole_risposte'];
const scheda = {};
for (const k of CAMPI) if (testo(c[k])) scheda[k] = accorcia(testo(c[k]), k === 'menu_testo' || k === 'esempi_didascalie' ? 4000 : 800);
return [{ json: {
  ok: true,
  cliente: testo(c.cliente),
  nome_locale: testo(c.nome_locale) || testo(c.cliente),
  attivo: siNo(c.attivo, false),
  cartella_cliente: cartella,
  scheda,
  marchio: m.marchio,
  marchio_valido: m.valido,
  // foto e video con persone su Telegram solo con il consenso firmato (stessa regola del workflow 15)
  anteprime: siNo(c.anteprime_con_persone, false),
  // le quantità del pacchetto del cliente (dal preventivo): colonne reel_mese, post_mese, storie_mese del foglio Clienti
  quantita: { reel: intero(c.reel_mese, null), post: intero(c.post_mese, null), storie: intero(c.storie_mese, null) },
  logo: m.logo,
} }];
