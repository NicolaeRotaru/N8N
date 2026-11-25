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
- **la ricerca con Claude è sempre spenta** (`RICERCA_CON_CLAUDE = no` nel Config, imposto dal
  generatore): nessuna API di IA a pagamento, decisione di Nicola del 24/11. Senza ricerca la riga non
  si scrive e arriva l'avviso su Telegram; l'analisi del 18 e la scheda al sito partono lo stesso. La
  ricerca tornerà quando la fa l'AD col piano Max («Chiedi all'AD»);
- i due nodi con cui il 12 iscrive un cliente nuovo in MyCity («Prepara l'iscrizione in MyCity» e
  «Iscrivi in MyCity», che chiamano il flusso 20) restano fuori: chi arriva al 16 su MyCity c'è già.

Tutto il resto è il codice del 12, copiato com'è. **Quando cambi il modulo 12, rilancia il generatore.**
Se nel 12 manca la voce `RICERCA_CON_CLAUDE`, il generatore si ferma invece di produrre un 16 che paga Claude.

**Ultimo passo: l'analisi dell'attività.** Comunque sia andata la scheda Clienti (scritta, doppione,
ricerca fermata, prova), il 16 chiama il flusso **18 · Analisi di un'attività** e gli passa la lettura
del web che il 12 ha appena fatto. Non lo aspetta: se l'analisi si guasta, la scheda resta com'è. Il
generatore trova il 18 per nome su n8n (o con `--analisi <id>`). n8n vuole il 18 acceso prima di
accettare il 16 che lo chiama.

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

**Chi lo fa partire.** Il 16, alla fine di ogni iscrizione. Oppure a mano, col webhook protetto dallo
stesso segreto del 16:

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

**Chi lo fa partire.** Il 18, come ultimo passo, senza aspettarlo. Quindi la catena è: iscrizione su MyCity
→ 16 (scheda Clienti) → 18 (analisi) → 19 (bozze). Oppure a mano, col webhook protetto dallo stesso segreto del 16:

```bash
curl -X POST https://n8n-shdy.sliplane.app/webhook/mycity-bozze-abbonamenti -H "x-mycity-segreto: <segreto>" -H "content-type: application/json" -d '{"id":"<id MyCity dell attività>"}'
```

**Il listino resta uguale al sito.** La prova `il listino copiato nel 19 è parola per parola quello del sito`
legge `../mycity/lib/agenzia/preventivo.ts` (o `MYCITY_REPO`) e diventa rossa se lì cambia un testo, un
canone di listino o uno scontrino di partenza. Senza il sito accanto la prova si salta e lo dice.

```bash
N8N_API_KEY=… node flussi/19-bozze-abbonamenti/costruisci.mjs --manda --marketplace <id credenziale Supabase> --segreto <id credenziale del segreto>
```

Dopo il 19, il 18 si ricostruisce con `--manda` (trova il 19 per nome) o con `--bozze <id del 19>`.

**Senza la chiave dell'API, col collegamento MCP a n8n.** `--sdk <file>` scrive lo stesso flusso in codice
SDK (`flussi/in-sdk.mjs`), che gli strumenti `validate_workflow` e `create_workflow_from_code` accettano;
con `--telegram <id> --chat <id>` le credenziali e la chat si passano a mano. Il file con la chat non va
nel repository.

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
imita `$('Nodo')`, `$input` e la memoria del flusso). Il modulo 12 vero non sta qui: le prove del 16
usano un modulo 12 in miniatura con gli stessi nomi di nodo.

## Il client dell'API

`n8n-api.mjs` parla con l'API pubblica di n8n. Vuole `N8N_API_KEY` (n8n → Settings → n8n API) e
facoltativamente `N8N_URL`. Dietro un proxy, con Node 22: `NODE_USE_ENV_PROXY=1`.
