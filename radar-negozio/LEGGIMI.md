# Radar negozio — LEGGIMI

## In parole semplici
Sei davanti a un negozio e vuoi sapere, prima di entrare, come è messo online.
Fai una foto all'insegna e la mandi al bot Telegram dell'agenzia. Nient'altro.

Dopo qualche secondo il bot risponde «Ho letto *Pasticceria Aurora*». Poi, in genere entro 1-3 minuti, arrivano due messaggi:
- **la scheda**: un voto da 0 a 10 per Google, sito e social, cosa va e cosa no, fino a 3 cose da proporre (legate ai nostri servizi) e una frase per rompere il ghiaccio;
- **i dettagli**: i numeri della scheda Google, le misure del sito, i profili social con i link, le cose da chiedere a voce.

Esempio. Viene dalle prove, con dati finti, ma la forma è quella vera:

```
🏪 Pasticceria Aurora · pasticceria
📍 Via Po, 12, 10123 Torino TO, Italia
🟢 Presenza online: 7/10
Su Google va forte, il sito è lento e fermo al 2019. Instagram c'è ma pubblica poco.

🟢 Google 10/10 — 4,6★ con 212 recensioni
   ✔ 212 recensioni, quasi tutte da 5 stelle
   ✖ nessuna risposta alle recensioni (da verificare)
🟢 Sito 7/10 — lento da telefono: 38/100
   ✖ si carica in 6,1 s
   ✖ copyright fermo al 2019
🟡 Social 4/10 — Instagram con circa 1.200 follower, ultimo post a settembre

💡 Cosa proporre
1. Web & Digital: sito nuovo, veloce da telefono, con ordini delle torte — più ordini da chi cerca su Google
2. Social & Advertising: Instagram due volte a settimana — farsi vedere nel quartiere

🗣 Per rompere il ghiaccio
«Ho visto che avete 212 recensioni da 4,6: complimenti! Il sito però da telefono ci mette 6 secondi.»
```

Non inventa niente. I voti di Google e del sito escono da regole fisse, scritte più sotto. Claude scrive solo le frasi e il voto dei social.
Quando un dato è incerto (un profilo omonimo, un numero di follower letto in un risultato di ricerca) lo scrive, e lo mette tra le cose da verificare a voce.

## Come si usa (per chi va per negozi)
1. Apri la chat con il bot dell'agenzia su Telegram.
2. Fai la foto all'insegna: dritta, da vicino, ben leggibile. Se si vedono anche la vetrina e gli adesivi (Google, TripAdvisor, QR code), meglio.
3. Mandala come **foto normale**, non come file.
4. Facoltativo, nella didascalia: la città o la via, per esempio «via Roma, Torino».
   - Serve quando il nome è comune (Bar Sport, Pizzeria Italia) o quando sei fuori città.
   - Se non scrivi niente e la città non si legge sulla foto, il bot cerca nella città del Config.
5. Aspetta i messaggi. Non serve fare altro.

Se il bot non riesce a leggere l'insegna te lo dice, e ti chiede di rifare la foto o di scrivere il nome nella didascalia.

## Cosa devi fare (una volta sola)
Servono tre chiavi e cinque minuti in n8n.

1. **Un bot Telegram nuovo, solo per questo.** Su Telegram scrivi a @BotFather → `/newbot` → scegli il nome (per esempio «SDG Radar») → copia il token.
   - Perché un bot nuovo: un bot Telegram manda i messaggi a un solo indirizzo. Se usi lo stesso bot delle approvazioni, uno dei due workflow smette di ricevere.
2. **La chiave Google.** Su console.cloud.google.com, nel progetto dell'agenzia (serve un account di fatturazione):
   - API e servizi → Libreria → abilita **Places API (New)** e **PageSpeed Insights API**;
   - Credenziali → Crea credenziali → Chiave API;
   - nella chiave, «Limitazioni API»: lascia solo queste due API.
