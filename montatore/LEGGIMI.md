# Montatore — LEGGIMI

> **In due righe:** basta copiare il servizio nella cartella Drive del cliente. Il montatore parte da solo, prepara il piano del mese, monta tutto nello stile di Scatti di G e su Telegram ti chiede ✅ Approva o ✏️ Correggi, contenuto per contenuto.
> Per accenderlo servono due passi tuoi: pubblicare l'officina 1.4.0 e premere Publish sul workflow 16, che è già in n8n spento.

## Novità del 24/11/2026, notte
- **Parte da solo.** Ogni 15 minuti un «guardiano» guarda le cartelle Drive dei clienti attivi.
  - Quando compare una cartella nuova con del materiale, e da 30 minuti non arrivano file nuovi (la copia dalla scheda è finita), il montaggio parte.
  - Esempio: alle 15:10 finite di copiare «Servizio dicembre» nella cartella del Tropico. Fra le 15:40 e le 15:55 arriva su Telegram «👀 Servizio nuovo… parto da solo», poi i messaggi di sempre.
  - Le cartelle che c'erano già prima di accendere il workflow non partono mai da sole. Parte solo una cartella con le sottocartelle del servizio («video verticali», «video orizzontali», «foto»): una cartella «Grafiche» o «Menu» no.
  - Il modulo funziona come prima. Lo stesso servizio però non parte due volte: se il guardiano o il modulo l'hanno già avviato nelle ultime 12 ore, il modulo si ferma e lo dice. Per rifarlo davvero si scrive «rifai» nelle note.
- **Reel e storie video con la regia di Scatti di G.** Claude scrive per ogni video le battute (chi parla, quali frasi) e le coperture scelte per significato. L'officina lo monta con la moodboard: ritmo lento, nero morbido, testi sobri, 25 fotogrammi.
- **Una scheda su Telegram per ogni contenuto.** Dentro ci sono titolo, giorno e ora, link a Drive. L'anteprima arriva solo se il cliente ha il consenso per le persone (colonna `anteprime_con_persone`).
  - ✅ **Approva**: in modalità attivo scrive la riga nel Calendario. Una storia esce «approvato» e la pubblica il 01. Un reel o un post esce «da scrivere»: il 04 fa la didascalia e te la chiede a parte.
  - ✏️ **Correggi**: ti chiede «cosa cambio?», tu scrivi come lo diresti a voce («più corto», «togli la scena del bancone»). Claude riscrive la regia, l'officina rimonta, su Drive arriva il file «· v2» e una scheda nuova. Al massimo 3 ritocchi.
  - Il cliente non approva niente: decide Scatti di G.
