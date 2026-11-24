# N8N — servizi dell'agenzia

## officina/
Piccolo servizio HTTP che gira accanto a n8n sullo stesso server Sliplane.
Ritaglia e sistema le foto, prepara provini e confronti per le approvazioni,
trascrive l'audio in sottotitoli italiani (whisper.cpp) e, come ripiego gratuito,
monta storie e reel con FFmpeg.

Come pubblicarlo su Sliplane: `officina/LEGGIMI.md`, sezione
«Pubblicare dal repository GitHub su Sliplane» (Dockerfile path `/officina/Dockerfile`,
Docker context `/officina`, servizio non pubblico, volume `/dati`, variabile `OFFICINA_CHIAVE`, porta 8080).

Versione: 1.3.0 (con le rotte del montatore e la regia di Scatti di G).

## montatore/
Workflow n8n «16 · Montatore»: gli dici il cliente e la cartella del servizio su Drive
(«video verticali», «video orizzontali», «foto») e prepara il piano del mese montando
reel, storie, post e caroselli con l'officina. Guida: `montatore/LEGGIMI.md`.
Il file da importare in n8n è `montatore/16-montatore.json` (si rigenera con `node montatore/genera.mjs`).

## Regia SDG
L'editor di Scatti di G: monta un video social da una sceneggiatura (voce, intervista, coperture per significato,
salti coperti, sottotitoli parola per parola, stile SDG). Guida: `montatore/REGIA-SDG.md`.