3. **La chiave Claude**: quella che usano già gli altri workflow va bene.
4. **In n8n crea le credenziali con questi nomi esatti.** Così, quando importi il workflow, n8n le collega da solo.

   | Tipo di credenziale | Nome | Cosa metterci |
   |---|---|---|
   | Telegram API | `Telegram - Radar negozio` | Access Token = il token di BotFather |
   | Anthropic | `Anthropic - Claude` | API Key = la chiave Claude |
   | Header Auth | `Google - Chiave API` | Name = `X-Goog-Api-Key`, Value = la chiave Google |

   Se la credenziale Anthropic esiste già con un altro nome, va bene lo stesso: dopo l'import la scegli nei 4 nodi «Claude: …».
5. **Importa il workflow**: Workflows → Import from File → `radar-negozio/09-radar-negozio.json`.
   Se il numero 09 è già usato da un altro workflow, rinominalo come preferisci.
6. **Nodo Config**: in `CITTA_PREDEFINITA` scrivi la città dove lavorate di solito (per esempio `Torino`). Premi **Publish**.
7. **Chi può usarlo.** Manda una foto al bot dal tuo telefono: ti risponde con il tuo codice chat.
   Scrivilo nel Config, in `CHAT_AUTORIZZATE`. Per più colleghi, separa i codici con una virgola: `123456789, 987654321`.
   Premi di nuovo **Publish** e rimanda la foto: questa volta arriva la scheda.
   - Chi non è nell'elenco riceve solo il suo codice. Non parte nessuna analisi e non si spende niente.

**Facoltativo: lo storico nel foglio «Prospetti».** Ogni scheda può diventare una riga di un foglio Google.
1. Crea un foglio Google con una scheda chiamata `Prospetti`. Nella prima riga metti queste intestazioni, scritte uguali:
   `Data`, `Negozio`, `Tipo`, `Indirizzo`, `Telefono`, `Voto totale`, `Voto Google`, `Voto sito`, `Voto social`, `Stelle`, `Recensioni`, `Sito`, `Instagram`, `Facebook`, `TikTok`, `Scheda Maps`, `Proposte`, `Rompighiaccio`, `Inviato da`, `Costo stimato $`.
2. Apri il nodo «Salva nel foglio Prospetti»: scegli la credenziale Google Sheets e incolla l'indirizzo del foglio.
3. Attiva il nodo (tasto destro → Activate, oppure il tasto D) e premi **Publish**.
   Di serie il nodo è spento perché n8n non pubblica un workflow con un nodo acceso ma senza credenziale.

## Quanto costa
- **Claude**: circa 0,30-0,50 $ a negozio. È una stima fatta a tavolino: il costo vero di ogni analisi è scritto in fondo ai dettagli («costo stimato»), calcolato dai token che dichiara l'API.
  Le tre chiamate sono: lettura della foto, ricerca dei social sul web (ogni ricerca costa 0,01 $), scrittura della scheda.
- **Google Places**: secondo i listini trovati in rete, 1.000 ricerche al mese sono gratis, poi circa 0,04 $ l'una (chiediamo anche le recensioni). Il listino di Google non l'ho potuto aprire da qui: controllalo nella console.
- **Google PageSpeed**: gratis.
- **Telegram**: gratis.

## Come vengono dati i voti

**Google** (0-10), dalla scheda Google Maps:

| Voce | Punti |
|---|---|
| la scheda esiste | 2 |
| stelle: da 4,5 in su 2 · da 4 a 4,4 1,5 · da 3,5 a 3,9 1 · sotto 0,5 | fino a 2 |
| recensioni: 200 o più 2 · 50 o più 1,5 · 15 o più 1 · almeno una 0,5 | fino a 2 |
| orari inseriti | 1 |
| telefono | 0,5 |
| sito collegato (un profilo Facebook o Instagram al posto del sito vale 0,5) | 1 |
| foto: 10 o più 1 · da 3 a 9 0,5 | fino a 1 |
| almeno una recensione negli ultimi 3 mesi (tra le 5 che Google mostra) | 0,5 |

Se la scheda non si trova il voto è 0. In quel caso controlla a mano: se davvero non c'è, è la prima cosa da proporre.

**Sito** (0-10), dalla home e da Google PageSpeed con un telefono simulato:

