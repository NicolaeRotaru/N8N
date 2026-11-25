# flussi/ — i flussi n8n che si costruiscono da programma

I flussi n8n nati dal 24/11/2026 su richiesta di Nicola. Non si correggono a mano nell'editor di n8n:
si cambia il programma qui e lo si rilancia, così quello che gira su n8n e quello che sta nel
repository restano uguali.

> Questo repository è **pubblico**. Qui non entrano gli ID del foglio Clienti, della cartella Drive,
> della chat Telegram, né chiavi o segreti: i programmi li prendono da n8n quando caricano il flusso.

## 16 · Nuovo cliente da MyCity

**A cosa serve.** Quando un'attività si iscrive su MyCity (la pagina «Vendi su MyCity»), entra da sola
nella scheda Clienti dell'agenzia, con lo stesso lavoro del **modulo 12**: Claude cerca le fonti
pubbliche, prepara la scheda, la riga si scrive con **attivo = no**, e a Nicola arriva l'anteprima su
Telegram.

**Come funziona.** `16-nuovo-cliente-da-mycity/genera.mjs` scarica da n8n il modulo 12 vero e ne fa una
copia dove:

- al posto del modulo da compilare c'è un indirizzo (webhook) che il sito chiama col segreto
  `x-mycity-segreto`;
- le pagine 1-3 si compilano coi valori che il 12 stesso ha proposto;
- la pagina 4 conferma da sola, **tranne** sul possibile doppione: lì non scrive e avvisa;
- se la ricerca di Claude si ferma, non scrive una scheda vuota: avvisa;
- la stessa attività una volta sola in 7 giorni, al massimo 10 attività al giorno (il credito di Claude);
- **la ricerca la fa l'AD col piano Max** («Chiedi all'AD»), come nel 12: nessuna API di IA a pagamento
  (Nicola, 24/11). Se nel 12 tornasse un nodo verso l'API di Claude, il generatore spegne la ricerca
  (`RICERCA_CON_CLAUDE = no`): senza ricerca la riga non si scrive e arriva l'avviso su Telegram;
- i due nodi con cui il 12 iscrive un cliente nuovo in MyCity («Prepara l'iscrizione in MyCity» e
  «Iscrivi in MyCity», che chiamano il flusso 20) restano fuori: chi arriva al 16 su MyCity c'è già.

Tutto il resto è il codice del 12, copiato com'è. **Quando cambi il modulo 12, rilancia il generatore.**
Se nel 12 manca la voce `RICERCA_CON_CLAUDE`, il generatore si ferma invece di produrre un 16 che paga Claude.

**Ultimo passo: le bozze dei 3 abbonamenti.** Comunque sia andata la scheda Clienti (scritta, doppione,
ricerca fermata, prova), il 16 chiama il flusso **19 · Bozze dei 3 abbonamenti** e gli passa la lettura
del web che il 12 ha appena fatto: è la parte su misura delle proposte. Non lo aspetta: se le bozze si
guastano, la scheda resta com'è. Il generatore trova il 19 per nome su n8n (o con `--bozze <id>`). n8n
vuole il 19 acceso prima di accettare il 16 che lo chiama. Con `--sito`, dallo stesso passo la scheda va
anche al sito.

**L'analisi subito, la scheda e la pagella dopo l'abbonamento** (Nicola, 25/11/2026). Il 16 **non chiama
più il 18**: la pagella parte dal sito al primo abbonamento pagato. La scheda che il 16 manda al sito resta
lì chiusa: finché l'attività non paga, il sito ne usa solo l'analisi (per il preventivo su misura e la
pagina «Analisi del business»). Le attività create dal modulo 12 (flusso 20) arrivano al 16 dal sito
stesso, come quelle che si iscrivono da sole: la ricerca si rifà una volta (col piano Max), e il 16 trova
il doppione nel foglio Clienti e non riscrive la riga.

```bash
N8N_API_KEY=… node flussi/16-nuovo-cliente-da-mycity/genera.mjs --credenziale <id credenziale del segreto> --vero --manda
```

Senza `--vero` il 16 resta in «prova»: cerca (e costa) ma non scrive. Senza `--manda` controlla soltanto.

