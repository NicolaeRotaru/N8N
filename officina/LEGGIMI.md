# Officina dell'agenzia — LEGGIMI

## In parole semplici
L'officina è un piccolo programma che lavora le foto e i video dei locali al posto vostro.
Gira sul vostro server Sliplane, accanto a n8n. Non costa niente: niente abbonamenti e niente crediti.

Con il pacchetto PRO (Placid per le grafiche, Creatomate per i video) l'officina resta, e fa quattro lavori:
- ritaglia le foto prima che vadano a Placid;
- fa i provini, cioè la griglia numerata da mostrare a Claude;
- fa le immagini «prima | dopo» per Telegram;
- scrive i sottotitoli italiani ascoltando l'audio vero.

In più è il **ripiego gratuito completo**: se Placid o Creatomate sono spenti, o manca un modello, i workflow chiedono tutto a lei.

Esempio con il locale pilota, El Tropico Latino. La storia del venerdì parte dalla foto del fotografo e dal logo del locale.
L'officina restituisce una storia 1080×1920: il titolo «Noche Latina» è in Roboto Slab extra-grassetto (peso 800) su una fascia magenta #D61D73. Sotto c'è «Venerdì dalle 21:00» in Archivo. Arriva anche l'immagine «prima | dopo» da mandare su Telegram.

Non inventa niente. Ritaglia, corregge luce e colore su tutta la foto, mette scritte e logo sopra, monta i video.
Non allarga mai una foto e non crea sfondi finti. Le scritte sono solo quelle che le passa n8n.

## Cosa cambia per te
**Versione 1.2.0 (24/11/2026): il montatore.** L'officina sa tenere tutto il materiale di un servizio in un «progetto» per 72 ore.
Lo guarda una volta sola: divide ogni video in momenti, misura nitidezza, luce e movimento, e trascrive il parlato.
Poi controlla il piano del mese scritto da Claude e monta ogni contenuto senza ricaricare niente.
La usa il workflow 16 · Montatore (guida: `../montatore/LEGGIMI.md`). Le rotte di prima non cambiano.

Le correzioni del 15/11/2026 cambiano sei cose:
- **I sottotitoli finiscono quando finisce il parlato.** Prima una frase detta a 3 s e ripetuta a 25 s diventava un sottotitolo solo, acceso da 3 a 30 s. La ripetizione spariva. Adesso escono due sottotitoli: da 2,9 a 8,1 s e da 24,9 a 30,0 s.
- **Anche una pausa di 4-5 secondi spegne il sottotitolo** (ricontrollo, versione 1.1.1). Il programma di trascrizione a volte mette due frasi in un pezzo solo. Prima quel sottotitolo restava acceso nel silenzio e mostrava la frase dopo secondi prima che venisse detta.
  - Esempio dal ricontrollo: una frase finisce a 29,6 s, la successiva parte a 34,1 s. Prima: un sottotitolo solo, da 26,0 a 36,0 s. Adesso due: da 26,0 a 29,0 s e da 34,0 a 36,0 s.
  - In pratica: ogni sottotitolo copre solo il tempo in cui qualcuno parla. Un silenzio di almeno 0,8 s lo divide sempre.
- **I caratteri del Tropico sono già dentro l'officina**: Roboto Slab (anche il peso 800 dei titoli) e Archivo. Il locale pilota non dipende da Google Fonts.
- **Nel cartello finale del reel c'è un logo solo**, quello grande. Prima restava anche quello piccolo in alto a destra.
- **I workflow possono mandare fino a 40 campi di testo**, prima erano 10. Un provino da 12 foto con i segnaposto vuoti non viene più rifiutato.
- **È pronta da pubblicare dal repository GitHub `NicolaeRotaru/N8N`**, con i passi qui sotto.

## Cosa devi fare
Dopo che l'AD ha caricato la cartella `officina/` nel repository, su Sliplane servono cinque passi. I dettagli sono nella sezione «Pubblicare dal repository GitHub su Sliplane».
1. Crea un nuovo servizio dal repository `NicolaeRotaru/N8N`, sullo **stesso server di n8n**.
   - *Dockerfile path* = `/officina/Dockerfile`
   - *Docker context* = `/officina`
2. Lascia il servizio **non pubblico**. Copia il nome interno che Sliplane mostra nelle impostazioni, per esempio `officina.internal`.
3. Aggiungi un **volume** montato su `/dati`.
4. Inventa una chiave lunga, almeno 16 caratteri: per esempio 40 lettere e numeri a caso. Mettila in due posti:
   - nella variabile `OFFICINA_CHIAVE` del servizio;
   - nella credenziale n8n **'Officina - Chiave'**: tipo Header Auth, Name `X-Officina-Chiave`, Value = la chiave.
5. Nel nodo Config di ogni workflow (06, 07, 08) scrivi `OFFICINA_URL` = `http://<nome interno>:8080`, per esempio `http://officina.internal:8080`. Poi premi Publish.

Per controllare che funzioni basta un nodo HTTP Request in n8n: GET `{OFFICINA_URL}/salute` con la credenziale 'Officina - Chiave'. Deve rispondere `{ok:true, versione:"1.2.0", ffmpeg:true, whisper:true, coda:0, memoria_mb:…}`.

## Cosa non ho verificato
- **L'immagine Docker non l'ho costruita.** Qui il programma Docker c'è, ma il suo servizio non gira, e Docker Hub non è tra le fonti che potevo usare.
  - Ho però provato da qui il pezzo più fragile della build, con gli stessi argomenti del Dockerfile: lo scaricamento di whisper.cpp v1.9.1 da GitHub e la compilazione dei due programmi. Ci ha messo 55 secondi su 4 processori.
