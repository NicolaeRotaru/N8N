// node rendi.mjs [id ...]  → uscita/<id>.jpg | <id>-<n>.jpg | <id>.mp4 + <id>-copertina.jpg
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, "uscita"); mkdirSync(OUT, { recursive: true });
const solo = process.argv.slice(2);
const piano = JSON.parse(readFileSync(join(DIR, "piano.json"), "utf8")).filter((p) => !solo.length || solo.includes(p.id));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto("file://" + join(DIR, "studio.html"));
await page.evaluate(() => document.fonts.ready);
async function scatta(pezzo, file) {
  const h = pezzo.formato === "storia" || pezzo.tipo === "reel" ? 1920 : 1350;
  await page.setViewportSize({ width: 1080, height: h });
  await page.evaluate((p) => window.costruisci(p), pezzo);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.screenshot({ path: file, type: "jpeg", quality: 92 });
}
for (const p of piano) {
  if (p.tipo === "post") await scatta(p, join(OUT, p.id + ".jpg"));
  else if (p.tipo === "storia") {
    // storia animata: 6 secondi a 30 fotogrammi, poi l'ultimo fotogramma come miniatura
    await scatta(p, join(OUT, p.id + ".jpg"));
    const fr = join(OUT, "_fot"); rmSync(fr, { recursive: true, force: true }); mkdirSync(fr);
    const D = 6, N = D * 30;
    for (let i = 0; i < N; i++) {
      await page.evaluate(([t, d]) => window.animaStoria(t, d), [i / 30, D]);
      await page.screenshot({ path: join(fr, `f${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 90 });
    }
    const off = (parseInt(p.id.slice(-4), 10) % 20).toFixed(1);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(fr, "f%04d.jpg"), "-ss", off, "-i", join(DIR, "musica.wav"),
      "-filter_complex", `[1:a]atrim=0:${D},afade=t=in:d=0.3,afade=t=out:st=${D - 1}:d=1,loudnorm=I=-16:TP=-1.5:LRA=11[a]`,
      "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-shortest", "-movflags", "+faststart", join(OUT, p.id + ".mp4")]);
    rmSync(fr, { recursive: true, force: true });
  }
  else if (p.tipo === "carosello") { let n = 1; for (const s of p.slide) await scatta({ ...s, tipo: "post" }, join(OUT, `${p.id}-${n++}.jpg`)); }
  else if (p.tipo === "reel") {
    const fr = join(OUT, "_fot"); rmSync(fr, { recursive: true, force: true }); mkdirSync(fr);
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.evaluate((p) => window.costruisci(p), p);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    const T = await page.evaluate(() => window.durata());
    const N = Math.round(T * 30);
    for (let i = 0; i < N; i++) {
      await page.evaluate((t) => window.render(t), i / 30);
      await page.screenshot({ path: join(fr, `f${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 90 });
    }
    const mp4 = join(OUT, p.id + ".mp4");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(fr, "f%04d.jpg"), "-i", join(DIR, "musica.wav"),
      "-filter_complex", `[1:a]atrim=0:${T.toFixed(2)},afade=t=out:st=${(T - 1.5).toFixed(2)}:d=1.5,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "medium",
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-shortest", "-movflags", "+faststart", mp4]);
    // copertina: la prima scena con numero e scritta già entrati
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(p.copertina_t ?? 1.2), "-i", mp4, "-frames:v", "1", "-q:v", "2", join(OUT, p.id + "-copertina.jpg")]);
    rmSync(fr, { recursive: true, force: true });
  }
  console.log("fatto", p.id, p.tipo);
}
await browser.close();
