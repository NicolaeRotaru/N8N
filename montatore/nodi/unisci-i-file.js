// (esecuzione «monta») Logo e musica scaricati → un solo elemento con i file per l'officina.
const J = $('Config').first().json;
const binari = {};
const prendi = (nodo, campo) => {
  try {
    if (!$(nodo).isExecuted) return;
    const it = $(nodo).first();
    if (it && it.binary && it.binary[campo]) binari[campo] = it.binary[campo];
  } catch (e) { /* nodo non eseguito */ }
};
prendi('Scarica il logo', 'logo');
prendi('Scarica il logo dal sito', 'logo');
if (J.contenuto.musica) prendi('Scarica la musica', 'musica');
// stile della regia (Scatti di G) per i reel montati con la regia; il marchio scritto male non tocca lo stile; LUT del girato in log
const dati = { contenuto: J.contenuto, marchio: J.marchio, marchio_valido: J.marchio_valido !== false, stile: testo(J.STILE_VIDEO) || 'sdg', sottotitoli: true };
if (testo(J.LUT)) dati.lut = testo(J.LUT);
// l'identità di Scatti di G (colori e font) dal Config: quando il marchio cambia si cambia lì, non nel codice
dati.identita = { fondo: testo(J.SDG_COLORE_FONDO), testo: testo(J.SDG_COLORE_TESTO), accento: testo(J.SDG_COLORE_ACCENTO), font_titoli: testo(J.SDG_FONT_TITOLI), font_testo: testo(J.SDG_FONT_TESTO) };
return [{ json: { dati: JSON.stringify(dati), con_logo: !!binari.logo, con_musica: !!binari.musica }, binary: binari }];