- **FFmpeg**: le prove girano con la versione 6.1, l'immagine usa quella di Debian 12, cioè la 5.1. I filtri usati esistono anche nella 5.1, ma lì non li ho visti girare.
- **Il modulo di Sliplane**: i nomi dei campi li ho presi dalla loro documentazione, letta tramite i risultati di ricerca, perché il sito non è raggiungibile da qui. Sono *Dockerfile path*, *Docker context*, il nome interno `….internal` e la variabile `PORT`. Vanno confermati nel pannello.
- **Il processore del server**: il programma di trascrizione usa le istruzioni AVX2. Se il processore di Sliplane non le avesse, bisogna ricompilare.
- **Materiale vero**: nessuna foto e nessuna clip vera, solo materiale sintetico. Anche il logo del Tropico nelle prove è finto: non ho scaricato il vero `logo-1440.png`.
- **Sottotitoli con una voce vera**: la divisione nelle pause l'ho provata solo con la voce sintetica espeak-ng, su rumore e su musica sintetici. I tempi per parola di whisper erano precisi entro circa 0,2 s, ma con una voce vera, o con più persone che parlano, possono sbagliare di più.
- **Clip lunghe**: su una clip sintetica da 200 s, fatta di quattro frasi ripetute, whisper stesso si confonde e salta o ripete frasi, con la 1.1.0 come con la 1.1.1. Ho controllato solo che nessun sottotitolo resti acceso in una pausa: al massimo 0,25 s, come previsto.
- **Google Fonts**: il download l'ho provato solo con un finto server. Per il Tropico non serve, perché i suoi due caratteri sono già dentro.

---

## Dettagli tecnici

### Pubblicare dal repository GitHub su Sliplane
**Cosa va nel repository.** La cartella `officina/` così com'è, come sottocartella di `NicolaeRotaru/N8N`.
Il file `.gitignore` tiene fuori `node_modules/`, `.locale/` e `test/.tmp/`: sono le dipendenze installate, il whisper compilato in locale e i file temporanei delle prove.
Le prove (`test/`) vanno nel repository, ma non entrano nell'immagine: le esclude `.dockerignore`.

**Campi del servizio su Sliplane** (New service → Repository):

| Campo | Valore | Nota |
|---|---|---|
| Repository / branch | `NicolaeRotaru/N8N`, `main` | |
| Dockerfile path | `/officina/Dockerfile` | la documentazione chiede il percorso col nome del file |
| Docker context | `/officina` | la cartella da cui partono i `COPY` del Dockerfile; il valore predefinito `/` sarebbe la radice del repository e la build fallirebbe |
| Server | lo stesso di n8n (Medium, 3 vCPU / 4 GB) | il nome interno funziona solo tra servizi dello stesso server |
| Public | **spento** | servizio privato: lo raggiungono solo i servizi dello stesso server, col nome interno mostrato nelle impostazioni (forma `nome.internal`) |
| Volume | mount path `/dati` | file di lavoro (cancellati dopo 24 ore) e cache dei Google Font |
| Variabile `OFFICINA_CHIAVE` | la chiave (obbligatoria) | senza una chiave di almeno 16 caratteri il servizio non parte |
| Health check (se lo chiede) | `/salute` | risponde `{ok:true}` senza chiave; anche `GET /` risponde `{ok:true}` |

- **Porta.** L'officina ascolta sulla porta scritta nella variabile `PORT`. L'immagine mette 8080 di serie.
  Secondo la documentazione, Sliplane usa `PORT` per sapere su quale porta instradare e fare i controlli. Se il pannello mostra una porta diversa da 8080, in `OFFICINA_URL` va quella.
- **Il nome interno.** Nel Config dei workflow il valore di prova è `http://officina:8080`. Va sostituito con il nome che mostra Sliplane, per esempio `http://officina.internal:8080`.
  La documentazione avvisa che alcune impostazioni di rete non si cambiano dopo la creazione: scegli il nome del servizio (`officina`) prima di crearlo.
- **Con un volume niente aggiornamenti "senza interruzione".** A ogni nuova pubblicazione Sliplane ferma il container vecchio prima di avviare il nuovo. L'officina resta ferma per il tempo dell'avvio, pochi secondi dopo la build.
  Conviene pubblicare quando nessun workflow sta lavorando. Se capita durante un lavoro, il nodo HTTP del workflow riprova da solo (Retry on Fail).
- **Uscita su internet.** Serve solo verso `fonts.googleapis.com` e `fonts.gstatic.com`, la prima volta che un locale usa un font *non incluso*. I font inclusi sono Inter, Playfair Display, Roboto Slab e Archivo.
- **La build** fa tre cose:
  - compila whisper.cpp v1.9.1 (55 s su 4 processori qui; sul server di build può volerci di più);
  - scarica da Hugging Face il modello `small` (466 MB) e il VAD silero (0,9 MB), entrambi con il controllo sha256;
  - installa le dipendenze con `npm ci`.
  L'immagine finita pesa circa 1,1 GB.
- **Utente.** Il container parte come root solo per rendere `/dati` scrivibile (`avvio.sh`), poi lancia il servizio come utente `node`.

**Variabili facoltative** (i valori di serie vanno bene):