| Voce | Punti |
|---|---|
| il sito si apre (se non si apre, il voto è 1) | 2 |
| https | 1 |
| adatto al telefono | 1 |
| velocità da telefono: 90 o più 2 · da 50 a 89 1 · sotto 0 | fino a 2 |
| SEO di PageSpeed: 90 o più 1 · da 70 a 89 0,5 | fino a 1 |
| titolo e descrizione della pagina | 1 |
| telefono, WhatsApp o email cliccabili | 0,5 |
| link ai social | 0,5 |
| partita IVA in pagina (obbligatoria per le attività italiane) | 0,5 |
| anno del copyright recente (fermo a 2 o più anni fa: 0) | 0,5 |

Nessun sito: 0. Facebook o Instagram al posto del sito: 0, e i dettagli lo scrivono.
Quando una misura non riesce (per esempio il sito blocca i controlli automatici), quella voce prende metà punti e i dettagli lo dicono.

**Social** (0-10): lo dà Claude, con questa scala. 0 = nessun profilo; 1-3 = profili fermi da più di 3 mesi o quasi senza seguito; 4-6 = attivi almeno una volta al mese, seguito modesto; 7-8 = attivi ogni settimana, buon seguito; 9-10 = eccellenti su più piattaforme.

**Totale**: 40% Google + 30% sito + 30% social. Per un negozio di quartiere Google Maps conta di più. Se il voto dei social manca, il totale si fa sugli altri due.
Colori: 🟢 da 7 in su, 🟡 da 4 a 6, 🔴 sotto 4.

## Cosa non ho verificato
- **Nessuna prova con i servizi veri.** Ho provato il workflow dentro un **n8n vero (2.49.5)**, ma con Telegram, Claude, Google e il sito finti, scritti apposta (`prove/finti-servizi.mjs`). Le prove sono 11 casi e 95 controlli, tutti superati.
  Quindi so che i nodi si parlano, che i messaggi escono giusti e che gli errori sono gestiti. Non so ancora quanto sono buone le frasi di Claude sui negozi veri, quanto ci mette davvero e quanto costa davvero.
  Le prime 5-10 foto vere servono a questo: guardate le schede e il costo in fondo ai dettagli.
- **Le chiamate a Claude** seguono la documentazione dell'API (versione `2026-10-21`, ricerca web `web_search_20260209`, riserva automatica `fallbacks: "default"`), ma da qui non avevo una chiave per farne una vera.
- **Il listino di Google** e l'elenco di quali campi costano cosa non si aprivano da qui. I numeri sopra vengono dai risultati di ricerca.
- **PageSpeed con la chiave nell'intestazione `X-Goog-Api-Key`**: è il modo standard delle API Google, ma non l'ho visto funzionare dal vivo.
- **Instagram e Facebook non si leggono senza accesso.** Follower e data dell'ultimo post vengono dai risultati di ricerca: possono essere vecchi o approssimativi. Per questo ogni profilo ha la sua «sicurezza» (alta, media, bassa).
- **Google non dice** se il titolare risponde alle recensioni né se la scheda è rivendicata: finiscono tra le cose da verificare a voce.
- **Il nodo del foglio Google** non l'ho potuto provare: serve un account Google vero.
- **Versioni di n8n**: provato sulla 2.49.5. I nodi usati esistono anche nelle 1.x, ma lì non li ho visti girare.
- **Foto vere**: nessuna, solo una vetrina disegnata. Il bot prende la versione più grande che manda Telegram (di solito 1280 px).

---

## Dettagli tecnici

### Il percorso
1. **Foto dal telefono** (Telegram Trigger, solo `message`) → **Config** → **Controlla messaggio**: chat autorizzata? c'è una foto? Sceglie la misura più grande sotto i 4,5 MB.
2. **Scarica la foto** (nodo Telegram, file → get). La foto si scarica qui e non nel trigger: l'opzione «download» del Telegram Trigger 1.2 scarica prima di guardare il filtro delle chat, e così anche chi non è autorizzato farebbe scaricare file.
3. **Prepara lettura foto** controlla peso e formato (JPEG, PNG, WebP, GIF; HEIC no) → **Claude: leggi la foto** → **Leggi risposta foto**.
4. **Google: cerca il negozio** (Places API New, `places:searchText`, 3 risultati) → **Scegli scheda Google**: abbina per nome, telefono e via, dà il voto, decide quale sito controllare.
5. **Sito: scarica la home** (come un telefono Android) → **Sito: misura velocità** (PageSpeed, `strategy=mobile`) → **Analizza il sito**.
6. **Prepara ricerca social** → **Claude: cerca social** (ricerca web, al massimo 5 ricerche e 3 pagine aperte). Se la ricerca si ferma a metà (`pause_turn`) c'è un seguito, con la risposta parziale rimandata così com'è → **Leggi ricerca**.
7. **Prepara scheda** → **Claude: scrivi la scheda** → **Componi messaggi** → **Manda la scheda** → **Manda i dettagli** → **Prepara riga** → **Salva nel foglio Prospetti** (spento di serie).

