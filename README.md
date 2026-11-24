# N8N — servizi dell'agenzia

## flussi/
I flussi n8n costruiti da programma: **16 · Nuovo cliente da MyCity** (un'attività che si iscrive su
MyCity entra nella scheda Clienti col lavoro del modulo 12, e parte l'analisi della sua attività),
**18 · Analisi di un'attività** (la stessa analisi del giro su una sola attività) e **17 · Analisi del marketplace** (il giro
dell'AD sui numeri di MyCity, ogni mattina su Telegram). Come si rigenerano e si provano: `flussi/LEGGIMI.md`.

## officina/
Piccolo servizio HTTP che gira accanto a n8n sullo stesso server Sliplane.
Ritaglia e sistema le foto, prepara provini e confronti per le approvazioni,
trascrive l'audio in sottotitoli italiani (whisper.cpp) e, come ripiego gratuito,
monta storie e reel con FFmpeg.

Come pubblicarlo su Sliplane: `officina/LEGGIMI.md`, sezione
«Pubblicare dal repository GitHub su Sliplane» (Dockerfile path `/officina/Dockerfile`,
Docker context `/officina`, servizio non pubblico, volume `/dati`, variabile `OFFICINA_CHIAVE`, porta 8080).

Versione: 1.1.1.