| Variabile | Di serie | A cosa serve |
|---|---|---|
| `LOG_LEVEL` | `info` | quanto scrive nei log |
| `URL_BASE` | vuota | indirizzo da mettere negli `url` dei file; se è vuota si usa quello con cui ha chiamato n8n |
| `FONT_RETE` | `si` | `no` spegne il download dei Google Font (restano i font inclusi) |
| `CODA_MAX_ATTESA` | `5` | lavori in attesa oltre a quello in corso |
| `FILE_DURATA_ORE` | `24` | quanto restano scaricabili i file prodotti |
| `FFMPEG_THREADS` / `WHISPER_THREADS` | `2` / `2` | processori usati da FFmpeg e da whisper |
| `WHISPER_DTW` | vuota | tempi per parola di whisper: vuota = il nome della rete si legge dal modello; `no` = spenti (testo diviso in proporzione); `small`, `base`… = nome imposto. All'avvio il log scrive `tempi_per_parola` |

### Memoria misurata
Misure fatte qui con le prove automatiche del 15/11/2026: servizio più programmi figli, un campione ogni 100 ms.

| Lavoro | Picco | Dettaglio |
|---|---|---|
| Reel da 30 s (2 clip, logo, musica, sottotitoli, intro, cartello finale) | **734 MB** (737-767 MB nelle 4 corse del giro prima) | Node 190 MB + ffmpeg 584 MB; 42 s di lavoro su 4 vCPU |
| Storia video da 60 s (da una clip di 75 s) | **702 MB** (614-678 MB nel giro prima) | Node 221 MB + ffmpeg 501 MB |
| Trascrizione con whisper `small`, clip da 8 s | **1002 MB** (846 MB con la 1.1.0) | whisper-cli 891 MB + Node 112 MB; 13 s |
| Trascrizione con whisper `small`, clip da 34 s con 17 s di silenzio | **1002 MB** (862 MB con la 1.1.0) | whisper-cli 902 MB; il VAD che trova il parlato occupa 12 MB; 23 s |
| Trascrizione, clip da 40 s con pause di 2,5 / 17 / 4,5 s | **1022 MB** (865 MB con la 1.1.0) | whisper-cli 920 MB; 24 s |
| Trascrizione, voce sopra musica, 20 s | **991 MB** (860 MB con la 1.1.0) | whisper-cli 893 MB; 12 s |
| Trascrizione, clip da 200 s (misura a parte, fuori da `npm test`) | **1111-1123 MB** in 3 corse | whisper-cli 1006-1013 MB; 90 s |

Tutto resta sotto il tetto di 1,5 GB, perché FFmpeg e whisper non girano mai insieme: la coda li mette uno dopo l'altro.
Dalla 1.1.1 la trascrizione pesa circa 150 MB in più ed è più lenta del 15-20%: i tempi per parola chiedono a whisper di spegnere l'attenzione veloce (`-nfa`). È il prezzo dei sottotitoli che non restano accesi nelle pause.
Il server da 4 GB è condiviso con n8n: durante il picco dell'officina restano circa 2,9 GB per n8n e per il sistema.
Se servisse più margine, si costruisce con il modello `small-q5_1`. Con i tempi per parola whisper-cli arriva a 640 MB invece di 920, sulla clip da 40 s, con gli stessi quattro sottotitoli divisi nelle pause. Senza tempi per parola erano 463 MB contro 751. Gli argomenti di build sono scritti nel Dockerfile, e il nome della rete (`small`) si legge da solo anche dal modello `q5_1`.

### L'officina nel pacchetto PRO
Nel Config dei workflow ci sono due interruttori, `MOTORE_GRAFICA` e `MOTORE_VIDEO`. Valgono `'pro'` (di serie) oppure `'gratis'`.

| Lavoro | Con `'pro'` | Con `'gratis'` |
|---|---|---|
| Grafiche di storie e post | **Placid** disegna. Prima l'officina ritaglia la foto (`/foto/prepara`, 9:16 o 4:5, con lo `stile` del marchio); n8n la carica su Cloudflare R2 e passa a Placid l'indirizzo pubblico. Dopo, l'officina fa il «prima \| dopo» (`/confronto`) per Claude e Telegram | l'officina fa tutto: `/grafica/storia`, `/grafica/post` |
| Reel e storie video | **Creatomate** monta. L'officina scrive i sottotitoli italiani (`/video/trascrivi`), che una persona approva su Telegram; con le istantanee JPEG di Creatomate fa il provino per Claude (`/foto/provino`, da 2 a 12 immagini) | l'officina fa tutto: `/video/reel`, `/video/storia` |
| Provini, confronti, sottotitoli | sempre l'officina | sempre l'officina |

- **Gli indirizzi dei file dell'officina sono interni e vogliono la chiave.** Placid e Creatomate non li possono leggere. Per questo n8n scarica il file dall'officina e lo carica su R2. L'officina non conosce le chiavi di R2: ognuno ha solo le chiavi che gli servono.
- **Costi.** L'officina costa 0 € e 0 crediti, perché gira sul server che pagate già. I crediti di Placid e Creatomate per ogni contenuto sono nelle guide dei workflow: `GUIDA-06-storie.md`, `GUIDA-07-reel.md`, `GUIDA-08-post.md`.
- **Passare da `'pro'` a `'gratis'`.** Nel Config del workflow metti `MOTORE_GRAFICA` e/o `MOTORE_VIDEO` a `'gratis'` e premi Publish. Nell'officina non cambia niente: tutti gli indirizzi sono sempre accesi.
- **Dal marchio (scheda Clienti) ai campi dell'officina.** Esempio con il Tropico:

