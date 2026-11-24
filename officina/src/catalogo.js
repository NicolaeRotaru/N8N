// Catalogo del progetto: il materiale in forma leggibile per Claude.
// - i PROVINI: griglie di miniature con il codice di ogni scena/foto scritto sopra (V03.2, F07), da guardare;
// - il TESTO: una riga per scena/foto con durata, qualità misurata e parlato, da leggere insieme ai provini.
// Le etichette di qualità sono RELATIVE al servizio: «sfocata» = molto meno nitida delle altre dello stesso giorno.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { jpegEntro, MAX_ANTEPRIMA, svgInPng } from './immagini.js';

export const PROVINO = { colonne: 5, righe: 4, cella: 296, spazio: 12, maxCelle: 600 };

const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const virgola = (n, cifre = 1) => Number(n).toFixed(cifre).replace('.', ',');

export function mmss(t) {
  const s = Math.max(0, Math.round(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function mediana(v) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Etichette di qualità di ogni scena e foto, rispetto al resto del servizio.
export function etichetteQualita(materiali) {
  const scene = materiali.filter((m) => m.tipo === 'video').flatMap((m) => m.scene);
  const foto = materiali.filter((m) => m.tipo === 'foto');
  const nitScene = mediana(scene.map((s) => s.nitidezza));
  const nitFoto = mediana(foto.map((f) => f.nitidezza));
  const qualita = (x, rif, sogliaAssoluta) => {
    const q = [];
    if (x.nitidezza < Math.max(sogliaAssoluta, rif * 0.3)) q.push('sfocata');
    if (x.luminosita < 40) q.push('buia');
    else if (x.luminosita > 220) q.push('bruciata');
    if (x.movimento !== undefined && x.movimento > 30) q.push('mossa');
    return q;
  };
  const out = new Map();
  for (const s of scene) out.set(s.codice, qualita(s, nitScene, 6));
  for (const f of foto) {
    const q = qualita(f, nitFoto, 15);
    if (f.doppione_di) q.push(`doppione di ${f.doppione_di}`);
    out.set(f.codice, q);
  }
  return out;
}

export function movimentoLeggibile(m) {
  if (m < 4) return 'fermo';
  if (m < 15) return 'movimento medio';
  return 'movimento forte';
}

// Il materiale senza i dati interni (percorsi, hash): quello che serve a chi pianifica.
export function materialiPubblici(progetto) {
  const q = etichetteQualita(progetto.materiali);
  return progetto.materiali.map((m) => {
    const base = { codice: m.codice, tipo: m.tipo, nome_originale: m.nome_originale, cartella: m.cartella, orientamento: m.orientamento, larghezza: m.larghezza, altezza: m.altezza };
    if (m.tipo === 'foto') return { ...base, qualita: q.get(m.codice) || [] };
    return {
      ...base,
      durata: m.durata,
      audio: m.audio,
      parlato: Array.isArray(m.parlato) && m.parlato.length > 0,
      scene: m.scene.map((s) => ({
        codice: s.codice,
        inizio: s.inizio,
        fine: s.fine,
        movimento: movimentoLeggibile(s.movimento),
        qualita: q.get(s.codice) || [],
        ...(s.parlato ? { parlato: s.parlato } : {}),
      })),
    };
  });
}

// Il catalogo in testo: una riga per materiale e una per scena. È un DATO per Claude, non un'istruzione.
export function testoCatalogo(progetto) {
  const q = etichetteQualita(progetto.materiali);
  const righe = [];
  const pulito = (s) => String(s || '').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const m of progetto.materiali) {
    const nome = pulito(m.nome_originale).slice(0, 80);
    if (m.tipo === 'video') {
      righe.push(`${m.codice} · video ${m.orientamento} ${m.larghezza}×${m.altezza} · ${virgola(m.durata)} s · ${m.parlato?.length ? 'qualcuno parla' : m.audio ? 'audio senza parlato' : 'senza audio'} · file «${nome}»`);
      for (const s of m.scene) {
        const et = q.get(s.codice) || [];
        const parti = [`  ${s.codice}  ${virgola(s.inizio)}–${virgola(s.fine)} s (${virgola(s.fine - s.inizio)} s)`, movimentoLeggibile(s.movimento), et.length ? et.join(', ') : 'buona'];
        // le frasi con i loro tempi: servono a Claude per non tagliare una frase a metà
        const frasi = (m.parlato || []).filter((f) => f.fine > s.inizio && f.inizio < s.fine);
        if (frasi.length) parti.push(`dice: ${frasi.map((f) => `«${pulito(f.testo).slice(0, 120)}» ${virgola(f.inizio)}–${virgola(f.fine)} s`).join('; ')}`);
        else if (s.parlato) parti.push(`dice: «${pulito(s.parlato).slice(0, 160)}»`);
        righe.push(parti.join(' · '));
      }
    } else {
      const et = q.get(m.codice) || [];
      righe.push(`${m.codice} · foto ${m.orientamento} ${m.larghezza}×${m.altezza} · ${et.length ? et.join(', ') : 'buona'} · file «${nome}»`);
    }
  }
  return righe.join('\n');
}

// Le celle dei provini: prima tutte le scene dei video (in ordine), poi le foto. Oltre maxCelle si lasciano fuori
// prima le scene/foto peggiori (sfocate, buie, doppioni), poi le ultime.
export function celleProvini(progetto, maxCelle = PROVINO.maxCelle) {
  const q = etichetteQualita(progetto.materiali);
  let celle = [];
  for (const m of progetto.materiali.filter((x) => x.tipo === 'video')) {
    for (const s of m.scene) if (s.miniatura) celle.push({ codice: s.codice, miniatura: s.miniatura, sotto: `${mmss(s.inizio)}–${mmss(s.fine)}`, scarsa: (q.get(s.codice) || []).length > 0 });
  }
  for (const f of progetto.materiali.filter((x) => x.tipo === 'foto')) {
    celle.push({ codice: f.codice, miniatura: f.miniatura, sotto: 'foto', scarsa: (q.get(f.codice) || []).length > 0 });
  }
  let esclusi = 0;
  if (celle.length > maxCelle) {
    const buone = celle.filter((c) => !c.scarsa);
    const tenute = new Set((buone.length >= maxCelle ? buone.slice(0, maxCelle) : [...buone, ...celle.filter((c) => c.scarsa).slice(0, maxCelle - buone.length)]).map((c) => c.codice));
    esclusi = celle.length - tenute.size;
    celle = celle.filter((c) => tenute.has(c.codice));
  }
  return { celle, esclusi };
}

// Disegna i provini: griglie 5×4 di miniature con il codice in grande, lato lungo ≤ 1568 px, ≤ 3,5 MB.
export async function disegnaProvini(celle, dirProgetto, dirOut, cfg, opz = PROVINO) {
  const perFoglio = opz.colonne * opz.righe;
  const fogli = [];
  for (let i = 0; i < celle.length; i += perFoglio) fogli.push(celle.slice(i, i + perFoglio));
  const out = [];
  for (const [k, foglio] of fogli.entries()) {
    const colonne = Math.min(opz.colonne, foglio.length);
    const righe = Math.ceil(foglio.length / opz.colonne);
    const W = colonne * opz.cella + (colonne + 1) * opz.spazio;
    const H = righe * opz.cella + (righe + 1) * opz.spazio;
    const comp = [];
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
    for (const [i, c] of foglio.entries()) {
      const x0 = opz.spazio + (i % opz.colonne) * (opz.cella + opz.spazio);
      const y0 = opz.spazio + Math.floor(i / opz.colonne) * (opz.cella + opz.spazio);
      const { data, info } = await sharp(path.join(dirProgetto, c.miniatura))
        .resize(opz.cella, opz.cella, { fit: 'inside' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      comp.push({ input: await sharp(data, { raw: info }).png({ compressionLevel: 1 }).toBuffer(), left: x0 + Math.floor((opz.cella - info.width) / 2), top: y0 + Math.floor((opz.cella - info.height) / 2) });
      const lw = 30 + c.codice.length * 19;
      svg += `<rect x="${x0 + 6}" y="${y0 + 6}" width="${lw}" height="46" rx="10" fill="#000" fill-opacity="0.8" stroke="#fff" stroke-width="2"/>`;
      svg += `<text x="${x0 + 6 + lw / 2}" y="${y0 + 40}" font-family="Inter" font-weight="700" font-size="30" fill="#fff" text-anchor="middle">${xml(c.codice)}</text>`;
      const sw = 22 + c.sotto.length * 12;
      svg += `<rect x="${x0 + opz.cella - sw - 6}" y="${y0 + opz.cella - 40}" width="${sw}" height="34" rx="8" fill="#000" fill-opacity="0.75"/>`;
      svg += `<text x="${x0 + opz.cella - 6 - sw / 2}" y="${y0 + opz.cella - 15}" font-family="Inter" font-weight="700" font-size="21" fill="#fff" text-anchor="middle">${xml(c.sotto)}</text>`;
    }
    svg += '</svg>';
    comp.push({ input: svgInPng(svg, cfg.fontRiservaDir), left: 0, top: 0 });
    const tela = await sharp({ create: { width: W, height: H, channels: 3, background: '#1c1c1c' } }).composite(comp).png({ compressionLevel: 1 }).toBuffer();
    const { buf } = await jpegEntro(tela, MAX_ANTEPRIMA, { qualita: 84 });
    const nome = `provino-${String(k + 1).padStart(2, '0')}.jpg`;
    await fs.writeFile(path.join(dirOut, nome), buf);
    out.push({ nome, codici: foglio.map((c) => c.codice), larghezza: W, altezza: H });
  }
  return out;
}
