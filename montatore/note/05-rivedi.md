## Rivedi (una scheda per contenuto su Telegram)
Il giro, finito il montaggio, lancia un'esecuzione per ogni contenuto e non la aspetta. Ognuna manda la scheda (titolo, giorno e ora, link a Drive; l'anteprima solo se il cliente ha `anteprime_con_persone` = si) e aspetta fino a `ATTESA_REVISIONE_GIORNI`.
**✅ Approva** → in attivo una riga nel Calendario: le storie «approvato» (il 01 le pubblica), reel e post «da scrivere» (il 04 fa la didascalia e la chiede a parte). In prova non scrive niente.
**✏️ Correggi** → «cosa cambio?» → Claude riscrive la regia con la nota (prompt `ritocco.md` + moodboard) → l'esecuzione «monta» rimonta (file «· v2») → scheda nuova. Al massimo `MAX_RITOCCHI` volte. Le foto si segnano da sistemare a mano.
Il progetto resta nell'officina per i ritocchi e scade da solo (14 giorni di serie).
