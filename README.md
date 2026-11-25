# N8N — servizi dell'agenzia

## flussi/
I flussi n8n costruiti da programma: **16 · Nuovo cliente da MyCity** (un'attività che si iscrive su
MyCity entra nella scheda Clienti col lavoro del modulo 12, e parte l'analisi della sua attività),
**18 · Analisi di un'attività** (la stessa analisi del giro su una sola attività), **19 · Bozze dei 3 abbonamenti** (le
proposte Base, Business e Premium per l'attività nuova, pronte da mandare dopo averle lette), **97 · Scrivi nell'argomento dell'attività** (ogni messaggio su un negozio nel suo argomento del
gruppo Telegram «Attività») e **17 · Analisi del marketplace** (il giro
dell'AD sui numeri di MyCity, ogni mattina su Telegram). Come si rigenerano e si provano: `flussi/LEGGIMI.md`.

## officina/
Piccolo servizio HTTP che gira accanto a n8n sullo stesso server Sliplane.
Ritaglia e sistema le foto, prepara provini e confronti per le approvazioni,
trascrive l'audio in sottotitoli italiani (whisper.cpp) e, come ripiego gratuito,
monta storie e reel con FFmpeg.

Come pubblicarlo su Sliplane: `officina/LEGGIMI.md`, sezione
«Pubblicare dal repository GitHub su Sliplane» (Dockerfile path `/officina/Dockerfile`,
Docker context `/officina`, servizio non pubblico, volume `/dati`, variabile `OFFICINA_CHIAVE`, porta 8080).

Versione: 1.5.0 (montatore, regia e moodboard di Scatti di G: rallenty, LUT, più formati, progetti per 14 giorni, prova dei filtri all'avvio; e dalla 1.2.0 gli argomenti dei gruppi Telegram).

## montatore/
Workflow n8n «16 · Montatore»: gli dici il cliente e la cartella del servizio su Drive
(«video verticali», «video orizzontali», «foto») e prepara il piano del mese montando
reel, storie, post e caroselli con l'officina. Guida: `montatore/LEGGIMI.md`.
Il file da importare in n8n è `montatore/16-montatore.json` (si rigenera con `node montatore/genera.mjs`).

## Regia SDG
L'editor di Scatti di G: monta un video social da una sceneggiatura (voce, intervista, coperture per significato,
salti coperti, sottotitoli parola per parola, stile SDG). Guida: `montatore/REGIA-SDG.md`.
