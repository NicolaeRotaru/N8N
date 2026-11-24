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
const dati = { contenuto: J.contenuto, marchio: J.marchio, sottotitoli: true };
return [{ json: { dati: JSON.stringify(dati), con_logo: !!binari.logo, con_musica: !!binari.musica }, binary: binari }];