**Dal lato del sito** (repository `mycity`): le variabili `N8N_NUOVO_CLIENTE_WEBHOOK_URL`
(`https://n8n-shdy.sliplane.app/webhook/mycity-nuovo-cliente`) e `N8N_NUOVO_CLIENTE_SEGRETO` (lo stesso
valore della credenziale «MyCity - Segreto nuovo cliente» in n8n). Senza tutte e due il sito non manda niente.

## 18 · Analisi di un'attività

**A cosa serve.** La stessa analisi del 17, fatta su una sola attività di MyCity: a che punto è per
arrivare al primo incasso. Legge in sola lettura, e senza dati personali del titolare, la scheda
dell'attività, i suoi prodotti, i suoi ordini, le sue recensioni e quanti prodotti hanno in media gli
altri negozi. Calcola approvazione, pagamenti con carta, vetrina (logo, foto, descrizione, orari,
indirizzo, sito, social), prodotti senza foto o senza prezzo, ordini, incassi, clienti tornati, coi
segnali del giro (payout fermo, ordini fermi, negozio fermo da 14 giorni, recensioni basse) e quelli
dell'avvio (da approvare, nessun prodotto, vetrina incompleta, niente carta). Claude scrive il punto
adesso, le prossime mosse e le domande per il titolare, dentro i paletti di MyCity. Tutto va a Nicola
su Telegram.

