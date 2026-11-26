# Contratto del rapporto dell'imprenditore · n8n (flusso 26) → sito

Versione **1.3** · 26/11/2026 (1.1: il parere legale su Google, TripAdvisor e DataForSEO · 1.2: le parti per abbonamento e i concorrenti sui social e sul web, decisioni di Nicola delle 14:35 e 14:54 · 1.3: le parti allineate al PIANO, `proposta` nel piano dei 30 giorni, la regola delle 15:00 «non si cancella mai, si archivia» · 1.4: decisioni dell'AD delle 14:38 — niente dati con scadenza, niente voto medio né stelle, orari dei concorrenti da OpenStreetMap, numeri di parte definitivi) · sessione «rapporto imprenditore — parte n8n».
Chi lo cambia lo dice all'altra parte prima. Si possono **aggiungere** campi; quelli scritti qui non si rinominano.

Dove viaggia: dentro la scheda che il 26 manda già al sito (`POST /api/agenzia/scheda-cliente`, stessa
credenziale), nell'oggetto `analisi`, accanto a `business` e `giudizio_sito`:

```
corpo.analisi.fatti                 ← i numeri raccolti da n8n (sezione 1)
corpo.analisi.business.reputazione_temi
corpo.analisi.business.confronto_concorrenti
corpo.analisi.business.occasioni
corpo.analisi.business.soldi_pubblici
corpo.analisi.business.piano_30_giorni
corpo.analisi.business.idee_dal_confronto  (1.2)
corpo.analisi.business.parti               (1.2) ← le nuove sezioni scritte dall'AD (sezione 2)
```

Le sezioni di prima (`situazione`, `mercato`, `clienti`, `opportunita`, `rischi`, `prime_mosse`) restano
identiche. Un campo nuovo che il sito non conosce si ignora, non si rifiuta.

## Regole che valgono per tutto

1. **Ogni numero ha `fonte` e `letto_il`.** `fonte` è un indirizzo `https` (per le API: l'indirizzo
   pubblico della documentazione o della scheda, mai l'indirizzo con la chiave dentro). `letto_il` è ISO 8601 UTC.
2. **Un dato che manca è `null` con il `motivo`**, mai uno zero. Uno zero vuol dire «contato, ed è zero».
3. **Niente persone.** Nessun nome di chi scrive le recensioni, nessun dato del titolare (nome, telefono,
   email, indirizzo di casa). Delle recensioni si tengono solo i temi.
4. **Google Places: solo `place_id`** (termini EEA dall'8/7/2025). Voto, recensioni, orari, nome,
   indirizzo di Google: zero giorni, da nessuna parte (database, scheda, email, PDF). Il sito mostra la
   scheda Google col riquadro ufficiale `<gmp-place-details>` (Places UI Kit), caricato in diretta nel
   browser dal `place_id`; l'attribuzione è quella del riquadro. Niente contenuti derivati dai dati Google.
5. **DataForSEO è una filiera separata** da Google Places: i suoi numeri non si mescolano con quelli di
   Places. I testi delle recensioni restano solo in memoria durante la lettura (all'AD per i temi) e non
   arrivano mai al sito; al sito vanno solo temi con quante recensioni li citano (almeno 3).
   **Niente dati con scadenza (1.4):** `posizione` viene solo da OpenStreetMap (ODbL) o da MyCity, mai da
   Google; di Google resta solo `place_id`, che non scade. Per questo `conserva_fino_al` oggi è sempre `null`.
   **Eccezione dichiarata:** se un giorno arriva un dato con un limite di legge o di licenza, vince il limite
   (il blocco porterà `conserva_fino_al`), e non è un'archiviazione. L'unico limite di oggi riguarda i testi
   delle recensioni DataForSEO (24 ore), che però non si salvano mai.
6. **I concorrenti si contano solo da OpenStreetMap.**
7. **Fonte spenta ≠ dato assente.** Una fonte a pagamento spenta dà `stato: "spento"`, e il sito non la
   mostra come «non trovato».
8. **Una scheda «parziale» aggiunge, non sostituisce** (1.3). Quando la ricerca si è fermata il 26 manda
   `parziale: true`, `campi: {}` e solo le parti dell'analisi che ha davvero (mai sezioni vuote). Il sito
   aggiunge quello che arriva e non scrive mai un vuoto sopra un pieno.
9. **Non si cancella mai, si archivia** (Nicola, 26/11 ore 15:00). I testi delle recensioni di DataForSEO e i
   dati di Google Places (oltre al `place_id`) **non si salvano mai**, per il parere legale: restano solo in
   memoria durante la lettura, quindi non c'è niente da cancellare né da archiviare. Nessuno li salvi «per
   poterli archiviare».

## 1. `analisi.fatti`

```jsonc
{
  "versione": 1,
  "raccolti_il": "2026-11-26T14:50:00.000Z",
  "posizione":   Blocco<{ "lat": 45.05, "lon": 9.69, "precisione": "indirizzo" | "via" | "citta" }>,
  "vicini":      Blocco<Vicini>,
  "meteo":       Blocco<Meteo>,
  "eventi":      Blocco<{ "elenco": Notizia[] }>,
  "bandi":       Blocco<{ "elenco": Notizia[] }>,
  "sito":        Blocco<ControlliSito>,
  "google":      Blocco<Google>,        // a pagamento, spento di serie
  "tripadvisor": Blocco<TripAdvisor>,   // a pagamento, solo bar/ristoranti/hotel, spento di serie
  "recensioni":  Blocco<Recensioni>,    // DataForSEO, spento di serie
  "ricerche":    Blocco<Ricerche>,      // DataForSEO, spento di serie
  "instagram":   Blocco<Instagram>,     // gratis ma serve l'account professionale di MyCity, spento di serie
  "concorrenti_canali": Blocco<ConcorrentiCanali>   // parte 12: sito, Instagram e posizioni dei 3-5 concorrenti più vicini
}
```

### Blocco (la busta uguale per tutti)

```jsonc
{
  "stato": "letto" | "vuoto" | "spento" | "non_applicabile" | "errore",
  "motivo": "string | null",        // obbligatorio quando stato ≠ "letto"; al massimo 200 caratteri
  "fonte": "https://… | null",       // la pagina o la documentazione pubblica della fonte
  "fonte_nome": "string",            // es. "OpenStreetMap", "MET Norway", "Google Places"
  "licenza": "string | null",        // es. "ODbL", "CC BY 4.0" — il sito la cita accanto al dato
  "letto_il": "ISO | null",
  "conserva_fino_al": "ISO | null",  // 1.4: oggi sempre null (eccezione dichiarata solo per un limite di legge o licenza)
  "dati": { … } | null,              // null quando stato ≠ "letto"
  "parte": 1                         // la parte dell'analisi (tabella «Le parti»): il sito filtra per abbonamento
}
```

### Le parti (1.2, allineate al PIANO nella 1.3, definitive nella 1.4)

Ogni blocco di `fatti` e ogni sezione dell'AD porta il numero della sua `parte`. Quali parti entrano in
quale fascia lo decide Nicola e lo mostra il sito: n8n raccoglie sempre tutto.

| parte | cosa (titoli del PIANO) | blocchi di `fatti` | sezioni dell'AD (`analisi.business`) |
|---|---|---|---|
| 1 | La tua carta d'identità online | `google` (solo `place_id`, per il riquadro ufficiale) | `situazione` |
| 2 | La tua reputazione | `recensioni`, `tripadvisor` | `clienti`, `reputazione_temi` |
| 3 | I concorrenti vicini | `vicini` (`dati.concorrenti`) | `mercato`, `confronto_concorrenti` |
| 4 | La tua zona | `vicini` (`dati.servizi`: scuole, uffici, fermate, parcheggi…), `posizione` | — |
| 5 | Cosa cerca la gente | `ricerche` | — |
| 6 | Il tuo sito | `sito` | `giudizio_sito` (in `analisi`, non in `business`) |
| 7 | I tuoi social | `instagram` | (social, porta analisi-canali) |
| 8 | Il calendario della città | `eventi`, `meteo` | `occasioni` |
| 9 | Soldi pubblici | `bandi` | `soldi_pubblici` |
| 10 | Su MyCity | — (la pagella del flusso 18, dopo l'abbonamento) | — |
| 11 | Il piano dei 30 giorni | — | `piano_30_giorni`, `prime_mosse`, `opportunita`, `rischi` |
| 12 | I concorrenti sui social e sul web | `concorrenti_canali` | `confronto_concorrenti[].meglio/peggio`, `idee_dal_confronto` |

**La zona e i concorrenti del PIANO stanno in `vicini`:** `vicini.dati.servizi` è la zona (parte 4,
`dati.servizi_parte = 4`), `vicini.dati.concorrenti` sono i concorrenti (quanti = `numero`, `elenco` di 10).
Il loro `voto_medio` e i voti non ci sono: per il parere legale si contano solo da OpenStreetMap, e un voto
potrebbe venire solo da DataForSEO, oggi non letto. Nelle sezioni dell'AD la parte sta nella mappa
`analisi.business.parti`. Il sito può anche ignorare `parte` e mettere ogni blocco al suo posto dalla chiave.

- `letto` = la fonte ha risposto e c'è qualcosa; `vuoto` = ha risposto ma non c'è niente (es. nessun
  concorrente nel raggio: allora `dati` c'è e i contatori sono 0 veri); `spento` = voce del Config a `no`,
  credenziale finta o tetto del giorno raggiunto (il `motivo` dice quale); `non_applicabile` = la fonte non
  vale per questa attività (es. TripAdvisor per una ferramenta); `errore` = la fonte non ha risposto.

### Vicini (OpenStreetMap / Overpass)

```jsonc
{
  "raggio_m": 400,
  "concorrenti": {
    "numero": 7,                                 // stesso tipo di attività nel raggio, lei esclusa
    "tipo_osm": "amenity=bar",                   // il tipo cercato
    "elenco": [ { "nome": "Bar Esempio", "tipo_osm": "amenity=cafe", "distanza_m": 120, "fonte": "https://www.openstreetmap.org/node/123",
                  "orari_osm": "Mo-Sa 07:00-20:00" | null } ]  // al massimo 10, dal più vicino; orari_osm = tag opening_hours com'è scritto, null dove manca (1.4)
  },
  "servizi": {                                   // conteggi nel raggio; 0 = contati, nessuno
    "fermate_bus": 3, "parcheggi": 2, "scuole": 1, "uffici_pubblici": 0, "farmacie": 1, "negozi_totali": 41
  }
}
```

### Meteo (MET Norway, `api.met.no`)

```jsonc
{ "giorni": [ { "data": "2026-11-27", "min_c": 3.1, "max_c": 9.4, "pioggia_mm": 1.2, "tempo": "pioggia" | "sole" | "nuvoloso" | "neve" | "nebbia" | "temporale" | "variabile" } ] }  // 7 giorni
```
Fonte da citare: «Dati meteo: MET Norway (api.met.no), licenza CC BY 4.0». Non Open-Meteo.

### Notizia (eventi e bandi, dalle fonti del radar)

```jsonc
{ "titolo": "string ≤180", "fonte": "https://… (la pagina della fonte)", "fonte_nome": "Comune di Piacenza — Eventi", "tipo": "eventi" | "bandi" }
```
Al massimo 8 eventi e 6 bandi. Sono titoli letti sulla pagina, non verificati uno per uno.

### ControlliSito (sulle pagine che n8n ha già scaricato, nessuna lettura in più)

```jsonc
{
  "indirizzo": "https://…",
  "https": true,
  "viewport_mobile": true,          // <meta name="viewport" … width=device-width>
  "titolo": "string | null",        // il <title>, al massimo 120 caratteri
  "descrizione": true,              // c'è <meta name="description"> non vuota
  "descrizione_caratteri": 142,     // null se non c'è
  "dati_strutturati": ["Restaurant", "LocalBusiness"]   // i @type dei blocchi ld+json; [] se nessuno
}
```
Se il sito non c'è o non è stato scaricato: `stato: "vuoto"` con il motivo.
**1.5 (AD, 26/11): solo https.** n8n apre i siti solo in https. Un sito dichiarato in http che in https non si apre esce `stato: "letto"` con `dati.https: false`, gli altri controlli `null` e il motivo «non è protetto»: è un dato vero, e un consiglio nel rapporto.

### ConcorrentiCanali (parte 12)

I 3-5 concorrenti più vicini di `vicini.concorrenti.elenco` (OpenStreetMap). Mai dati Google, mai pagine di
Meta lette di nascosto: il sito si legge solo se OpenStreetMap lo indica (tag `website`), con lo stesso
lettore e le stesse regole delle pagine del 12 (al massimo 2 pagine per concorrente); Instagram solo con
Business Discovery (account professionale di MyCity, voce `FONTE_INSTAGRAM`).

```jsonc
{
  "elenco": [ {
    "nome": "Bar Esempio", "distanza_m": 120, "fonte": "https://www.openstreetmap.org/node/123",
    "sito": { "c_e": true | false | null, "indirizzo": "https://… | null", "livello": "semplice" | "medio" | "pregio" | null,
              "https": true | null, "viewport_mobile": true | null, "motivo": "string | null" },
    "instagram": null | {                               // null + motivo in instagram_motivo se spento o non trovato
      "profilo": "nomeprofilo", "follower": 2300, "post_ultimi_30_giorni": 12,
      "formati": { "reel": 5, "foto": 4, "carosello": 3 },         // negli ultimi 30 giorni
      "interazioni_medie": 84,                                       // (mi piace + commenti) per post, ultimi 30 post
      "migliori": [ { "link": "https://www.instagram.com/p/…", "data": "2026-11-12", "formato": "reel", "interazioni": 410 } ],  // al massimo 3
      "orari": { "mattina": 3, "pranzo": 2, "pomeriggio": 4, "sera": 3 }   // ora di Roma: 6-11, 11-15, 15-19, 19-6
    },
    "instagram_motivo": "string | null",
    "posizione_google": 4 | null,                       // DataForSEO, sulla prima parola di `ricerche`; null = non letta o non tra i primi 30
    "letto_il": "ISO"
  } ]
}
```

### Google (Google Places API (New)) — spento di serie

```jsonc
{ "place_id": "ChIJ…" }     // e nient'altro: il resto lo mostra il riquadro ufficiale nel browser
```
Una sola chiamata (Text Search con il solo campo `places.id`). Nessun concorrente da Google.

### TripAdvisor (Content API) — spento finché non c'è un sì scritto; solo bar/ristoranti/hotel

```jsonc
{ "location_id": "123" }    // e nient'altro
```

### Recensioni (DataForSEO, recensioni Google) — spento di serie

```jsonc
{ "lette": 100, "con_risposta": 61, "ultima_il": "2026-11-20" }   // 1.4: niente voto medio né stelle
```
Numeri contati da n8n sulle recensioni lette da DataForSEO. I testi vanno solo all'AD, in memoria, mai al
sito, mai con nomi, foto o citazioni.

### Ricerche (DataForSEO) — spento di serie

```jsonc
{
  "zona": "Piacenza",
  "parole": [ { "parola": "bar piacenza", "ricerche_al_mese": 1900, "posizione": 7 | null } ]   // al massimo 10; posizione null = non tra i primi 100
}
```

### Instagram (Business Discovery) — spento di serie

```jsonc
{ "profilo": "nomeprofilo", "follower": 1240, "post_totali": 310, "post_ultimi_30_giorni": 6, "video_ultimi_30_giorni": 2, "ultimo_post_il": "2026-11-21",
  "formati": { "reel": 2, "foto": 3, "carosello": 1 }, "interazioni_medie": 41, "migliori": [ … ], "orari": { … } }   // come in ConcorrentiCanali (1.2)
```
Solo profili professionali pubblici; il nome del profilo è quello dell'attività, non di una persona.

## 2. Le nuove sezioni dell'AD (in `analisi.business`)

Come le sezioni di prima: frasi corte, ognuna con la sua `fonte` https; dove l'AD non ha fonti, la sezione è `[]`.

```jsonc
"reputazione_temi": [        // al massimo 6
  { "tema": "servizio veloce (≤80)", "tono": "positivo" | "negativo" | "misto", "quante": 14, "fonte": "https://dataforseo.com/" }
],                           // solo dalle recensioni DataForSEO; quante ≥ 3, altrimenti il tema non esce; niente frasi né citazioni
"confronto_concorrenti": [   // al massimo 5
  { "nome": "Bar Esempio", "distanza_m": 120 | null, "voto": 4.2 | null, "recensioni": 120 | null, "differenza": "≤200: cosa fa meglio o peggio di noi", "fonte": "https://…",
    "meglio": "≤200 | null: cosa fa meglio di noi (sito, social, contenuti)", "peggio": "≤200 | null: cosa fa peggio", "fonte_canali": "https://… | null" }   // 1.2
],
"idee_dal_confronto": [      // 1.2, parte 12: esattamente da 0 a 3 idee di contenuti nate dal confronto
  { "idea": "≤200", "perche": "≤200: cosa abbiamo visto nei concorrenti", "servizio": "foto_video" | "social" | "sito_web" | null, "fonte": "https://…" }
],
"parti": { "situazione": 1, "mercato": 3, "clienti": 2, "opportunita": 11, "rischi": 11, "prime_mosse": 11,
           "reputazione_temi": 2, "confronto_concorrenti": 3, "occasioni": 8, "soldi_pubblici": 9, "piano_30_giorni": 11, "idee_dal_confronto": 12 },
"occasioni": [               // al massimo 5: eventi, meteo, stagione nei prossimi 30 giorni
  { "quando": "2026-12-08" | null, "cosa": "≤160", "perche_conta": "≤200", "fonte": "https://…" }
],
"soldi_pubblici": [          // al massimo 4: bandi, voucher, contributi aperti
  { "bando": "≤160", "ente": "Camera di Commercio dell'Emilia", "scadenza": "2026-12-31" | null, "per_chi": "≤200", "fonte": "https://…" }
],
"piano_30_giorni": [         // da 0 a 8 passi, in ordine
  { "settimana": 1 | 2 | 3 | 4, "azione": "≤200", "servizio": "foto_video" | "sito_web" | "social" | "analisi" | null, "fonte": "https://…",
    "proposta": "10-160 caratteri: cosa facciamo NOI, senza prezzi né contatti | null (null se servizio è null)" }   // 1.3
]
```

- `distanza_m` viene da `fatti.vicini` (OpenStreetMap); `voto` e `recensioni` dei concorrenti solo da
  DataForSEO, oggi non letti: escono `null`. Un numero che non è in `fatti` n8n lo mette a `null`.
- `confronto_concorrenti` nomina solo concorrenti che stanno in `fatti.vicini.concorrenti.elenco`.
- Niente prezzi, telefoni, email, nomi di persone (stessi controlli di `business`).

## 3. Cosa fa il sito con un dato spento o vecchio

- `stato: "spento"` → la riga non si mostra (o «in arrivo»), mai «0».
- `conserva_fino_al`: oggi sempre `null` (1.4). Se un giorno un blocco lo porta, è un limite di legge o di licenza: passata la data quel dato non si tiene più. Il `place_id` di Google non scade.
- Ogni numero mostrato porta accanto `fonte_nome` e la data di `letto_il`; dove c'è `licenza`, anche quella.

## 4. Il lavoro per «Chiedi all'AD»

`fatti` va all'AD dentro `dati.fatti` della domanda dell'analisi del business, ridotto ai numeri
(niente elenchi lunghi, testi delle recensioni al massimo 40 frasi corte e senza nomi), e tutto il
lavoro resta **sotto i 64 KB** (prova automatica in `flussi/test/`).
