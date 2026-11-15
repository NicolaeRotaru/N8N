// Tratti con suono in un WAV PCM 16 bit mono a 16 kHz (lo stesso che l'officina passa a whisper).
// Serve al finto whisper e al finto VAD: finestre da 20 ms, soglia sul picco (−40 dB), pause < 0,3 s unite.
export function trattiConSuono(buf, { soglia = 0.01, pausa = 0.3, minimo = 0.2 } = {}) {
  const campioni = Math.floor((buf.length - 44) / 2);
  const finestra = 320;
  const limite = soglia * 32768;
  const tratti = [];
  let inizio = null;
  let ultimo = null;
  for (let k = 0; k * finestra < campioni; k++) {
    let picco = 0;
    for (let i = k * finestra; i < Math.min(campioni, (k + 1) * finestra); i++) picco = Math.max(picco, Math.abs(buf.readInt16LE(44 + i * 2)));
    const t = (k * finestra) / 16000;
    if (picco >= limite) {
      if (inizio === null) inizio = t;
      ultimo = t + finestra / 16000;
    } else if (inizio !== null && t - ultimo >= pausa) {
      if (ultimo - inizio >= minimo) tratti.push([inizio, ultimo]);
      inizio = null;
    }
  }
  if (inizio !== null && ultimo - inizio >= minimo) tratti.push([inizio, ultimo]);
  return tratti.map(([i, f]) => [Math.round(i * 100) / 100, Math.round(f * 100) / 100]);
}