**Chi lo fa partire.** Dal 25/11/2026 il **sito**, al primo abbonamento pagato (Nicola: la pagella arriva
solo dopo l'abbonamento). Sul sito servono la variabile `N8N_PAGELLA_WEBHOOK_URL` =
`https://n8n-shdy.sliplane.app/webhook/mycity-analisi-attivita` e `N8N_NUOVO_CLIENTE_SEGRETO` (c'è già).
Non più il 16, e il 18 non chiama più il 19. Oppure a mano, col webhook protetto dallo stesso segreto del 16:

```bash
curl -X POST https://n8n-shdy.sliplane.app/webhook/mycity-analisi-attivita -H "x-mycity-segreto: <segreto>" -H "content-type: application/json" -d '{"id":"<id MyCity dell attività>"}'
```

```bash
N8N_API_KEY=… node flussi/18-analisi-attivita/costruisci.mjs --manda --marketplace <id credenziale Supabase> --segreto <id credenziale del segreto>
```

## 19 · Bozze dei 3 abbonamenti

**A cosa serve.** Per un'attività nuova di MyCity prepara le tre proposte di abbonamento — Base, Business
e Premium — pronte da copiare su WhatsApp. Le scrive il codice, non un'IA: i testi di ogni fascia sono
quelli del listino del sito (`mycity/lib/agenzia/preventivo.ts`, `FASCE`), e dentro ci mette i dati veri
della vetrina: quanti prodotti sono senza foto, quante foto del locale ha la copertina, se c'è un video,
se ha un sito, quali social e se la scheda Google li ha indicati. Se arriva la ricerca sul web del modulo
12, aggiunge un punto di forza in apertura e due idee per i post, e lo dice nei controlli. Segna la fascia
consigliata con la stessa regola del sito (150 prodotti o più → Premium; foto, video o sito da fare →
Business; altrimenti Base). I canoni li legge da `site_settings.agenzia.abbonamenti`, con le regole del sito.

**Dove vanno.** A Nicola su Telegram, in quattro messaggi: il riepilogo (cosa ho letto, da chiedere al
titolare, cosa controllare prima di mandare) e una bozza per abbonamento. **Al titolare non parte niente**:
il programma `controlla()` ferma ogni nodo che scriva a qualcuno che non sia la chat di Nicola nel Config.

**Chi lo fa partire.** Il 16, come ultimo passo, senza aspettarlo. Quindi la catena è: iscrizione su MyCity
→ 16 (scheda Clienti e ricerca) → 19 (bozze). Il 18 (pagella) parte a parte, dal sito, al primo abbonamento
pagato (25/11/2026). Oppure a mano, col webhook protetto dallo stesso segreto del 16:

```bash
curl -X POST https://n8n-shdy.sliplane.app/webhook/mycity-bozze-abbonamenti -H "x-mycity-segreto: <segreto>" -H "content-type: application/json" -d '{"id":"<id MyCity dell attività>"}'
```

**Il listino resta uguale al sito.** La prova `il listino copiato nel 19 è parola per parola quello del sito`
legge `../mycity/lib/agenzia/preventivo.ts` (o `MYCITY_REPO`) e diventa rossa se lì cambia un testo, un
canone di listino o uno scontrino di partenza. Senza il sito accanto la prova si salta e lo dice.

```bash
N8N_API_KEY=… node flussi/19-bozze-abbonamenti/costruisci.mjs --manda --marketplace <id credenziale Supabase> --segreto <id credenziale del segreto>
```

Dopo il 19, il 16 si rigenera con `--manda` (trova il 19 per nome) o con `--bozze <id del 19>`. Il 18 non
chiama più il 19: il suo controllo si ferma se qualcuno ci rimette la chiamata.

**Senza la chiave dell'API, col collegamento MCP a n8n.** `--sdk <file>` scrive lo stesso flusso in codice
SDK (`flussi/in-sdk.mjs`), che gli strumenti `validate_workflow` e `create_workflow_from_code` accettano;
con `--telegram <id> --chat <id>` le credenziali e la chat si passano a mano. Il file con la chat non va
nel repository.

## 97 · Scrivi nell'argomento dell'attività

**A cosa serve.** Nicola, 25/11/2026: i messaggi divisi per argomento su Telegram, «un solo posto per attività».
I gruppi sono tre, con dentro solo Nicola e il bot: **Attività** (con gli argomenti accesi, uno per negozio),
**Marketplace** (il giro del mattino) e **Tecnica** (scarti ed errori).

**Come funziona.** Chi ha messaggi su un negozio chiama il 97 con una voce per messaggio `{ id, nome, messaggio }`.
Il 97 cerca l'argomento nella tabella dati «Argomenti delle attività» (id MyCity + gruppo); se non c'è lo fa aprire
all'officina (`POST /telegram/argomento`, la chiave del bot sta lì) e lo segna; poi manda i messaggi
nell'argomento. Lo chiamano le bozze dei 3 abbonamenti (all'iscrizione, dal 16) e l'analisi di un'attività (dopo
il primo abbonamento pagato, dal sito; lo aspetta). Dal 25/11/2026 i due non partono più insieme: l'argomento di
un negozio nuovo lo apre il primo che scrive, una volta sola.

**Finché un gruppo non c'è non cambia niente.** Nei Config: `CHAT_ATTIVITA` (97), `CHAT_MARKETPLACE` (analisi
del marketplace), `CHAT_TECNICA` (analisi e bozze, per gli scarti). Vuoti = chat privata, come prima. Se l'officina
non apre l'argomento, i messaggi vanno nello spazio generale del gruppo col nome del negozio in testa e il perché.

```bash
N8N_API_KEY=… node flussi/97-argomento-attivita/costruisci.mjs --manda --officina <id credenziale «Officina - Chiave»> --tabella <id tabella>
```

Dopo il 97, l'analisi e le bozze si ricostruiscono con `--argomento <id del 97>` (con `--manda` lo trovano per nome).
Senza `--argomento` restano come prima, col Telegram diretto.

**Nomi su n8n.** Il 97 è nel gruppo «9x sistema» (il 20 era già preso). I programmi lo trovano con
`nomi.mjs` (`NOMI.argomentoAttivita`), come gli altri flussi.

## 17 · Analisi del marketplace

**A cosa serve.** È il giro dell'AD sui numeri di MyCity (`ad-mycity/cervello/giro.md`, passo 1, con le
sentinelle di `sentinella-dati.mjs`), senza la radiografia. Ogni mattina alle 8:10:

1. legge il database di MyCity **solo in lettura** (ordini, profili senza dati personali, prodotti,
   carrelli, recensioni, quanti lead) e guarda se il sito risponde;