| Nel JSON `marchio` | Campo dell'officina | Tropico |
|---|---|---|
| `colori.primario/secondario/testo` | `colori` (`accento` si accetta e si ignora) | `#D61D73`, `#3D7C2B`, `#FFFFFF` |
| `font` | `font` (titoli) | `Roboto Slab` (incluso) |
| `font_testo` | `font_testo` (righe «sotto») | `Archivo` (incluso) |
| peso dei titoli | `peso_titolo` | `800`; il JSON del marchio oggi non ha questo campo, va passato dal workflow o aggiunto al marchio |
| `stile_foto` | `stile` | `{luminosita:1.0, contrasto:1.05, saturazione:1.08, calore:0.02}` |
| `logo` | file `logo` (PNG) | n8n lo scarica, da Drive o dall'indirizzo pubblico, e lo manda come file |

### Contratto API (v1) — quello che fa ogni indirizzo
Autenticazione: header `X-Officina-Chiave`. Senza la chiave giusta la risposta è 401 `non_autorizzato`.
Solo `GET /salute` e `GET /` rispondono lo stesso, ma con `{ok:true}` e basta.
Le richieste di lavoro sono `multipart/form-data` con il campo `dati` (JSON) più i file. Gli `url` nelle risposte sono assoluti e si scaricano con `GET` e la stessa chiave.

| Indirizzo | File | Cosa restituisce |
|---|---|---|
| `GET /salute` | — | `{ok, versione, ffmpeg, whisper, coda, memoria_mb}`; `coda` = lavori in corso + in attesa |
| `POST /foto/provino` | `foto` × 2-12 | `{id, provino:{url,larghezza,altezza}, foto:[{numero, nome_file, larghezza, altezza, nitidezza, luminosita, doppione_di, orientamento}]}` |
| `POST /foto/prepara` | `foto`, `logo`? | `{id, file:[{formato,url,larghezza,altezza,byte}], miniatura:{url}, avvisi}` |
| `POST /grafica/storia` | `foto`, `logo`? | `{id, file:[{url}], confronto:{url}, avvisi}` — 1080×1920 |
| `POST /grafica/post` | `foto`, `logo`? | come sopra — 1080×1350 |
| `POST /video/trascrivi` | `clip` × 1-20 | `{id, segmenti:[{clip,inizio,fine,testo}], srt:{url}, testo_completo}` |
| `POST /video/reel` | `clip` × 1-20, `logo`?, `musica`? | `{id, file:[{tipo:"video",url,durata,byte},{tipo:"copertina",url},{tipo:"fotogrammi",url}], avvisi}` |
| `POST /video/storia` | `clip`, `logo`? | come il reel; durata ≤ 60 s |
| `POST /confronto` | `originale`, `risultato` | `{id, file:[{url}]}` |

**Aggiunte del 15/11/2026.** Sono tutte facoltative e compatibili: chi non le manda ottiene lo stesso risultato di prima.
- `GET /` risponde `{ok:true}` senza chiave: serve ai controlli di salute della piattaforma.
- **Campi di testo: fino a 40 per richiesta, compreso `dati`.** Gli altri campi di testo (per esempio `campo_vuoto_3`, `campo_vuoto_logo`) si ignorano. Oltre 40: 400 `troppi_campi`.
- `/grafica/storia`, `/grafica/post` e `/video/reel` accettano `font_testo` e `peso_titolo`. Le due grafiche accettano anche `stile`. Il dettaglio è sotto.
- `/video/trascrivi`: i tempi dei segmenti sono stretti sul parlato vero, e le frasi che cadono sul silenzio si scartano. Dalla 1.1.1 un segmento non copre mai un silenzio di 0,8 s o più: se whisper mette due frasi in un segmento, ne escono due. La forma della risposta non cambia; i segmenti possono essere di più.

**Convenzioni da sapere (valgono per chi costruisce i workflow):**
- **Le clip si contano da 0**, nell'ordine in cui le mandi. `tagli[].clip` e `segmenti[].clip` usano lo stesso indice.
- **Tempi dei sottotitoli.**
  - I `segmenti` di `/video/trascrivi` hanno i tempi *dentro la propria clip*.
  - L'`srt` invece ha i tempi sulla "linea sorgente": le clip intere messe una dopo l'altra. Esempio con clip da 6, 4 e 5 s: la clip 2 parte a 15 s.
  - `/video/reel` vuole in `sottotitoli_srt` l'SRT approvato **su quella stessa linea sorgente**. Lo sposta da solo sui `tagli`: le frasi fuori dai tagli spariscono, quelle a cavallo si accorciano.
  - Quindi: passa l'SRT di `/video/trascrivi` (corretto a mano se serve) **così com'è**, con le stesse clip nello stesso ordine.
  - Se il workflow passa questo SRT a Creatomate, i tempi valgono solo se Creatomate monta le clip intere, nello stesso ordine. Se taglia le clip, i tempi vanno spostati sui tagli come fa `/video/reel`. Il campo di Creatomate che accetta un SRT (`transcript_source`, secondo la ricerca) è da verificare alla prima prova.
- `numero` del provino parte da 1, come il numero disegnato sulla griglia.
- `nitidezza` = varianza del Laplaciano su una copia con lato lungo 1024 px: più alta, più nitida. Serve a confrontare foto dello stesso servizio, non è un voto assoluto.
- `luminosita` = media 0-255.
- `doppione_di` = numero della prima foto quasi uguale (hash percettivo, distanza ≤ 10 su 64 bit), altrimenti `null`.
- `orientamento`: `orizzontale` | `verticale` | `quadrata`.

