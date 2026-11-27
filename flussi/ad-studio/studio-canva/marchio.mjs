// I colori veri del marchio, letti dal foglio di stile del sito del cliente (mai a occhio).
// Uso: node marchio.mjs <foglio.css> [altro.css …] [--logo logo.png]
// Scrive in uscita i colori ordinati per quante volte il sito li usa, e una proposta di ruoli:
// scuro (testo e fondi scuri), chiaro (fondi chiari), accento (nastri e cose da far vedere), secondo.
// Regola nata il 27/11 (Nicola: «il rosa non è il colore del marchio»): conta quanto il sito USA un colore,
// non quanto è grande nel logo. Un colore che compare poco è un dettaglio, non il colore del marchio.
import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const css = args.filter((a) => a.endsWith(".css") || a.endsWith(".txt") || a.endsWith(".html")).map((f) => readFileSync(f, "utf8")).join("\n");
const hex = (h) => { h = h.replace("#", "").toUpperCase(); if (h.length === 3) h = [...h].map((c) => c + c).join(""); return "#" + h.slice(0, 6); };
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
const lum = (h) => { const v = rgb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const sat = (h) => { const [r, g, b] = rgb(h).map((c) => c / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };

// 1) variabili CSS (--nome: #colore) e quante volte si usano con var(--nome)
const variabili = {};
for (const m of css.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) variabili[m[1]] = hex(m[2]);
const usi = {};
for (const [nome, col] of Object.entries(variabili)) {
  const n = (css.match(new RegExp(`var\\(--${nome}\\)`, "g")) || []).length;
  usi[col] = (usi[col] || 0) + n;
}
// 2) colori scritti direttamente
const senzaDefinizioni = css.replace(/--[a-zA-Z0-9-]+\s*:\s*#[0-9a-fA-F]{3,8}\b/g, "");
for (const m of senzaDefinizioni.matchAll(/(?<![-\w])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) { const c = hex(m[0]); usi[c] = (usi[c] || 0) + 1; }
const lista = Object.entries(usi).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
const nomeDi = (c) => Object.entries(variabili).filter(([, v]) => v === c).map(([k]) => k).join(", ");
console.log("Colori del sito, dal più usato:");
for (const [c, n] of lista.slice(0, 12)) console.log(`  ${c}  ${String(n).padStart(4)} usi  luminosità ${lum(c).toFixed(2)}  saturazione ${sat(c).toFixed(2)}  ${nomeDi(c)}`);

// 3) proposta di ruoli: solo i colori usati almeno un sesto del più usato (sotto è un dettaglio)
const soglia = Math.max(5, Math.ceil((lista[0]?.[1] || 0) / 6));
const veri = lista.filter(([, n]) => n >= soglia).map(([c]) => c);
const scuro = [...veri].sort((a, b) => lum(a) - lum(b))[0];
const chiaro = [...veri].sort((a, b) => lum(b) - lum(a))[0];
const colorati = veri.filter((c) => c !== scuro && c !== chiaro && sat(c) > 0.35);
const ruoli = { scuro, accento: colorati[0] || scuro, secondo: colorati[1] || colorati[0] || scuro, chiaro };
console.log("\nProposta di ruoli (da controllare a occhio sul sito):");
console.log(JSON.stringify(ruoli));
const scartati = lista.filter(([, n]) => n < soglia).map(([c, n]) => `${c} (${n})`);
if (scartati.length) console.log(`Usati meno di ${soglia} volte, quindi dettagli e non colori del marchio: ` + scartati.join(", "));

// 4) caratteri dichiarati dal sito
const font = new Set([...css.matchAll(/font-family\s*:\s*['"]?([^'",;]+)/g)].map((m) => m[1].trim()).filter((f) => !/var\(|inherit|serif|sans|Riserva|Arial|Times|Georgia|Helvetica|system/i.test(f)));
console.log("\nCaratteri del sito: " + ([...font].join(", ") || "nessuno dichiarato"));