### Claude
- Modello `claude-opus-5-5`, effort `medium`: si cambiano nel Config (`CLAUDE_MODELLO`, `CLAUDE_EFFORT`).
- Intestazioni: `anthropic-version: 2026-10-21` e `anthropic-beta: server-side-fallback-2026-07-01`. Con `fallbacks: "default"`, se un filtro di sicurezza blocca la risposta, l'API riprova da sola con un modello di riserva.
- La lettura della foto e la scheda usano `output_config.format` (JSON garantito dallo schema). La ricerca web no: le sue risposte hanno le citazioni, e le citazioni non vanno d'accordo con il formato JSON.
- Niente `temperature`: con la versione `2026-10-21` darebbe errore.

### Errori
- Ogni chiamata esterna ha «On Error: Continue». Claude e Google riprovano da soli (3 e 2 tentativi).
- La scheda arriva sempre. Se manca la parte di Claude, escono i soli dati misurati con un avviso; se manca Google o il sito, i dettagli dicono perché.
- I testi che arrivano da Claude o dai siti sono protetti per l'HTML di Telegram, tagliati alla lunghezza giusta, e i messaggi restano sotto i 4.096 caratteri.

### Il codice
- Il JSON da importare (`09-radar-negozio.json`) **si costruisce**: non va modificato a mano.
  Il codice dei nodi è in `sorgenti/nodi/`, le parti comuni in `sorgenti/comune/`, la struttura in `sorgenti/costruisci.mjs`.
  Dopo una modifica: `node sorgenti/costruisci.mjs`, poi le prove.
- Nei nodi Code di n8n 2.x (task runner) **`URL` non esiste**: gli indirizzi si leggono con le espressioni regolari. L'hanno scoperto le prove.

### Prove
```
sh prove/prepara-n8n.sh      # una volta: installa n8n 2.49.5 e Node 24 in prove/.n8n (circa 1 GB, 3-4 minuti)
node prove/prova-n8n.mjs     # 11 casi, 95 controlli, circa 3 minuti
```
- Le prove avviano un n8n vero, importano credenziali e workflow, pubblicano e aspettano che il trigger registri il webhook sul Telegram finto. Poi mandano i messaggi come farebbe Telegram, con il segreto giusto.
- Il workflow provato è quello vero: cambiano solo gli indirizzi di Claude, Places e PageSpeed, spostati sui servizi finti, e il Config (chat autorizzate e città).
- I casi: chat non autorizzata, messaggio senza foto, negozio con tutto (ricerca in pausa e ripresa), negozio senza niente online (ricerca in errore), sito che non si apre, Facebook al posto del sito, Claude che non scrive la scheda, testi lunghissimi e strani, insegna illeggibile, foto HEIC, file da 12 MB.
- Per vedere i messaggi d'esempio: `MOSTRA_MESSAGGI=1 node prove/prova-n8n.mjs`, poi `prove/.tmp/messaggi-esempio.json`.
- La porta di n8n nelle prove è la 5688: la 5679 è quella interna dei task runner di n8n.

### File
```
radar-negozio/
  09-radar-negozio.json      il workflow da importare (costruito)
  LEGGIMI.md                 questa guida
  sorgenti/costruisci.mjs    nodi, collegamenti, note
  sorgenti/nodi/*.js         il codice dei nodi Code
  sorgenti/comune/claude.js  lettura delle risposte di Claude e stima dei costi
  prove/prova-n8n.mjs        le prove in un n8n vero
  prove/finti-servizi.mjs    Telegram, Claude, Google e sito finti
  prove/materiale/           una vetrina disegnata e un finto HEIC
  prove/prepara-n8n.sh       installa n8n per le prove
```