- **Il controllo finale di Claude giudica sulla moodboard**: immagini, luce, testi, racconto e decoro, con un voto da 1 a 5 che compare sulla scheda. Sotto 3, o con un punto bocciato, il video arriva come «da rivedere».
- **Claude riconosce le inquadrature** (largo, medio, dettaglio, volto) quando guarda il materiale: il piano va da largo a stretto, mai tre dettagli di fila.
- **La voce si pulisce come in studio**: tolto il rimbombo e il soffio di fondo, frasi a volume uniforme.
- **L'identità di Scatti di G sta nel Config** (`SDG_COLORE_FONDO`, `SDG_COLORE_TESTO`, `SDG_COLORE_ACCENTO`, `SDG_FONT_TITOLI`, `SDG_FONT_TESTO`): quando arrivano i colori nuovi si cambiano lì, senza toccare l'officina. Il logo nei video è quello del cliente, preso dal foglio Clienti a ogni giro: se cambia il file, cambia anche nei video.
- **Le clip a 50-120 fotogrammi** senza voce si rallentano da sole. Il girato in log si corregge con la LUT della camera (campo `LUT` del Config, dopo averla caricata nell'officina).

## In parole semplici
Il montatore è un aiutante che monta da solo i video e le foto di un servizio.
Tu gli dici due cose: il nome del cliente e il nome della cartella del servizio su Drive.
È il workflow numero 16 di n8n, e lavora insieme all'officina sul vostro server.
Lui guarda tutto il materiale, scrive il piano del mese e monta reel, storie, post e caroselli.

Esempio. Il videomaker passa un'ora da El Tropico Latino e carica il girato nella cartella «Servizio novembre» del cliente, divisa in tre sottocartelle.
Tu apri il modulo e scrivi «El Tropico» e «Servizio novembre».
Dopo un po' arrivano su Telegram il piano di dicembre e il link alla cartella con i contenuti già montati.

Ripeto con altre parole: un'ora di riprese diventa un mese di contenuti pronti da approvare.
Niente viene pubblicato da solo. Niente viene inventato: il montaggio usa solo tagli veri del girato, logo, scritte e sottotitoli.

## Cosa cambia per te
- **Prima** ogni reel voleva una cartella con le clip già scelte e tagliate a mano (workflow 07).
- **Adesso** basta buttare tutto il servizio in tre sottocartelle. Il montatore sceglie i momenti, li taglia e li mette in ordine.
- In mezzo a ogni passo arriva un messaggio su Telegram: partenza, «ho guardato tutto», il piano del mese, il riepilogo finale.
- I contenuti finiscono nella cartella **«Pronti (montatore)»** dentro la cartella del servizio. I nomi dei file dicono giorno, ora, tipo e titolo, per esempio `2026-12-04 1830 · reel · Mojito al bancone.mp4`.
- Di serie il montatore è in **prova**: mette tutto su Drive, ma nel Calendario non scrive niente.
  - La cartella in prova si chiama «Pronti (montatore) - prova».
  - Quando i risultati vi convincono, nel Config del workflow mettete `MODALITA` = `attivo`.
  - In attivo, con le schede su Telegram (di serie), la riga del Calendario la scrive ✅ Approva: le storie «approvato», reel e post «da scrivere» (il 04 prepara la didascalia). Se intanto la data è passata, la riga va in «bozza».
  - Con `REVISIONE` = `no` torna il comportamento di prima: il giro scrive tutte le righe, le storie «da approvare», reel e post «da scrivere», quello che Claude ha bocciato al controllo in «bozza».

## Cosa devi fare
Una volta sola, per accenderlo:
1. **Pubblica l'officina 1.4.0** su Sliplane: è la stessa officina di prima, con le rotte nuove del montatore e della regia. Serve il merge del ramo nel `main` del repository `NicolaeRotaru/N8N`. Poi su Sliplane parte la nuova pubblicazione. Controllo: `GET {OFFICINA_URL}/salute` deve dire `versione: "1.4.0"`.
2. **Importa il workflow** `montatore/16-montatore.json` in n8n (se non c'è già «16 · Montatore»). Le credenziali sono le stesse degli altri workflow.
3. **Controlla il Config** del workflow: `OFFICINA_URL` uguale a quello dei workflow 07 e 08, `MODALITA` = `prova`.
4. Premi **Publish** (il tasto di n8n che accende il workflow). Il modulo è all'indirizzo `/form/montatore` del vostro n8n, con lo stesso accesso degli altri moduli.

Ogni volta che c'è un servizio nuovo:
1. Su Drive, dentro la cartella del cliente, crea la cartella del servizio con tre sottocartelle: **video verticali**, **video orizzontali**, **foto**. Vanno bene anche nomi simili («Video Verticali», «foto»), e anche file sciolti.
   - Facoltativo: un file **musica.mp3** con licenza, per i reel dove nessuno parla.
   - Le foto HEIC (il formato di serie dell'iPhone) vanno esportate in JPEG.
2. **Con il guardiano acceso (di serie) non serve altro**: dopo 30 minuti senza file nuovi parte da solo. Il modulo serve per scegliere il mese, le quantità o le note del mese (eventi, promozioni decise dal cliente): in quel caso apritelo **prima** che passino i 30 minuti, oppure scrivete «rifai» nelle note. Il segno che un servizio è già partito è la cartella «Pronti (montatore)» dentro il servizio.
3. Aspetta i messaggi su Telegram e guarda la cartella «Pronti (montatore)».

## Cosa non ho verificato
- **Il giro vero non l'ho fatto girare.** Da qui non arrivo all'officina sul vostro server. Non arrivo neanche a Drive e Telegram, e non ho una chiave di Claude.
  - L'ho provato a pezzi: i nodi Code con un finto n8n, e un giro simulato contro l'officina vera, con Drive e Claude finti.
  - La prima prova vera va fatta in modalità prova, con un servizio piccolo (5-10 file).
- **Le schede su Telegram e il guardiano non li ho visti girare in n8n.** Ho provato i loro nodi Code con un finto n8n, e un ritocco intero contro l'officina vera, con Claude finto. I nodi Telegram e il timer li ha validati n8n stesso. Ma un pulsante vero premuto su Telegram, e la memoria del guardiano fra un giro e l'altro, si vedono solo col workflow acceso.
  - Da controllare alla prima prova: il testo della risposta a «cosa cambio?» arriva nel campo `data.text`. Se n8n lo mettesse altrove, il nodo prende comunque il primo testo che trova.
  - Il guardiano guarda solo le cartelle **create** da quando il workflow è acceso. Una cartella vecchia in cui si aggiungono file non parte da sola: per quella c'è il modulo.
- **Il piano con la regia, scritto da Claude vero, non l'ho visto.** Lo schema obbliga Claude a scrivere tutti i campi, e l'officina ricontrolla ogni battuta. Quanto sceglie bene le coperture si vede solo col primo servizio.
- **Quanto è bravo Claude a scegliere i momenti** si vede solo con un girato vero. Le regole sono nei prompt (`montatore/prompt/`), e l'officina ricontrolla ogni codice e ogni tempo.
- **Memoria di n8n con file grandi.** I file passano da n8n uno alla volta. Il limite è `MAX_MB_FILE` = 500 MB.
  - Se n8n tiene i file in memoria, un file da 500 MB pesa 500 MB sul server da 4 GB.
  - Se servono file più grandi, prima conviene `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` su n8n.
- **Spazio sul volume `/dati` dell'officina.** Un servizio intero resta lì fino a 14 giorni, per i ritocchi dalle schede (con `REVISIONE` = no, finché il giro non lo chiude). Non so quanto è grande il volume su Sliplane.
- **Un solo livello di sottocartelle.** I file dentro una cartella nella cartella «foto» (per esempio «foto › selezione») non si leggono. Su Drive va bene al massimo una pagina da 1000 file per servizio; oltre arriva l'avviso.
- **Foto PNG con lo sfondo trasparente:** nel post lo sfondo esce nero. È il comportamento di sempre dell'officina, non l'ho cambiato.
- **Tempo.** La stima nel modulo è grossolana. La trascrizione di un'ora di girato con whisper sul server da 2 processori può durare 40-50 minuti.
- **Esecuzioni lunghe in n8n.** Se n8n ha un tempo massimo per esecuzione (`EXECUTIONS_TIMEOUT`), un servizio lungo può superarlo.

---

## Dettagli tecnici

### Come gira
```
Modulo (cliente + cartella)
 └─ trova il cliente nel foglio Clienti, la cartella su Drive, le sottocartelle e i file
 └─ risponde subito «Partito: N video, M foto, circa X minuti» e lancia il GIRO in un'esecuzione sua
GIRO
 ├─ officina POST /progetto
 ├─ per ogni file un'esecuzione «carica»: Drive → officina POST /progetto/<id>/materiale
 ├─ officina POST /progetto/<id>/catalogo → provini (griglie 5×4 con i codici V03.2, F07) + testo
 ├─ Claude «guarda»: provini a gruppi di PROVINI_PER_DOMANDA → cosa si vede, soggetto, valore 1-5, aggancio, problemi
 ├─ Claude «piano»: scheda cliente + mese + festività + richiesta + note + catalogo descritto → contenuti con tagli
 ├─ officina POST /progetto/<id>/piano → controllo (codici veri, tempi dentro la clip, durate, mese, date già passate, ripetizioni)
 ├─ se il controllo ha tolto contenuti: Claude «correggi», una volta sola, e nuovo controllo
 ├─ cartella d'uscita «Pronti (montatore)» (creata se manca)
 ├─ per ogni contenuto un'esecuzione «monta»: logo + musica → officina POST /progetto/<id>/monta
 │     → (video) Claude controlla i 6 fotogrammi → file su Drive
 ├─ attivo: righe nel Calendario · sempre: riepilogo su Telegram
 └─ tutto riuscito: officina POST /progetto/<id>/chiudi (con le schede su Telegram il progetto resta aperto e scade da solo dopo 14 giorni)
```
Un'esecuzione per file e una per contenuto: n8n tiene in memoria un file alla volta e libera la memoria alla fine di ognuna.

### Config del workflow
| Campo | Di serie | A cosa serve |
|---|---|---|
| `OFFICINA_URL` | `http://officina.internal:8080` | lo stesso dei workflow 07 e 08 |
| `MODALITA` | `prova` | `attivo` = scrive anche nel Calendario |
| `NOME_CARTELLA_PRONTI` | `Pronti (montatore)` | cartella d'uscita dentro il servizio (in prova con « - prova») |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | modello per guardare, pianificare e controllare |
| `EFFORT_CAPIRE` / `EFFORT_PIANO` / `EFFORT_CONTROLLO` | `medium` / `high` / `medium` | quanto ragiona Claude in ogni domanda |
| `USA_CONTROLLO` | `si` | Claude guarda i fotogrammi di ogni video montato |
| `TRASCRIVI` / `LINGUA` | `si` / `it` | parlato trascritto (sottotitoli e frasi nel catalogo) |
| `PROVINI_PER_DOMANDA` | `6` | immagini per richiesta a Claude (al massimo ~20 MB) |
| `MAX_MB_FILE` / `MAX_FILE` | `500` / `400` | file più grandi o in più si saltano, con l'avviso |
| `REEL` / `POST` / `STORIE` | `10` / `8` / `16` | quantità di serie se il modulo le lascia vuote (e per il guardiano) |
| `STILE_VIDEO` | `sdg` | stile della regia dei reel (`sdg` = moodboard di Scatti di G, `virale`, `pulito`) |
| `SDG_COLORE_FONDO` / `SDG_COLORE_TESTO` / `SDG_COLORE_ACCENTO` | `#2C2A27` / `#F4F1EC` / `#E0A95C` | i colori di Scatti di G (segnaposti fumo, avorio, oro): si cambiano qui, senza ripubblicare l'officina |
| `SDG_FONT_TITOLI` / `SDG_FONT_TESTO` | `Poppins` / `Poppins` | i font di Scatti di G (un font diverso da Poppins si scarica da Google Fonts) |
| `LUT` | vuoto | nome della LUT della camera caricata nell'officina, se il girato è in log |
| `REVISIONE` | `telegram` | una scheda per contenuto con ✅ Approva / ✏️ Correggi; `no` = come prima (righe scritte dal giro) |
| `ATTESA_REVISIONE_GIORNI` | `7` | quanto aspetta la risposta a una scheda |
| `MAX_RITOCCHI` / `EFFORT_RITOCCO` | `3` / `medium` | quante volte si può correggere un video, e quanto ragiona Claude per farlo |
| `AVVIO_DA_CARTELLA` / `QUIETE_MINUTI` | `si` / `30` | il guardiano delle cartelle, e quanti minuti senza file nuovi prima di partire |

### Il foglio Clienti
Il montatore usa le colonne che usano già gli altri workflow:
- `cliente`, `nome_locale`, `cartella_drive` (obbligatoria);
- `marchio`, il JSON con colori, font, `font_testo`, `peso_titolo`, `stile_foto` e `logo` (link Drive o https);
- per il piano: `tono_di_voce`, `orari`, `giorni_chiusura`, `indirizzo`, `telefono`, `link_prenotazione`, `link_menu`, `menu_testo`, `hashtag_fissi`, `account_da_taggare`, `note_piano`, `esempi_didascalie`, `regole_risposte`, e se ci sono `tipo_locale`, `categoria`, `descrizione`.

### Le righe del Calendario (solo con MODALITA = attivo; con la revisione le scrive ✅ Approva)
`id` = `MO-<cliente>-<AAAAMMGG>-<hhmm>-<4 lettere del progetto><n>` · `tipo` (reel, post, carosello, storia) · `piattaforme` = `ig+fb` · `data_ora` · `brief` (idea, perché funziona, didascalia proposta, momenti usati) · `media` (link Drive; per i caroselli separati da « | ») · `copertina` (reel) · `stato` · `note` = «montatore AI».

### I prompt e la moodboard
`prompt/capire.md` (guardare i provini), `prompt/piano.md` (piano del mese, con la regia dei reel), `prompt/controllo.md` (controllo dei fotogrammi), `prompt/ritocco.md` (correzione di un video dalla nota del team). La moodboard di Scatti di G sta in `moodboard/sdg.md` ed entra nei prompt del piano e del ritocco. Si cambiano lì e si rigenera il workflow.

### Le corsie del workflow
`Quale lavoro?` smista: `giro`, `carica`, `monta`, `rivedi` (la scheda di un contenuto), `guarda` (il guardiano, dal timer «Ogni 15 minuti»), `avvia` (il guardiano che fa partire un servizio: entra nella stessa porta del modulo, e i problemi vanno su Telegram invece che nella pagina del modulo), e il modulo.
- Il guardiano tiene in memoria nel workflow (static data) l'ora in cui è partito e le cartelle già avviate. La memoria vale solo con il workflow acceso, non nelle prove a mano.
- Le schede sono esecuzioni separate che aspettano la risposta (Telegram «send and wait», come nel 04 e nel 15). Il progetto nell'officina resta aperto per i ritocchi e scade da solo dopo 14 giorni.

### Rigenerare e provare
```
node montatore/genera.mjs                       # riscrive montatore/16-montatore.json
cd officina && npm ci && cd ..
node --test montatore/test/*.test.mjs           # 14 prove: nodi Code, guardiano, schede e ritocco + giro simulato con l'officina vera
cd officina && npm test                         # prove dell'officina (comprese le 12 del montatore)
```
