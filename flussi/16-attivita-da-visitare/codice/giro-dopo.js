// 16 · Secondo e terzo giro — il lavoro numero N di «Prepara il lavoro» per il suo nodo «Chiedi all'AD».
// I giri vanno in fila, uno alla volta (vedi prepara-lavoro.js). Se il giro N non c'è, al 90 va un lavoro con
// «non_mandare»: torna subito senza far partire la routine, e «Componi i messaggi» non lo conta.
const N = __GIRO__;
const lavori = $('Prepara il lavoro').all();
const l = lavori[N - 1];
if (l) return [{ json: l.json }];
return [{ json: { flusso: '16 · Attività da visitare', compito: 'giro non necessario', dati: {}, non_mandare: `giro ${N} non necessario: le attività stanno nei giri prima` } }];