2. calcola i numeri chiave e le sentinelle, con le soglie dell'AD;
3. li confronta col giro prima;
4. chiede a Claude il commento: il punto adesso, cosa propone, opportunità, rischi;
5. manda il briefing a Nicola su Telegram;
6. se acceso nel Config (`SALVA_NEL_PANNELLO = si` e `MEMORIA_URL`), salva il riassunto nella tabella
   `briefings` della memoria dell'AD, la card in alto del Pannello.

Le regole: **i numeri li fa il codice, mai Claude**; una tabella che non si legge è «non misurato», mai
zero; se il database restituisce meno righe di quelle che ha, il messaggio lo dice.

```bash
N8N_API_KEY=… node flussi/17-analisi-marketplace/costruisci.mjs --manda --marketplace <id credenziale Supabase>
```

**Per accenderlo:** in n8n apri la credenziale «Supabase MyCity - Marketplace (lettura)», incolla la
chiave del database di MyCity (la stessa che l'AD usa come `MARKETPLACE_SUPABASE_KEY`), poi accendi il flusso.

## Chiedi all'AD · niente più API di Claude a pagamento

**Perché.** Decisione di Nicola del 24/11/2026: nessun flusso n8n acceso chiama più l'API di Claude a
pagamento. Il lavoro con l'IA lo fa l'AD col piano Max, attraverso la routine «Chiedi all'AD».

**Il sotto-flusso «Chiedi all'AD»** (`chiedi-all-ad/costruisci.mjs`). Lo chiamano gli altri flussi con
«Esegui un flusso», una volta per tutti gli elementi. Riceve uno o più lavori `{ flusso, compito, dati,
schema }` e restituisce un elemento per lavoro `{ ok, flusso, risultato, avvisi, errore, dalla_memoria, prova }`.
Dentro:

- tanti lavori diventano **una corsa sola** della routine (es. tutti i testi del giro);
- **memoria**: se compito e dati sono uguali all'ultima volta per quel flusso, ridà la risposta di allora
  senza far partire la routine;
- **tetti**: al massimo 40 corse al giorno e 25 in un'ora (la routine ne accetta 30: il resto è riserva),
  contati nella memoria del flusso; una corsa che non parte non si conta;
- fa partire la routine (`POST /v1/claude_code/routines/<id>/fire`) con dentro l'indirizzo di ritorno
  (`$execution.resumeUrl`), poi **aspetta** col nodo Wait al massimo 15 minuti la risposta dell'AD;
- se un lavoro ha `non_mandare` (per esempio servono foto che non possono arrivare), non parte niente;
- **MODALITA = prova** (di serie): la routine non parte e non si conta; il flusso aspetta 2 minuti e torna
  con `prova = true`. In prova, mentre aspetta, si può rispondere a mano all'indirizzo `rispondi_a` che
  «Prepara il lavoro» mostra.

```bash
N8N_API_KEY=… node flussi/chiedi-all-ad/costruisci.mjs --manda --routine <id della routine>   # prova
N8N_API_KEY=… node flussi/chiedi-all-ad/costruisci.mjs --manda --vero                         # vero
```

La prima volta crea la credenziale **«Chiedi all'AD - chiave della routine»** (Header Auth) con un valore
finto. **Nicola** crea la chiave dalla pagina web della routine e la incolla lì: nome `Authorization`,
valore `Bearer <chiave>`. Mai nel repository, mai in chat.

**Collegare un flusso** (`chiedi-all-ad/collega.mjs 01|04|08|12`). Ogni nodo HTTP verso
`api.anthropic.com/v1/messages` diventa tre nodi: «Per l'AD: …» (la richiesta di prima diventa un
lavoro), «Chiedi all'AD: …» (chiama il sotto-flusso e lo aspetta) e «Dall'AD: …» (rimette la risposta
nella forma che il nodo dopo leggeva da Claude). Il resto del flusso non cambia: se l'AD non risponde, il
flusso segue la strada che seguiva quando Claude non rispondeva. Le foto mandate dentro il messaggio
(base64) non arrivano all'AD; quelle con un indirizzo web sì, se la rete della routine lo apre.

```bash
N8N_API_KEY=… node flussi/chiedi-all-ad/collega.mjs 04 --manda --salva /tmp/04-prima.json
```

