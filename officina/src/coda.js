// Coda in memoria: UN solo lavoro pesante alla volta, al massimo `maxAttesa` lavori in attesa.
// Un lavoro occupa un posto da quando arriva la richiesta (anche mentre carica i file) fino alla fine.
export class Coda {
  constructor(maxAttesa = 5) {
    this.maxAttesa = maxAttesa;
    this.prenotati = 0; // in corso + in attesa (compresi quelli che stanno ancora caricando)
    this.occupato = false; // il posto "pesante"
    this.attesa = []; // FIFO di { resolve, reject, biglietto }
    this.durataMediaMs = 60_000;
  }

  get lunghezza() {
    return this.prenotati;
  }

  // Restituisce un biglietto, oppure null se la coda è piena.
  prenota() {
    if (this.prenotati >= 1 + this.maxAttesa) return null;
    this.prenotati += 1;
    return new Biglietto(this);
  }

  // Secondi suggeriti al client prima di riprovare (header Retry-After).
  riprovaTraSecondi() {
    const stima = Math.ceil((this.durataMediaMs / 1000) * Math.max(1, this.prenotati - this.maxAttesa));
    return Math.min(900, Math.max(5, stima));
  }

  _prendi(biglietto, segnale) {
    if (!this.occupato) {
      this.occupato = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const voce = { resolve, reject, biglietto };
      this.attesa.push(voce);
      if (segnale) {
        const via = () => {
          const i = this.attesa.indexOf(voce);
          if (i >= 0) this.attesa.splice(i, 1);
          const e = new Error('annullato');
          e.annullato = true;
          reject(e);
        };
        if (segnale.aborted) via();
        else segnale.addEventListener('abort', via, { once: true });
      }
    });
  }

  _rilascia(durataMs) {
    if (durataMs) this.durataMediaMs = Math.round(this.durataMediaMs * 0.7 + durataMs * 0.3);
    const prossimo = this.attesa.shift();
    if (prossimo) prossimo.resolve(); // il posto passa direttamente al prossimo
    else this.occupato = false;
  }
}

class Biglietto {
  constructor(coda) {
    this.coda = coda;
    this.haIlPosto = false;
    this.liberato = false;
    this.inizio = 0;
  }

  async turno(segnale) {
    if (this.liberato) throw new Error('biglietto già liberato');
    await this.coda._prendi(this, segnale);
    this.haIlPosto = true;
    this.inizio = Date.now();
  }

  // Idempotente: si può chiamare più volte.
  libera() {
    if (this.liberato) return;
    this.liberato = true;
    this.coda.prenotati -= 1;
    if (this.haIlPosto) {
      this.haIlPosto = false;
      this.coda._rilascia(Date.now() - this.inizio);
    }
  }
}
