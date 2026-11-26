# Contratto del rapporto dell'imprenditore · n8n (flusso 26) → sito

Versione **1.1** · 26/11/2026 (1.1: il parere legale del 26/11 su Google, TripAdvisor e DataForSEO) · sessione «rapporto imprenditore — parte n8n».
Chi lo cambia lo dice all'altra parte prima. Si possono **aggiungere** campi; quelli scritti qui non si rinominano.

Dove viaggia: dentro la scheda che il 26 manda già al sito (`POST /api/agenzia/scheda-cliente`, stessa
credenziale), nell'oggetto `analisi`, accanto a `business` e `giudizio_sito`:

```
corpo.analisi.fatti                 ← i numeri raccolti da n8n (sezione 1)
corpo.analisi.business.reputazione_temi
corpo.analisi.business.confronto_concorrenti
corpo.analisi.business.occasioni
corpo.analisi.business.soldi_pubblici
corpo.analisi.business.piano_30_giorni   ← le nuove sezioni scritte dall'AD (sezione 2)
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
   arrivano mai al sito; al sito vanno solo temi con quante recensioni li citano (almeno 3). I blocchi
   DataForSEO portano `conserva_fino_al` = `letto_il` + 30 giorni: dopo, il sito cancella `dati`.
6. **I concorrenti si contano solo da OpenStreetMap.**
7. **Fonte spenta ≠ dato assente.** Una fonte a pagamento spenta dà `stato: "spento"`, e il sito non la
   mostra come «non trovato».

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
  "instagram":   Blocco<Instagram>      // gratis ma serve l'account professionale di MyCity, spento di serie
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
  "conserva_fino_al": "ISO | null",  // solo DataForSEO; null altrove
  "dati": { … } | null               // null quando stato ≠ "letto"
}
```

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
    "elenco": [ { "nome": "Bar Esempio", "tipo_osm": "amenity=cafe", "distanza_m": 120, "fonte": "https://www.openstreetmap.org/node/123" } ]  // al massimo 10, dal più vicino
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
{ "lette": 100, "voto_medio": 4.4, "per_stelle": { "1": 8, "2": 5, "3": 12, "4": 40, "5": 35 }, "con_risposta": 61, "ultima_il": "2026-11-20" }
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
{ "profilo": "nomeprofilo", "follower": 1240, "post_totali": 310, "post_ultimi_30_giorni": 6, "video_ultimi_30_giorni": 2, "ultimo_post_il": "2026-11-21" }
```
Solo profili professionali pubblici; il nome del profilo è quello dell'attività, non di una persona.

## 2. Le nuove sezioni dell'AD (in `analisi.business`)

Come le sezioni di prima: frasi corte, ognuna con la sua `fonte` https; dove l'AD non ha fonti, la sezione è `[]`.

```jsonc
"reputazione_temi": [        // al massimo 6
  { "tema": "servizio veloce (≤80)", "tono": "positivo" | "negativo" | "misto", "quante": 14, "fonte": "https://dataforseo.com/" }
],                           // solo dalle recensioni DataForSEO; quante ≥ 3, altrimenti il tema non esce; niente frasi né citazioni
"confronto_concorrenti": [   // al massimo 5
  { "nome": "Bar Esempio", "distanza_m": 120 | null, "voto": 4.2 | null, "recensioni": 120 | null, "differenza": "≤200: cosa fa meglio o peggio di noi", "fonte": "https://…" }
],
"occasioni": [               // al massimo 5: eventi, meteo, stagione nei prossimi 30 giorni
  { "quando": "2026-12-08" | null, "cosa": "≤160", "perche_conta": "≤200", "fonte": "https://…" }
],
"soldi_pubblici": [          // al massimo 4: bandi, voucher, contributi aperti
  { "bando": "≤160", "ente": "Camera di Commercio dell'Emilia", "scadenza": "2026-12-31" | null, "per_chi": "≤200", "fonte": "https://…" }
],
"piano_30_giorni": [         // da 0 a 8 passi, in ordine
  { "settimana": 1 | 2 | 3 | 4, "azione": "≤200", "servizio": "foto_video" | "sito_web" | "social" | "analisi" | null, "fonte": "https://…" }
]
```

- `distanza_m` viene da `fatti.vicini` (OpenStreetMap); `voto` e `recensioni` dei concorrenti solo da
  DataForSEO, oggi non letti: escono `null`. Un numero che non è in `fatti` n8n lo mette a `null`.
- `confronto_concorrenti` nomina solo concorrenti che stanno in `fatti.vicini.concorrenti.elenco`.
- Niente prezzi, telefoni, email, nomi di persone (stessi controlli di `business`).

## 3. Cosa fa il sito con un dato spento o vecchio

- `stato: "spento"` → la riga non si mostra (o «in arrivo»), mai «0».
- `conserva_fino_al` passata → si cancella `dati` (resta `place_id`), si mostra «da rileggere».
- Ogni numero mostrato porta accanto `fonte_nome` e la data di `letto_il`; dove c'è `licenza`, anche quella.

## 4. Il lavoro per «Chiedi all'AD»

`fatti` va all'AD dentro `dati.fatti` della domanda dell'analisi del business, ridotto ai numeri
(niente elenchi lunghi, testi delle recensioni al massimo 40 frasi corte e senza nomi), e tutto il
lavoro resta **sotto i 64 KB** (prova automatica in `flussi/test/`).
