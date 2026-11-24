# Montatore — LEGGIMI

> **In due righe:** scrivi cliente e cartella del servizio nel modulo, e il montatore prepara da solo il piano del mese con i contenuti già montati su Drive.
> Per accenderlo servono due passi tuoi: pubblicare l'officina 1.2.0 e premere Publish sul workflow 16, che è già in n8n spento.

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
  - In attivo scrive le righe del Calendario. Le storie vanno «da approvare»; reel e post vanno «da scrivere», così il workflow 04 prepara la didascalia. Quello che Claude ha bocciato al controllo resta in «bozza».

## Cosa devi fare
Una volta sola, per accenderlo:
1. **Pubblica l'officina 1.2.0** su Sliplane: è la stessa officina di prima, con le rotte nuove del montatore. Serve il merge del ramo nel `main` del repository `NicolaeRotaru/N8N`. Poi su Sliplane parte la nuova pubblicazione. Controllo: `GET {OFFICINA_URL}/salute` deve dire `versione: "1.2.0"`.
2. **Importa il workflow** `montatore/16-montatore.json` in n8n (se non c'è già «16 · Montatore»). Le credenziali sono le stesse degli altri workflow.
3. **Controlla il Config** del workflow: `OFFICINA_URL` uguale a quello dei workflow 07 e 08, `MODALITA` = `prova`.
4. Premi **Publish** (il tasto di n8n che accende il workflow). Il modulo è all'indirizzo `/form/montatore` del vostro n8n, con lo stesso accesso degli altri moduli.

Ogni volta che c'è un servizio nuovo:
1. Su Drive, dentro la cartella del cliente, crea la cartella del servizio con tre sottocartelle: **video verticali**, **video orizzontali**, **foto**. Vanno bene anche nomi simili («Video Verticali», «foto»), e anche file sciolti.
   - Facoltativo: un file **musica.mp3** con licenza, per i reel dove nessuno parla.
   - Le foto HEIC (il formato di serie dell'iPhone) vanno esportate in JPEG.
2. Apri il modulo e scrivi il cliente e la cartella. Facoltativo: il mese, quanti reel, post e storie, e le note del mese (eventi, promozioni decise dal cliente).
3. Aspetta i messaggi su Telegram e guarda la cartella «Pronti (montatore)».

## Cosa non ho verificato
- **Il giro vero non l'ho fatto girare.** Da qui non arrivo all'officina sul vostro server. Non arrivo neanche a Drive e Telegram, e non ho una chiave di Claude.
  - L'ho provato a pezzi: i nodi Code con un finto n8n, e un giro simulato contro l'officina vera, con Drive e Claude finti.
  - La prima prova vera va fatta in modalità prova, con un servizio piccolo (5-10 file).
- **Quanto è bravo Claude a scegliere i momenti** si vede solo con un girato vero. Le regole sono nei prompt (`montatore/prompt/`), e l'officina ricontrolla ogni codice e ogni tempo.
- **Memoria di n8n con file grandi.** I file passano da n8n uno alla volta. Il limite è `MAX_MB_FILE` = 500 MB.
  - Se n8n tiene i file in memoria, un file da 500 MB pesa 500 MB sul server da 4 GB.
  - Se servono file più grandi, prima conviene `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` su n8n.
- **Spazio sul volume `/dati` dell'officina.** Un servizio intero resta lì fino a 72 ore (o finché il giro non lo chiude). Non so quanto è grande il volume su Sliplane.
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
 └─ tutto riuscito: officina POST /progetto/<id>/chiudi (altrimenti il progetto scade da solo dopo 72 ore)
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
| `REEL` / `POST` / `STORIE` | `8` / `8` / `16` | quantità di serie se il modulo le lascia vuote |

### Il foglio Clienti
Il montatore usa le colonne che usano già gli altri workflow:
- `cliente`, `nome_locale`, `cartella_drive` (obbligatoria);
- `marchio`, il JSON con colori, font, `font_testo`, `peso_titolo`, `stile_foto` e `logo` (link Drive o https);
- per il piano: `tono_di_voce`, `orari`, `giorni_chiusura`, `indirizzo`, `telefono`, `link_prenotazione`, `link_menu`, `menu_testo`, `hashtag_fissi`, `account_da_taggare`, `note_piano`, `esempi_didascalie`, `regole_risposte`, e se ci sono `tipo_locale`, `categoria`, `descrizione`.

### Le righe del Calendario (solo con MODALITA = attivo)
`id` = `MO-<cliente>-<AAAAMMGG>-<hhmm>-<4 lettere del progetto><n>` · `tipo` (reel, post, carosello, storia) · `piattaforme` = `ig+fb` · `data_ora` · `brief` (idea, perché funziona, didascalia proposta, momenti usati) · `media` (link Drive; per i caroselli separati da « | ») · `copertina` (reel) · `stato` · `note` = «montatore AI».

### I tre prompt
`prompt/capire.md` (guardare i provini), `prompt/piano.md` (piano del mese e regole di montaggio), `prompt/controllo.md` (controllo dei fotogrammi). Si cambiano lì e si rigenera il workflow.

### Rigenerare e provare
```
node montatore/genera.mjs                       # riscrive montatore/16-montatore.json
cd officina && npm ci && cd ..
node --test montatore/test/*.test.mjs           # 13 prove: nodi Code + giro simulato con l'officina vera
cd officina && npm test                         # prove dell'officina (comprese le 12 del montatore)
```
