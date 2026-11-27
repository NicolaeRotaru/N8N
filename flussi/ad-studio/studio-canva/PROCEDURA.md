---
tipo: procedura
stato: bozza da seguire (Nicola, 27/11/2026: «salva l'esito come bozza da seguire»)
data: 2026-11-27 02:30
autore: AD digitale, chat «Canva e reel»
misurata su: El Tropico Latino, 26-27/11/2026
---

# Contenuti social per qualsiasi attività: la procedura veloce

## In parole semplici
Questa è la strada per fare una settimana di contenuti social a un cliente in circa un'ora e mezza, invece che in una serata intera.
Vale per qualsiasi attività: bar, ristorante, negozio, studio. Bastano le foto del cliente su Drive e il suo sito.
I contenuti sono post, caroselli, storie animate e reel, coi colori veri del suo marchio. Escono solo dopo il tuo Approva su Telegram.
Esempio: il Tropico, 26/11. Dalla richiesta alle 15:00 alle 29 proposte su Telegram sono passate circa 10 ore e mezza. Con questa procedura, il conto qui sotto fa circa un'ora e mezza.

## Cosa cambia per te
- Basta una frase, per esempio «fai la settimana di contenuti di [cliente]». La sessione segue questi passi senza ricominciare da capo.
- I colori li legge un programma dal sito del cliente. Non si scelgono più a occhio: col Tropico, a occhio era uscito il rosa sbagliato.
- Ti arrivano solo due cose: il provino di tutta la settimana e le anteprime su Telegram.

## Cosa devi fare
Niente per partire. Una domanda te la fa solo la sessione, e solo se manca un fatto: un orario incerto, un giorno di chiusura, il nome di un piatto.

## Cosa non ho verificato
- **Il tempo di un'ora e mezza è una stima.** Viene dalle misure del Tropico, con i passi rifatti tolti. Si misura davvero al prossimo cliente.
- **È provata su un cliente solo**, il Tropico. Un marchio diverso, quello di MyCity, l'ho provato solo su quattro pezzi: colori, caratteri e contrasto si sono adattati da soli.
- **La musica non l'ho mai ascoltata.** Ho misurato solo il volume.

---

## Dettagli tecnici

### Prima di cominciare (una volta per sessione, 2 minuti)
- La sessione deve stare sull'ambiente cloud **«SDG»**: ha la chiave di n8n. Si sposta con `switch_environment`, solo la rete. Nicola approva nel riquadro.
- Il server n8n deve rispondere: `curl https://n8n-shdy.sliplane.app/api/v1/workflows?limit=1 -H 'X-N8N-API-KEY: x'` deve dare 200.
- Si avvisa la sessione che pubblica i contenuti del cliente, se ce n'è una viva, con gli orari che si vogliono occupare.

### Passo 1 · Il file del cliente (10 minuti)
1. Si scarica il foglio di stile del sito, col flusso «AD · Leggi materiale (anteprime)» e l'ingresso `url`. L'indirizzo si trova nella pagina principale, nel `<link rel="stylesheet">`.
2. `node marchio.mjs foglio.css` dà i colori ordinati per uso e propone i quattro ruoli:
   - **scuro**: testo e fondi scuri;
   - **accento**: nastri e cose da far vedere;
   - **secondo**: il secondo colore;
   - **chiaro**: i fondi chiari.
   Un colore usato meno di un sesto del più usato è un dettaglio e non entra. Il logo non si tocca mai, anche se ha un colore che resta fuori.
3. Si copia `clienti/tropico-latino.json` in `clienti/<id-cliente>.json` e si riempie:
   - i colori;
   - i caratteri del sito (se non sono nell'officina, si scaricano da `@fontsource` su npm);
   - logo, indirizzo, telefono, hashtag, orari;
   - nel campo `fatti`, solo cose verificate: il sito, il menu, la scheda Clienti, il piano del mese.
4. **Mai inventare.** Niente prezzi nelle grafiche, perché cambiano. Niente nomi di piatti che il cliente non ha confermato. Niente «unico» o «il migliore» senza prova. Nei giorni di chiusura, niente «stasera».

### Passo 2 · Il materiale (10 minuti)
- `bash prepara.sh <id-cliente> <cartella-di-lavoro>` prepara la cartella: impaginazioni, caratteri e musica.
- Le foto si scaricano col flusso «AD · Leggi materiale (anteprime)», ingresso `file` con gli ID degli originali e `lato: 3200`. Si leggono dall'API delle esecuzioni e si salvano in `hd/_MG_xxxx.jpg`. Il logo si scarica con l'ingresso `url`. Si passa da n8n perché Drive e Supabase da qui non rispondono.
- Le foto restano nella cartella di lavoro: non entrano mai nel deposito, perché sono del cliente.
- Un provino delle foto, guardato una volta sola, serve a decidere per ognuna se va in una storia, in un post o in un reel.

### Passo 3 · Il piano della settimana (20-30 minuti: è il solo passo di giudizio)
- Si copia `piano-tropico-2026-11-26.py` e si riscrivono i pezzi. Il ritmo del Tropico (Nicola, 26/11):
  - nei giorni forti: tre pezzi nel feed (12:15 post, 18:30 carosello, 19:15 reel) e quattro storie (13:00, 18:00, 20:30, 21:30);
  - negli altri giorni: un pezzo nel feed e tre storie.
- Ogni pezzo ha una sola idea e una scritta breve, non più di 30 parole.
- Le storie sono **animate** (Nicola, 26/11): sei secondi di video, non foto ferme.
- Le stesse foto si usano con impaginazioni diverse: foto con nastro, testo su fondo pieno, elenco, polaroid.
- Si leggono gli orari già occupati nel Calendario, con l'ingresso `foglio` dello stesso flusso. Un id già usato si cambia col campo `id_riga`.

### Passo 4 · Montaggio e controllo (15 minuti)
- `node rendi.mjs`: con Playwright e ffmpeg, circa 8 minuti per 31 pezzi.
- `python3 consegna.py comprimi`: i video sopra i 4 MB si rifanno più leggeri.
- **Un solo provino di tutto**, guardato da chi l'ha fatto. Si cercano scritte coperte dalle foto, colori fuori marchio e testo sopra un colore che non si legge.
- Poi il provino si manda a Nicola in chat.

### Passo 5 · Consegna (20 minuti)
1. Cartella nuova su Drive, dentro «Da programmare» del cliente: «AD · Carica su Drive» con `crea_cartella`.
2. `python3 consegna.py lotti`, poi per ogni lotto:
   - `prepara <n>`;
   - si avvia «AD · Carica su Drive» con `{cartella}`;
   - `leggi <esecuzione>`.
   Alla fine, `svuota`.
3. `python3 consegna.py righe` scrive `proposte.json` e salta da solo quello che è già scaduto.
4. Ogni proposta va a «AD · Proponi nel Calendario». Si mandano 7 alla volta, in parallelo. Ognuna finisce subito: su Telegram arrivano l'anteprima e, attaccata sotto, la domanda coi tasti Approva e Rifiuta. Il tocco lo riceve il flusso acceso «AD · Tasti su Telegram», senza aprire pagine.
   Per ultima si manda `riepilogo.json`: l'elenco di quello che resta da approvare, col tasto «Approva tutti».
5. Memoria, con una PR: una riga in bacheca per ogni decisione di Nicola, una voce nel lavoro aperto e una nel registro delle decisioni.

### Regole che non si saltano
- **Niente si elimina** (Nicola, 26/11). Le versioni superate restano in una loro cartella e si archiviano a mano.
- **Esce solo quello che Nicola approva** su Telegram. Un pezzo non approvato prima della sua ora non esce.
- Il Tropico pubblica su **quattro pagine**, compreso l'account storico con un pubblico vero: ogni pezzo lo vedono tutti.

### Il conto del Tropico (26-27/11) e dove si è perso tempo
| Cosa | Tempo perso | Ora |
|---|---|---|
| Capire flussi, rete, Drive, Calendario | ~1 h | scritto qui sopra |
| Colori a occhio (rosa) e rifacimento completo | ~1 h e un caricamento rifatto | `marchio.mjs` |
| Correzioni di impaginazione pezzo per pezzo | ~40 min | impaginazioni fisse, contrasto automatico |
| Video troppo grossi per n8n | ~15 min | `consegna.py comprimi` |
| 29 proposte copiate a mano | ~30 min e molti token | 7 per volta; meglio ancora il flusso «in blocco» |

### Da firmare per andare ancora più veloce
1. **Flusso «AD · Proponi in blocco»**: una sola chiamata invece di 29. Legge la lista dal suo nodo, come fa «Carica su Drive», e avvia «Proponi» per ogni riga. È una modifica a n8n, quindi serve la tua firma.
2. **I colori del Tropico nell'officina** (`strumenti/rendi.py`, `MARCHIO`): ha ancora il magenta come primario. Va corretto prima dei prossimi contenuti fatti con l'officina.
3. **I colori del marchio nella scheda Clienti**: una colonna per cliente, così il passo 1 si fa una volta sola.
