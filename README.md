# N8N — servizi dell'agenzia

## officina/
Piccolo servizio HTTP che gira accanto a n8n sullo stesso server Sliplane.
Ritaglia e sistema le foto, prepara provini e confronti per le approvazioni,
trascrive l'audio in sottotitoli italiani (whisper.cpp) e, come ripiego gratuito,
monta storie e reel con FFmpeg.

Come pubblicarlo su Sliplane: `officina/LEGGIMI.md`, sezione
«Pubblicare dal repository GitHub su Sliplane» (Dockerfile path `/officina/Dockerfile`,
Docker context `/officina`, servizio non pubblico, volume `/dati`, variabile `OFFICINA_CHIAVE`, porta 8080).

Versione: 1.1.1.
