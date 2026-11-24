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
- la stessa attività una volta sola in 7 giorni, al massimo 10 attività al giorno (il credito di Claude).

Tutto il resto è il codice del 12, copiato com'è. **Quando cambi il modulo 12, rilancia il generatore.**

```bash
N8N_API_KEY=… node flussi/16-nuovo-cliente-da-mycity/genera.mjs --credenziale <id credenziale del segreto> --vero --manda
```

Senza `--vero` il 16 resta in «prova»: cerca (e costa) ma non scrive. Senza `--manda` controlla soltanto.

**Dal lato del sito** (repository `mycity`): le variabili `N8N_NUOVO_CLIENTE_WEBHOOK_URL`
(`https://n8n-shdy.sliplane.app/webhook/mycity-nuovo-cliente`) e `N8N_NUOVO_CLIENTE_SEGRETO` (lo stesso
valore della credenziale «MyCity - Segreto nuovo cliente» in n8n). Senza tutte e due il sito non manda niente.

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