**/foto/prepara**
- `formati`: `1:1` (1080×1080), `4:5` (1080×1350), `3:4` (1080×1440), `9:16` (1080×1920), `16:9` (1920×1080), `1.91:1` (1200×628). Se manca: `["4:5"]`.
- Il ritaglio è "attention" di libvips. Non ingrandisce mai: una foto piccola esce più piccola, con l'avviso `risoluzione_bassa`.
- Il JPEG è sRGB, senza metadati, ≤ 8 MB.
- `stile`: `luminosita` 0,5-1,5 · `contrasto` 0,5-1,5 · `saturazione` 0-2 · `calore` −1…1 (accetta anche −100…100). Neutro = 1, 1, 1, 0. Un valore fuori limite viene riportato nel limite, con l'avviso `stile_limitato`.
- `logo.posizione`: `alto-sinistra|alto-centro|alto-destra|basso-sinistra|basso-centro|basso-destra` (predefinito `basso-destra`). `larghezza_percento`: 5-40, predefinito 15.
  - Nel 9:16 il logo resta fuori dai 250 px in alto e dai 340 in basso.

**/grafica/storia e /grafica/post**
- `modello`:
  - storia: `pulita` (solo logo) | `fascia` | `titolo` | `cornice`;
  - post: `pulita` | `fascia` | `titolo`.
  - Predefinito `fascia`.
- `righe`: al massimo 6, ognuna al massimo 220 caratteri. Il `ruolo` è `titolo` o `sotto`; se manca, la prima riga è il titolo.
- Il testo non viene mai cambiato, con due sole eccezioni:
  - gli spazi doppi diventano uno;
  - le emoji si tolgono, perché il font non le ha (avviso `emoji_tolte`).
- Storie: nessun testo nei 250 px in alto e nei 340 in basso, più 40 px di respiro. Sui lati il margine è 72 px.
- Se il testo non entra, il carattere si riduce fino al 58-60%, con l'avviso `testo_troppo_lungo`. Se non entra nemmeno così: errore **422 `testo_troppo_lungo`**. Mai «…».
- `colori`: codici `#RRGGBB` o `#RGB` per `primario`, `secondario`, `testo`. Le altre chiavi, come `accento`, si ignorano. Un colore non valido diventa neutro, con l'avviso `colore_non_valido`.
- `font`: carattere dei titoli. Se è incluso nell'officina (Inter, Playfair Display, Roboto Slab, Archivo) si usa subito. Altrimenti è il nome di un Google Font, scaricato al primo uso e poi tenuto in cache.
  - Se non si trova, si usa un font di riserva incluso: Inter per i font senza grazie, Playfair Display per quelli con grazie (anche le "slab"). Arriva l'avviso `font_non_disponibile`.
- `font_testo` *(nuovo, facoltativo)*: carattere delle righe `sotto`. Se manca si usa `font`.
- `peso_titolo` *(nuovo, facoltativo)*: 100, 200 … 900, predefinito 700. Roboto Slab incluso ha il 400, il 700 e l'800.
  - Se la famiglia non ha quel peso, il titolo esce in 700, con l'avviso `peso_non_disponibile`.
  - Un valore sbagliato, per esempio `"grassetto"`, dà 700 con l'avviso `peso_non_valido`. La grafica non si ferma.
- `stile` *(nuovo, facoltativo)*: lo stesso di `/foto/prepara`, cioè una correzione di luce e colore su tutta la foto. È lo `stile_foto` del marchio.

**/video/reel**
- Uscita: MP4 H.264 High 1080×1920 a 30 fps. Audio AAC 128 kbps a 48 kHz stereo, −14 LUFS (due passate di loudnorm). File con `faststart`.
- Le clip verticali (ritaglio fino al 20%) riempiono il quadro.
- Le orizzontali, e le quasi quadrate, vanno al centro sullo **sfondo sfocato della stessa clip**.
- Le clip HDR (iPhone) vengono convertite in SDR, con l'avviso `hdr_convertito`.
- `intro.testo`: titolo sopra i primi 3 secondi.
- `outro.testo`: cartello finale di 2,5 s, con il colore primario, il logo grande e il testo. Durante il cartello il logo piccolo in alto non c'è.
- `font`, `font_testo`, `peso_titolo`: come per le grafiche, usati per intro e cartello. I sottotitoli usano `font` in grassetto.
- `durata_max`: al massimo 90 s, compreso il cartello finale. Se il montaggio è più lungo, si taglia la coda, con l'avviso `durata_tagliata`.
- `musica`: va a ripetizione per tutto il video e sfuma alla fine. Il volume `volume_musica` va da 0 a 1, predefinito 0,35.
- Un reel sotto i 3 secondi dà errore 422 `video_troppo_corto`.
- La `copertina` è il fotogramma più nitido fra 6, preso dal montaggio senza sottotitoli, con sopra il logo e il titolo dell'intro. JPEG 1080×1920, ≤ 3,5 MB.
- I `fotogrammi` sono 6 immagini del reel finito, in griglia 3×2, con il minuto:secondo.

**/video/storia**
- `inizio`/`fine` in secondi. Se il pezzo chiesto supera i 60 s, si tengono i primi 60 (taglio a 59,9 s), con l'avviso `durata_tagliata`.
- `sfondo`: `sfocato` (predefinito) oppure `colore` (il colore primario). Serve solo per le clip non verticali.
- Una clip senza audio esce comunque con una traccia audio muta, con l'avviso `audio_silenzioso`.

