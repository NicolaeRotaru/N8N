// I nomi dei flussi su n8n, in un posto solo.
//
// Dal 25/11/2026 i flussi hanno una numerazione nuova per famiglie (vedi PIANO-ORDINE.md): 0x social dei
// clienti, 1x clienti e materiali, 2x marketplace MyCity, 3x video, 9x sistema. I programmi che cercano un
// flusso per nome lo cercano qui, col nome nuovo, e trovano anche il nome vecchio. Così:
//  - prima che su n8n si rinomini, un generatore trova il flusso col nome vecchio e, quando lo aggiorna,
//    gli dà il nome nuovo;
//  - dopo, lo trova col nome nuovo.
// Nessuno crea mai un doppione solo perché il nome è cambiato.

/** Il nome nuovo di ogni flusso cercato per nome. */
export const NOMI = {
  nuovoCliente: '11 · Nuovo cliente',
  bozzeAbbonamenti: '15 · Bozze dei 3 abbonamenti',
  iscriviInMyCity: '20 · Iscrivi il cliente in MyCity',
  nuovoClienteDaMyCity: '26 · Nuovo cliente da MyCity',
  analisiMarketplace: '27 · Analisi del marketplace',
  analisiAttivita: "28 · Analisi di un'attività",
  consegnaScheda: "29 · Consegna la scheda scritta dall'AD",
  montatore: '31 · Montatore',
  chiediAllAd: "90 · Chiedi all'AD",
  // Consegna all'AD gli allegati di «Chiedi all'AD» (25/11/2026): il numero lo dà la regia.
  allegatiAd: "Allegati per l'AD",
  argomentoAttivita: "97 · Scrivi nell'argomento dell'attività",
  avvisiErrori: '99 · Avvisi errori',
};

/** Nome nuovo → nomi di prima. */
export const NOMI_VECCHI = {
  [NOMI.nuovoCliente]: ['12 · Nuovo cliente (automatico)'],
  [NOMI.bozzeAbbonamenti]: ['19 · Bozze dei 3 abbonamenti'],
  [NOMI.nuovoClienteDaMyCity]: ['16 · Nuovo cliente da MyCity'],
  [NOMI.analisiMarketplace]: ['17 · Analisi del marketplace'],
  [NOMI.analisiAttivita]: ["18 · Analisi di un'attività"],
  [NOMI.consegnaScheda]: ["19 · Consegna la scheda scritta dall'AD"],
  [NOMI.montatore]: ['16 · Montatore'],
  [NOMI.chiediAllAd]: ["Chiedi all'AD"],
  // Il 25/11 è nato col numero 20, già preso da «Iscrivi il cliente in MyCity»: rinominato subito in 97.
  [NOMI.argomentoAttivita]: ["20 · Scrivi nell'argomento dell'attività"],
};

/** Tutti i nomi con cui un flusso può chiamarsi: il nuovo per primo. */
export const nomiDi = (nome) => [nome, ...(NOMI_VECCHI[nome] || [])];

/**
 * Il flusso con quel nome (o con un suo nome vecchio). Gli archiviati non contano. Se ce n'è uno col nome
 * nuovo e uno col vecchio, vince il nuovo.
 */
export function trovaFlusso(elenco, nome) {
  const vivi = elenco.filter((w) => !w.isArchived);
  for (const n of nomiDi(nome)) {
    const w = vivi.find((x) => x.name === n);
    if (w) return w;
  }
  return undefined;
}
