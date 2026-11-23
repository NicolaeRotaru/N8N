# Prova a banco del 14 · Smista materiale

Fa girare il codice vero dei blocchi del workflow (preso dal backup JSON) su un Drive finto,
senza toccare n8n né Google.

```bash
node prove/14-smista-materiale/prova.mjs prova    # deve finire con «AZIONI []»: in prova non si sposta niente
node prove/14-smista-materiale/prova.mjs attivo   # spostamenti, un errore 403 simulato, video in cartella nuova
```

Casi coperti: foto sciolta, video sciolto (con nome di cartella già preso in «reel»), cartella di clip con brief e
musica, cartella «storie» (con un .webp da lasciare), carosello di foto, cartella mista, cartella vuota, «Pronti»,
HEIC, copia «._» del Mac, nome con «_», .DS_Store, PDF, video oltre 300 MB, file appena caricato, stessa cartella
Drive scritta per due clienti, cliente spento.