**/video/trascrivi — come nascono i tempi**
1. Le clip con audio muto (picco sotto −45 dB) non passano da whisper: sul silenzio whisper si inventa frasi come «Sottotitoli a cura di QTSS».
2. Il VAD silero (programma `whisper-vad-speech-segments`, 0,9 MB di modello) trova i tratti in cui si parla davvero. Se il programma manca, li trova FFmpeg misurando i silenzi.
3. whisper-cli trascrive **senza** `--vad`. Con `--vad`, whisper.cpp 1.9.1 allunga ogni frase fino all'inizio della successiva e perde le frasi ripetute: l'ha trovato il collaudo e l'ho riprovato qui.
   Chiede anche il **tempo di ogni parola**: `-ojf` (i token di ogni segmento) e `-dtw <rete>` (l'allineamento dei token sull'audio). whisper.cpp spegne l'allineamento se l'attenzione veloce è accesa, per questo si passa anche `-nfa`.
   Il nome della rete (`small`, `base`…) si legge dall'intestazione del modello: nell'immagine Docker il file si chiama `modello.bin` e il nome non basta. Se non si riconosce, oppure con `WHISPER_DTW=no`, si lavora senza tempi per parola.
4. **Divisione sui silenzi.** I tratti parlati divisi da meno di 0,8 s diventano un tratto solo. Se un segmento di whisper tocca due o più tratti, ogni parola va nel tratto dove cade il suo tempo: ne escono tanti sottotitoli quanti sono i tratti.
   - Una parola che whisper colloca a più di 1 s da ogni tratto parlato sta sul silenzio: non si mostra.
   - La punteggiatura resta attaccata alla parola prima, perché il suo tempo è spesso sbagliato. Una parola sola con un tempo fuori posto, in mezzo a una frase, non viene spostata.
   - Senza tempi per parola il testo si divide in proporzione al parlato di ogni tratto, sulla fine di una frase vicina. È meno preciso, ma nemmeno così un sottotitolo copre una pausa.
5. I tempi si stringono sui tratti parlati: al massimo 0,1 s prima e 0,25 s dopo. **Non si allargano mai** oltre i tempi di whisper, quindi un sottotitolo può spegnersi qualche decimo di secondo prima della fine della frase (fino a 0,6 s nelle prove).
   Una frase che non tocca nessun tratto parlato sta sul silenzio: è inventata e si scarta. Si scartano anche le frasi inventate note.

Prove reali fatte qui, con whisper.cpp 1.9.1, il modello `small` e una voce sintetica italiana:
- frase detta a 3,0-7,7 s e ripetuta a 25,0-29,7 s:
  - prima della correzione del collaudo: un segmento solo, da 2,98 a 29,76 s;
  - dopo: due segmenti, da 2,88 a 8,06 s e da 24,89 a 30,00 s.
- clip da 40 s del ricontrollo, frasi a 26,15-29,57 s e a 34,08-36,48 s (pausa di 4,5 s):
  - prima (1.1.0): un segmento solo, da 26,05 a 36,0 s, acceso a 31 e a 33 s;
  - dopo (1.1.1): da 26,05 a 29,0 s e da 33,98 a 36,0 s.