Collegati il 25/11/2026: **01** (controllo finale: se non riesce, pubblica lo stesso con la nota), **04**
(i testi, senza la foto), **08** (le foto non possono arrivare: il lavoro non parte e il 08 va avanti senza
IA, finché Nicola non apre gli indirizzi delle foto nella rete della routine), **18** (dal suo
`costruisci.mjs`; il commento resta spento). Il **99** non chiede più spiegazioni:
`99-avvisi-errori/togli-spiegazione-ai.mjs --manda`, l'avviso parte uguale. Il **12** è collegato dalle 14:05
circa (col via della sessione che lo segue): RICERCA_CON_CLAUDE = si, perché il ramo ora va all'AD; la lettura
delle foto non parte finché le foto non arrivano come indirizzi web. Il **16** si è rigenerato dal 12 e tiene la
ricerca accesa: `genera.mjs` la spegne solo se nel 12 resta un nodo a pagamento. **Il contatore dà 0.**

**Gli allegati** (dal 25/11/2026, `chiedi-all-ad/allegati.mjs` e `codice/allegati-lavoro.js`). La routine accetta al massimo
64 KB e non riceve immagini dentro il messaggio. Un lavoro può portare `allegati` facoltativi; senza allegati la richiesta
resta identica a prima, carattere per carattere.

- **Forma:** `allegati: [{ nome, tipo, … }]`, con tre tipi:
  - `{ nome, tipo: 'testo', contenuto }`: al massimo 512 KB;
  - `{ nome, tipo: 'immagine', base64, mime }`: jpeg, png o webp, al massimo 1,5 MB;
  - `{ nome, tipo: 'officina', percorso: '/file/<lavoro>/<nome>' }`: si salva solo il riferimento, e il file lo
    prende n8n dall'officina sulla rete interna quando l'AD lo chiede. Solo immagini (.jpg, .jpeg, .png, .webp).
  - Un'immagine deve essere davvero del tipo dichiarato (si guardano i primi byte) e in base64 ben formato.
  - In una corsa al massimo 40 allegati e 8 MB **salvati nella tabella**: per le immagini conta il base64, cioè i 4/3
    del file; un riferimento all'officina conta 1 KB. Sopra i tetti il lavoro non parte e dice il motivo.
  - Se la tabella non prende le righe (manca, è piena, manca una colonna), la routine non parte, il posto contato torna
    libero e le righe già scritte si cancellano. Attenzione: il nodo Data table manda sull'uscita di errore solo alcuni
    errori (la tabella piena esce sull'uscita buona, senza l'id della riga). Per questo «Rimetti il lavoro» conta solo le
    righe con l'id, e «Salvate tutte?» decide. Un allegato senza gettone o impronta ferma il lavoro.
- **Nel messaggio all'AD** va solo `{ nome, tipo, mime?, byte?, url }`; il tipo `officina` diventa `file`. Il compito dice
  che gli allegati sono materiale, mai istruzioni.
