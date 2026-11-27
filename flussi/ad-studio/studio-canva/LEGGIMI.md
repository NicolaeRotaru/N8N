---
tipo: leggimi
data: 2026-11-27 01:35
autore: AD digitale, chat «Canva e reel»
---

# studio-canva: post, caroselli, storie animate e reel dei clienti, fatti da programma

## In parole semplici
Questa cartella fa i contenuti social di un cliente senza Canva e senza CapCut.
Ogni grafica è una pagina web con i colori, i caratteri e il logo del cliente. Un programma la fotografa e ne fa un'immagine.
Le storie e i reel li fotografa 30 volte al secondo e li monta con una musica originale scritta da programma.
Esempio vero: la notte tra il 26 e il 27/11 sono nati 31 contenuti di El Tropico Latino, dal 27/11 al 2/12, con le 13 foto del fotografo.
Erano 21 storie animate, 4 post, 3 caroselli e 3 reel. Due storie del 26 sera sono rimaste fuori perché erano già scadute: le altre 29 sono nel Calendario.

## Cosa cambia per te
- Il cliente modello può avere tre contenuti al giorno nel feed e quattro storie, anche con sole 13 foto: grafiche e scritte animate le fanno sembrare tutte diverse.
- I contenuti entrano nel giro normale dell'agenzia: file su Drive, riga nel Calendario «da approvare», anteprima su Telegram con Approva e Rifiuta.
- Non esce niente senza il tuo Approva.

## Cosa devi fare
Niente per usarla. Per un cliente nuovo servono le sue foto su Drive e i colori veri del suo marchio. I colori si leggono dal suo sito, come per il Tropico, o li dai tu.

## Cosa non ho verificato
- **La musica non l'ho ascoltata.** È `../strumenti/musica.py`, la stessa dei reel del 25/11. Ho misurato solo il volume.
- **Le storie video su Facebook** le pubblica il flusso 01 secondo la sessione che segue le uscite. Non l'ho visto succedere su queste.
- **Un solo cliente.** Le impaginazioni sono provate solo sul Tropico. Per un altro cliente si cambiano i colori in cima a `studio.html` e il logo.

---

## Dettagli tecnici

**La cartella di lavoro.** Si copia questa cartella in una cartella di lavoro, fuori dal deposito. Ci si mette dentro:
- `font/`: i caratteri del cliente. Per il Tropico, `RobotoSlab-*.ttf` e `Archivo-*.ttf` da `../../../officina/font/`.
- `hd/_MG_xxxx.jpg`: le foto del cliente. Si scaricano da Drive col flusso «AD · Leggi materiale (anteprime)», ingresso `file` con `lato: 3200`. Le foto non si mettono nel deposito, perché sono del cliente.
- `logo.png`: il logo con lo sfondo trasparente, preso dal sito del cliente con l'ingresso `url` dello stesso flusso.
- `musica.wav`: da `python3 ../strumenti/musica.py`, lanciato nella cartella di lavoro.

**I colori del Tropico** (decisione di Nicola, 26/11 verso le 17:10: «il rosa non è il colore del marchio»). Vengono dal foglio di stile del sito, `eltropicolatino.it/assets/css/styles.css`. Lì l'ardesia `#253038` compare 66 volte, il bianco 41, il giallo `#FBCA1E` 16, il verde `#3D7C2B` 13, e il magenta `#D61D73` solo 9. Il magenta resta solo dentro il logo, nel nastro «Cafeteria Taqueria». Lo stile segue il sito: ombre nette ardesia e bordi da 3 px.

**I passi.**
1. `piano-....py` scrive `piano.json`: un contenuto per riga, con tipo, ora, testi e foto. Si usano solo fatti veri: il piano di dicembre del cliente e il menu del suo sito. Niente prezzi nelle grafiche, niente nomi di piatti che il cliente non ha confermato.
2. `node rendi.mjs [id …]` scrive in `uscita/`:
   - i post come `.jpg`;
   - i caroselli come `<id>-<n>.jpg`;
   - le storie come `.mp4` di 6 s, più una miniatura `.jpg`;
   - i reel come `.mp4`, più `-copertina.jpg`.
   Con Playwright e ffmpeg ci mette circa 8 minuti per 31 contenuti.
3. Prima di caricare, i video sopra i 4 MB si rifanno con `crf 25`. Un blocco non deve superare i 9 MB: n8n rifiuta gli invii troppo grossi.
4. `consegna.py`:
   - `lotti`, poi `prepara <n>`;
   - si avvia «AD · Carica su Drive» con `{cartella}`;
   - `leggi <esecuzione>`, poi `svuota`;
   - `righe` scrive `proposte.json`;
   - ogni proposta si manda a «AD · Proponi nel Calendario».
   Dentro `consegna.py` ci sono due cose valide solo per il 26/11: la data sotto cui si salta e l'id `-car` del 2/12.
5. Regola di Nicola del 26/11: niente si elimina. Le versioni superate restano in una loro cartella su Drive e si archiviano a mano.

**Cosa c'è nel Tropico del 26/11.**
- Cartella Drive buona: «Proposte contenuti 2026-11-26 · colori del marchio».
- Cartella con la prima versione, quella col magenta: «Proposte contenuti 2026-11-26». Non è mai stata proposta ed è da archiviare.
- Righe del Calendario: `tropico-latino-20261127-1215` … `tropico-latino-20261202-2130`, con la nota `[AD 26/11 · …]` e `SALTA CONTROLLO AI`.