- voce sopra musica, frasi a 3,27-5,95 s e a 11,07-14,88 s:
  - prima: un segmento solo, da 3,17 a 14,2 s;
  - dopo: da 3,17 a 6,2 s, da 10,97 a 14,2 s e da 14,2 a 14,56 s (whisper aveva diviso l'ultima parola).

**Errori** — sempre `{errore, messaggio}`:

| Codice HTTP | Errori |
|---|---|
| 400 | `dati_non_validi`, `file_mancante`, `troppi_file`, `troppi_campi`, `campo_sconosciuto`, `file_vuoto`, `formato_non_valido`, `modello_non_valido`, `righe_non_valide`, `tagli_non_validi`, `srt_non_valido`, `durata_non_valida` |
| 401 | `non_autorizzato` |
| 404 | `non_trovato`, `file_non_trovato` (anche quando è scaduto) |
| 413 | `file_troppo_grande` (oltre 300 MB), `richiesta_troppo_grande` (oltre 800 MB in tutto) |
| 415 | `serve_multipart`, `formato_file_non_supportato`, `video_non_leggibile`, `audio_non_leggibile` |
| 422 | `testo_troppo_lungo`, `video_troppo_corto` |
| 429 | `coda_piena`, con l'header `Retry-After` |
| 500 | `errore_interno`, `trascrizione_fallita`, `jpeg_troppo_grande` |
| 503 | `trascrizione_non_disponibile` |

### Il montatore: progetti (1.2.0)
Un **progetto** è il materiale di un servizio, caricato una volta sola e usato per tutto il mese.
Vive in `/dati/progetti/<id>/` e scade `PROGETTO_DURATA_ORE` (di serie 72) dopo l'ultimo uso.
Le rotte leggere accettano JSON (oppure multipart con il campo `dati`) e non passano dalla coda. Quelle pesanti vogliono multipart e passano dalla coda come le altre.

| Indirizzo | Coda | Corpo | Cosa fa |
|---|---|---|---|
| `POST /progetto` | no | `{nome?}` | crea il progetto → `{progetto, nome, video, foto, scene, durata_video, byte, scade_alle}` |
| `GET /progetto/:pid` | no | — | stato + `materiali` (senza dati interni) |
| `POST /progetto/:pid/materiale` | sì | multipart: `file` (uno) + `dati {cartella?, nome?, drive_id?, trascrivi?, lingua?}` | riconosce foto o video dal contenuto (non dalla cartella), dà il codice (V01…, F01…), analizza → `{progetto, materiale, avvisi}`. Lo stesso `drive_id` due volte → `gia_caricato: true`, niente doppioni |
| `POST /progetto/:pid/catalogo` | sì | multipart: `dati {}` | provini 5×4 con i codici scritti sopra (≤ 1568 px, ≤ 3,5 MB) → `{provini:[{url, codici}], testo, materiali, avvisi}` |
| `POST /progetto/:pid/piano` | no | `{piano:{contenuti:[…]}, mese:"AAAA-MM", richiesta?:{reel,post,storie}, oggi?}` | controlla il piano → `{contenuti, problemi:[{n, gravita:"blocca"\|"avviso", codice, messaggio}], bloccante, conti}` |
| `POST /progetto/:pid/monta` | sì | multipart: `dati {contenuto, marchio?, sottotitoli?}` + `logo?` + `musica?` | monta un contenuto del piano → `{tipo, contenuto, file:[…], avvisi}` |
| `POST /progetto/:pid/chiudi` | no | — | cancella il progetto (409 `progetto_in_uso` finché una richiesta ci lavora o aspetta in coda) |

**Analisi di un video.** Una sola lettura con FFmpeg: 4 fotogrammi al secondo piccoli e in grigio (luce, movimento, cambi di inquadratura con `scdet`) e 1 miniatura al secondo da 480 px. Le scene:
- i tagli trovati da `scdet` (soglia 12), ignorati se a meno di 1 s dall'inizio, dalla fine o dal taglio prima;
- una scena oltre i 6 s si divide in pezzi uguali di circa 4,5 s;
- al massimo 40 scene per video (i pezzi si allungano).
Per ogni scena: `nitidezza` (mediana della varianza del Laplaciano sulle miniature), `luminosita` (0-255), `movimento` (differenza media fra fotogrammi, 0-255), la miniatura più nitida, e le frasi dette (whisper, solo se c'è audio udibile e `trascrivi` non è `false`/`"no"`).
Se whisper si pianta o va oltre il tempo, la clip entra lo stesso, senza parlato, con l'avviso `trascrizione_fallita`.
Anche con tanti tagli (un'inquadratura ogni 2 s) le scene restano al massimo 40: si uniscono le due vicine più corte.
Nel testo del catalogo ogni frase detta ha i suoi tempi («Benvenuti da noi.» 0,5–2,0 s): servono a Claude per non tagliare una frase a metà.
Le etichette del catalogo sono relative al servizio: «sfocata» = sotto il 30% della nitidezza mediana delle altre scene; «buia» sotto 40; «bruciata» sopra 220; «mossa» con movimento sopra 30.

**Analisi di una foto.** Le misure di `/foto/provino` (nitidezza, luce, orientamento) e il doppione rispetto alle foto già nel progetto (hash percettivo, distanza ≤ 10). HEIC → 415 con la spiegazione.

**Il piano** (lo scrive Claude, lo controlla l'officina). Ogni contenuto: `tipo` (`reel` | `storia_video` | `post` | `carosello` | `storia_foto`), `data` `AAAA-MM-GG`, `ora` `HH:MM`, `titolo`, `idea`, `perche`, `didascalia`, e poi:
- video: `pezzi:[{scena:"V03.2", inizio?, fine?}]` con i secondi DENTRO il video (senza tempi = tutta la scena), `intro`, `outro`, `musica`, `sottotitoli`;
- foto: `foto:["F07"…]` (post e storia_foto 1, carosello 2-10), `righe:[{testo, ruolo}]`.
Cosa si corregge da solo (avviso): ora non valida → 18:30; pezzo oltre la fine della clip → fermato; pezzo sotto 0,8 s → allungato; pezzo sopra 30 s → accorciato; montaggio troppo lungo → si accorcia la coda (reel 90 s con il cartello, storia 59,9 s); codici e foto inesistenti → tolti.
Cosa toglie il contenuto (blocca): tipo sconosciuto, data non valida o fuori dal mese, data già passata rispetto a `oggi` (se arriva), nessun pezzo o foto valida, reel sotto i 5 s.
Avvisi senza correzione: lo stesso momento o la stessa foto in due contenuti, due contenuti nello stesso orario, numeri diversi dalla richiesta, scene o foto con difetti.

**Il montaggio** usa gli stessi motori di `/video/reel` (anche per le storie video, con durata massima 59,9 s), `/grafica/post`, `/grafica/storia` e `/foto/prepara`. I sottotitoli vengono dal parlato salvato nel progetto. Nel carosello la prima foto ha titolo e logo, le altre sono ritagliate in 4:5 con lo stile del marchio. Gli avvisi parlano dei codici del materiale («Il video V02 non è verticale»), non della «clip 1».

**Variabili nuove** (i valori di serie vanno bene):

| Variabile | Di serie | A cosa serve |
|---|---|---|
| `MAX_MATERIALE_MB` | `2048` | grandezza massima di un file del materiale (i lavori normali restano a `MAX_FILE_MB`) |
| `MAX_PROGETTO_MB` | `40000` | materiale massimo di un progetto (413 `progetto_troppo_grande`) |
| `PROGETTO_DURATA_ORE` | `72` | dopo quante ore senza uso un progetto si cancella |

**Errori nuovi:** 404 `progetto_non_trovato`, 409 `progetto_in_uso`, 413 `progetto_troppo_grande`, 422 `progetto_vuoto`, 422 `contenuto_non_valido`, 422 `video_troppo_corto` (materiale sotto 1 s).

### Come chiamarla da n8n (nodo HTTP Request 4.5)
- **Metodo** POST; **URL** `{{ $('Config').item.json.OFFICINA_URL }}/video/reel`.
- **Authentication**: Generic Credential Type → Header Auth → credenziale **'Officina - Chiave'**.
- **Body**: Form-Data. Un campo `dati` di tipo testo con il JSON; un campo per file, di tipo "n8n Binary File": `foto`, `logo`, `clip`, e così via. I campi di testo in più sono ammessi fino a 40 in tutto, e si ignorano.
- **Timeout**: per i video almeno 900000 ms (15 minuti). Un reel da 30 s ha impiegato 42 s qui, ma su un server condiviso può metterci di più, e il lavoro può aspettare in coda.
- **Retry on Fail** attivo, con attesa di 30-60 s: copre il 429 della coda piena e la breve pausa di una nuova pubblicazione.
- **Scaricare il risultato**: GET sull'`url`, stessa credenziale, Response Format = File. I workflow tengono solo il percorso dell'`url` e ci rimettono davanti `OFFICINA_URL`.

### Limiti e scelte di robustezza
- File ≤ 300 MB l'uno, ≤ 800 MB per richiesta, al massimo 40 file e 40 campi di testo. Un lavoro pesante alla volta, al massimo 5 in attesa.
- La 7ª richiesta riceve subito 429, prima ancora di caricare i file.
- FFmpeg lavora con `-threads 2` e whisper con `-t 2`; Node ha un limite di 512 MB; `MALLOC_ARENA_MAX=2` contro la frammentazione della memoria.
- Se n8n chiude la connessione a metà, il programma in corso (ffmpeg/whisper) si ferma e il posto in coda si libera.
- La pulizia gira all'avvio e poi ogni 10 minuti. Cancella i lavori più vecchi di 24 ore, misurate dalla fine del lavoro.
  - Un file scaduto non si scarica comunque, anche prima del giro di pulizia.
- Nessun segreto nel codice: la chiave arriva solo da `OFFICINA_CHIAVE`, confrontata in tempo costante.

### Prove automatiche
```
cd officina
npm ci
npm test                      # 79 prove (12 del montatore), circa 6 minuti, senza Docker (usa /usr/bin/ffmpeg)
npm run prepara-whisper       # facoltativo: compila whisper-cli e whisper-vad-speech-segments, scarica "small" e la voce italiana in .locale/
npm run mutazioni             # rompe il codice di proposito in 39 punti e controlla che le prove se ne accorgano
node test/mutazioni.mjs --controllo   # le stesse prove sulla copia intatta: devono essere tutte verdi
```
L'esito dell'ultimo giro è scritto in `../CHANGELOG-officina.md`.
- Il materiale di prova è tutto **sintetico**: gradienti, forme e scritte disegnate dalle prove, clip `testsrc2`/`color`, toni `sine`, voce `flite` (inglese) e `espeak-ng` (italiano). Nessuna immagine di cibo.
- I dati finti del marchio sono quelli veri del Tropico: colori `#D61D73`, `#3D7C2B`, `#FFFFFF`, `#FBCA1E`, Roboto Slab 800, Archivo e lo stile foto. Il logo è sintetico, largo 1440 px come il loro.
- Le prove sulle aree sicure contano i pixel del colore del testo nelle fasce vietate: deve essercene zero.
- Le quattro prove con il whisper vero si saltano, con il messaggio «non provato qui», se in `.locale/` mancano i programmi, il modello o la voce.
  - Sono: frase breve; frase ripetuta dopo 17 s di silenzio; due frasi divise da 4,5 s di silenzio; voce sopra musica.
  - Altre due girano sulle clip del ricontrollo stesso, se gli dai la cartella: `OFFICINA_MATERIALE_RICONTROLLO=<cartella materiale del ricontrollo> npm test`.
  - Il contratto lo controllano comunque un finto whisper e un finto VAD (`test/finto-whisper.mjs`, `test/finto-vad.mjs`). Il finto whisper imita il difetto del `--vad`, una frase inventata nel silenzio e due frasi messe in un segmento solo, con i tempi per parola.
- I file di prova e le misure vanno in `test/.tmp/`: `misura-reel-30s.json`, `misura-whisper.json`, `misura-whisper-pause.json`, `misura-whisper-pausa45.json`, `misura-whisper-musica.json`.

### File
```
officina/
  Dockerfile, avvio.sh, .dockerignore, .gitignore, package.json, package-lock.json
  src/server.js       rotte, chiave, coda, pulizia, GET / e /salute
  src/coda.js         un lavoro pesante alla volta, max 5 in attesa
  src/upload.js       multipart su disco con i limiti (40 file, 40 campi di testo)
  src/lavori.js       cartelle su /dati, scadenza 24 h
  src/immagini.js     provino, prepara, confronto, misure (sharp/libvips)
  src/grafiche.js     storie e post (satori + resvg)
  src/font.js         font inclusi + Google Font al primo uso + cache; font_testo e peso_titolo
  src/video.js        reel e storie (FFmpeg)
  src/srt.js          SRT, spostamento sui tagli, ASS per libass
  src/progetti.js     montatore: progetti su /dati/progetti, scadenza 72 h
  src/analisi.js      montatore: scene, nitidezza, luce, movimento, miniature, parlato; misure delle foto
  src/catalogo.js     montatore: etichette di qualità, provini con i codici, catalogo in testo
  src/piano.js        montatore: controllo del piano di Claude contro il materiale vero
  src/montaggio.js    montatore: monta un contenuto dal materiale del progetto
  src/trascrizione.js whisper.cpp senza --vad, con i tempi per parola (-dtw) + zone di parlato (silero o silenzi di FFmpeg); segmenti divisi sui silenzi
  font/               Inter, Playfair Display, Archivo (licenza OFL) e Roboto Slab (licenza Apache 2.0)
  strumenti/          prepara-whisper-locale.sh, voce_it.py (voce italiana per le prove)
  test/               prove (npm test), finti whisper e VAD, mutazioni
```