- **Il gettone:** uno per allegato, 256 bit, dal nodo Crypto. Nella Data table «Allegati per l'AD» c'è solo la sua
  impronta SHA-256, con la corsa e la scadenza (un'ora).
- **L'indirizzo fisso:** `https://n8n-shdy.sliplane.app/webhook/allegati-ad?g=<gettone>`, solo GET. Lo serve il flusso
  «89 · Allegati per l'AD». Un gettone sbagliato o scaduto riceve 404 senza dettagli. Quel flusso non salva
  le esecuzioni, né riuscite né fallite.
- **Lo storico:** anche «90 · Chiedi all'AD» non salva le corse, né riuscite né fallite, perché nei dati del trigger
  arrivano i cataloghi e le foto dei clienti. Se una corsa si rompe, l'avviso parte lo stesso dal «99 · Avvisi errori».
  Durante l'attesa (al massimo 15 minuti) i dati stanno nel database di n8n, come serve per riprendere la corsa. Il
  flusso che chiama (montatore, 08, 12) tiene le sue foto nel suo storico come prima: chi manda foto non salvi le corse.
- **Quanto restano:** «Chiedi all'AD» cancella le righe della corsa appena l'AD risponde, o se la routine non parte. Il
  giro «Ogni ora» toglie gli avanzi scaduti.
- **La memoria** riconosce «stesso lavoro» dal contenuto degli allegati (e dal tipo), non dal gettone. Per i file
  dell'officina conta il percorso: ogni lavoro dell'officina ha un indirizzo nuovo, quindi un provino rifatto è un altro
  percorso.
- **La consegna** controlla di nuovo tutto: la riga deve avere proprio l'impronta del gettone arrivato, essere viva, e un
  file esce solo se è jpeg, png o webp, con `x-content-type-options: nosniff` e `content-disposition: attachment`. Se
  la tabella manca risponde 404.
- **Lo spazio:** in n8n 2.49 tutte le Data table insieme hanno un tetto di 200 MB di serie (`N8N_DATA_TABLES_MAX_SIZE_BYTES`).
  «Chiedi all'AD» conta nella sua memoria gli allegati vivi delle corse in corso. Se con la corsa nuova si supera
  `ALLEGATI_SOGLIA_MB` (40 di serie), il lavoro non parte e lo dice. Il conto è prudente: ogni riga vale almeno 1 KB. Una
  voce dura quanto la corsa, cioè l'attesa più 5 minuti: quando l'attesa scade n8n non salva la memoria toccata dopo la
  ripresa, e la voce resterebbe a occupare spazio che non c'è più. Su Postgres lo spazio misurato da n8n può scendere solo dopo il vacuum del
  database, non subito con le cancellazioni.
- **Da fare una volta su n8n:** creare la Data table «Allegati per l'AD» con le colonne `impronta`, `corsa`, `nome`,
  `tipo`, `mime`, `contenuto` (testo) e `scade` (numero). Poi:

```bash
N8N_API_KEY=… node flussi/chiedi-all-ad/allegati.mjs --manda    # crea il flusso spento; si accende a mano
N8N_API_KEY=… node flussi/chiedi-all-ad/costruisci.mjs --manda  # «Chiedi all'AD» con i nodi degli allegati
```

**Il contatore** (`conta-api-claude.mjs`). Conta i nodi verso l'API di Claude a pagamento nei flussi
accesi e in quelli che possono far partire (sotto-flussi e flusso degli errori). Il risultato giusto è
zero: se ne trova, esce con 1 e li elenca. La partenza della routine non conta.

```bash
N8N_API_KEY=… node flussi/conta-api-claude.mjs

## Il lavoro meccanico del server dell'AD (21-25, 98)

Dal 25/11/2026. Il server dell'AD è spento per sempre (Nicola, 24/11): i lavori a orario che un
programma fa sempre uguale girano qui, **senza IA e senza token**. Tutti nascono **spenti** e in
**MODALITA prova** (calcolano e ricordano, non mandano niente): si passa a «vero» nel Config o
ricostruendo con `--vero`. Ogni errore va al «99 · Avvisi errori». I pezzi comuni stanno in `comune.mjs`.

- **21 · Sentinella dei dati** — ogni 15 minuti, sola lettura sul database di MyCity: payout fermi,
  ordini oltre lo slot promesso, carrelli da recuperare, recensioni basse nuove, negozi fermi, calo
  ordini, marketplace fermo. Le soglie sono quelle di `ad-mycity/cervello/sentinella-dati.mjs`.
  Avvisa solo quando qualcosa cambia. Ripara due controlli che nel cervello non vedevano niente: i
  carrelli (chiedeva la colonna `id`, che `abandoned_carts` non ha: risposta 400) e gli ordini in
  ritardo (cercava `expected_delivery`, che non esiste: lo slot è un testo, «Oggi · 11:00–13:00»).
  Il 25/11 i due numeri veri erano 4 e 4.
- **22 · Sito che risponde** — ogni 5 minuti, la pagina iniziale e `/api/health/ready`. Stati: su ·
  degradato (lavori automatici del sito fermi) · giù (due controlli falliti di fila). Avvisa al cambio.
- **98 · Salute di n8n** — chiamato dal 17 alle 8:10: flussi accesi, ultimo giro buono, falliti in
  24 ore; il testo finisce in fondo al messaggio del 17. Vuole la credenziale «n8n - API (lettura)»
  (Header Auth `X-N8N-API-KEY`, chiave da Settings → n8n API).
- **23 · Mani del Pannello** — webhook `mycity-mani`: le azioni approvate nel Pannello dell'AD
  (`pannello/src/lib/mani-n8n.ts`) arrivano qui. **Un'azione 🔴 parte solo se firmata da Nicola**,
  controllato nel Pannello e di nuovo qui; la stessa azione una volta sola; oggi l'unico canale
  collegato è `telegram`, gli altri tornano «in coda» col motivo. Vuole la credenziale «MyCity -
  Segreto mani del Pannello» (Header Auth `x-mycity-segreto`), con lo stesso valore di
  `N8N_WEBHOOK_SEGRETO` nel Pannello, e `N8N_WEBHOOK_URL` = l'indirizzo di produzione del webhook.
- **24 · Radar del web** — alle 6:30 scarica le fonti del radar dell'AD (`24-radar-web/codice/fonti.json`,
  copia di `ad-mycity/cervello/radar-fonti.json` senza la ricerca Google; le settimanali il lunedì),
  tiene solo i titoli nuovi e chiede all'AD, tramite «Chiedi all'AD», quali contano per MyCity. Se l'AD
  non risponde arrivano i titoli per fonte; senza novità nessun messaggio.
- **25 · Numeri del mattino e della sera** — alle 6 il piano del mattino, alle 18 il report della sera.
  I numeri li calcola lo stesso codice del 17 (`17-analisi-marketplace/codice/calcola-numeri.js`), il
  testo lo scrive l'AD tramite «Chiedi all'AD». Se l'AD non risponde arrivano i soli numeri, detto.
  In prova i lavori partono con `non_mandare`: la routine dell'AD non si accende e non si conta.

```bash
N8N_API_KEY=… node flussi/21-sentinella-dati/costruisci.mjs --manda   # la chiave del database la prende dal 17
N8N_API_KEY=… node flussi/22-sito-risponde/costruisci.mjs --manda
N8N_API_KEY=… node flussi/24-radar-web/costruisci.mjs --manda               # trova «Chiedi all'AD» per nome
N8N_API_KEY=… node flussi/25-numeri-mattino-sera/costruisci.mjs --manda
N8N_API_KEY=… node flussi/98-salute-n8n/costruisci.mjs --manda        # poi rilancia il 17: trova il 98 per nome
N8N_API_KEY=… node flussi/23-mani-pannello/costruisci.mjs --manda --segreto <id credenziale>
```

## Le prove

```bash
node --test "flussi/test/*.test.mjs"
```

Girano senza n8n e senza database: il codice dei nodi si esegue su dati finti (`test/esegui-codice.mjs`
imita `$('Nodo')`, `$input`, la memoria del flusso e `$execution.resumeUrl`). Il modulo 12 vero non sta qui: le prove del 16
usano un modulo 12 in miniatura con gli stessi nomi di nodo.

## Il client dell'API

`n8n-api.mjs` parla con l'API pubblica di n8n. Vuole `N8N_API_KEY` (n8n → Settings → n8n API) e
facoltativamente `N8N_URL`. Dietro un proxy, con Node 22: `NODE_USE_ENV_PROXY=1`.

## Strumenti per mettere in ordine n8n

Il piano intero è in `PIANO-ORDINE.md`.

- **`copia-di-sicurezza.mjs`** salva tutti i flussi (vivi e archiviati, senza pinData) e l'elenco delle
  credenziali (solo id, nome e tipo). Si rifiuta di scrivere dentro un repository pubblico.
  `node flussi/copia-di-sicurezza.mjs <cartella>`, poi `--verifica <cartella>`.
- **`snellisci-aiuti.mjs`** toglie da ogni nodo Code gli aiuti comuni che quel nodo non usa. Lavora su un
  file esportato e non parla con n8n: `node flussi/snellisci-aiuti.mjs <flusso.json> --scrivi <uscita.json>`.
