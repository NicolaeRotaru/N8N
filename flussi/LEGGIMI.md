# flussi/ — i flussi n8n che si costruiscono da programma

Due flussi n8n nati il 24/11/2026 su richiesta di Nicola. Non si correggono a mano nell'editor di n8n:
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
