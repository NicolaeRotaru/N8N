# Regia SDG — LEGGIMI

> **In due righe:** questa guida spiega l'editor video di Scatti di G. Tu scrivi una sceneggiatura in testo semplice, l'officina monta il video finito.
> Sotto c'è la voce, sopra le immagini scelte per significato. I salti si coprono da soli.

## In parole semplici
È l'editor di Scatti di G. Non decide da solo cosa raccontare: segue quello che scrive l'autore, come farebbe un montatore umano.
- **L'autore** scrive la sceneggiatura: cosa dice la voce, chi parla nell'intervista, quali immagini, quali scritte.
- **Claude** sceglie le frasi giuste nell'audio e le immagini giuste nel girato.
- **L'officina** taglia al secondo esatto, applica le regole contro i difetti e fa l'MP4 finito.

Esempio. L'autore scrive tre righe: «VOCE: Da trent'anni la famiglia Rossi impasta il pane», poi «INTERVISTA: Mario Rossi, fornaio», poi «CHIUSURA: Ordina su MyCity». Esce un video verticale:
- durante la voce si vedono le mani nell'impasto e il forno.
- poi c'è Mario che parla, con il cartello «MARIO ROSSI · FORNAIO».
- dove l'intervista è stata accorciata c'è un'immagine sopra, così il salto non si vede.
- in fondo c'è la chiusura in avorio, con un filo d'oro sotto.

## Cosa cambia per te
- **Niente programma di montaggio.** Il video esce finito: MP4 H.264, verticale (o quadrato, o orizzontale), volume giusto per Instagram.
- **Lo stile è quello della moodboard di Scatti di G (dal 24/11/2026, notte):**
  - mai di fretta: ogni inquadratura dura da 2,5 a 6 secondi, mai meno di 1.
  - il nero è morbido (grigio-nero) e le luci non bruciano; niente grana.
  - font Poppins; colori fumo, avorio e oro (codici esatti da confermare).
  - sottotitoli sobri: la frase intera, in minuscolo, che entra e esce piano.
  - cartello del nome in avorio con un filo d'oro; l'oro è l'unico accento (o il colore del cliente, se si vede sul fondo scuro).
  - 25 fotogrammi al secondo. Le clip girate a 50-120 fotogrammi senza voce si rallentano da sole.
  - Lo stile veloce di prima (lime, parola che salta, grana) c'è ancora: si chiama `virale`.
- **I «bolli» li toglie una macchina, non l'occhio.** Le regole sono scritte una volta e valgono per ogni video:
  - i tagli cadono tra una parola e l'altra.
  - la voce fuori campo è sempre coperta da immagini.
  - un salto nell'intervista è sempre coperto.
  - nessuna inquadratura dura meno di 1 secondo (0,6 nello stile `virale`).
  - un volto tra due immagini dura almeno 1,5 secondi (1 nello stile `virale`) quando il materiale lo permette; se no arriva l'avviso «volto corto».
  - sul salto di un'intervista non torna la scena appena vista: meglio un'immagine già usata altrove.
  - un volto si vede solo quando si sente la sua voce.
  - la stessa scena non ricomincia subito dopo sé stessa: si cambia ordine, o la clip continua da dove era arrivata.
  - se le immagini sono poche si ripetono (con un avviso), ma non si allunga mai una clip oltre la sua fine.
  - a montaggio finito si contano i fotogrammi: se voce e immagini non tornano al fotogramma, il video non si consegna.
  - A video finito controlla anche che non ci siano fotogrammi neri o immagini ferme.

## Cosa devi fare
1. Per ogni video, una cartella con dentro:
   - la voce fuori campo (un file audio).
   - le interviste.
   - le coperture (video verticali e orizzontali).
   - le foto.
   - se vuoi, una musica.
   - un file **sceneggiatura.txt**.
2. Scrivi la sceneggiatura come nell'esempio qui sotto. Niente è obbligatorio tranne almeno un blocco. I tempi tra parentesi quadre sono facoltativi.
3. Per ora il giro automatico (la cartella che parte da sola e il risultato su Drive) non c'è ancora: è il prossimo passo, con n8n e il NAS.

```
# Il pane dei Rossi
FORMATO: verticale
DURATA: 45
MUSICA: si
// tono caldo, niente effetti speciali

VOCE: voce.wav
Da trent'anni la famiglia Rossi impasta il pane alle quattro di mattina.
COPERTURA: mani nell'impasto, il forno acceso

INTERVISTA: Mario Rossi, fornaio
Ho cominciato a quattordici anni con mio padre.
[00:12-00:31]

SCRITTA: Dal 1994
IMMAGINI 5s: il negozio la mattina presto; la fila fuori

VOCE:
Oggi il pane dei Rossi arriva anche a casa vostra.

CHIUSURA: Ordina su MyCity
```

| Parola | Cosa fa |
|---|---|
| `VOCE:` | un pezzo di voce fuori campo. Dopo i «:» va il nome del file, se vuoi. Sotto, il testo che dice |
| `INTERVISTA:` | chi parla e il suo ruolo, per esempio «Mario Rossi, fornaio». Sotto, quello che dice |
| `COPERTURA:` | quali immagini mettere sopra il blocco prima, separate da virgole |
| `SCRITTA:` | una scritta grande a metà schermo |
| `IMMAGINI 5s:` | 5 secondi di sole immagini con la musica |
| `[00:12-00:31]` | dove si trova il pezzo dentro il file (facoltativo) |
| `FORMATO:` | verticale (di serie), quadrato, orizzontale |
| `DURATA:` | durata massima in secondi: si tolgono le ultime battute intere, mai a metà |
| `MUSICA:` | si, no, o il nome del file musicale |
| `CHIUSURA:` | la frase finale, in avorio con il filo d'oro |
| `// …` | una nota per la regia, non va nel video |

## Cosa non ho verificato
- **Claude vero non l'ho collegato.** Il piano di regia della prova l'ho scritto io a mano. Il prompt per Claude è pronto, ma non l'ho provato.
- **Whisper vero non c'è qui.** Le prove usano un finto, che però dà i tempi di ogni parola come il vero. Con una voce vera i tagli possono sbagliare di 1-2 decimi di secondo.
- **Il ritaglio del volto non riconosce le facce.** Taglia a sinistra, al centro o a destra secondo quello che dice Claude guardando le miniature.
- **Il collaudo.** La regia è passata da tre collaudi indipendenti. Il terzo ha trovato ancora due difetti, uno grave: un falso allarme sulle frasi attaccate della stessa intervista. Come hai deciso tu, li ho corretti senza un quarto collaudo.
  - Le correzioni le ho misurate con i simulatori dei collaudatori: zero timeline rifiutate, zero errori sui fotogrammi, zero pezzi fuori dalla clip su 100.000 piani casuali.
  - Con materiale estremo restano alcune inquadrature sotto 0,6 secondi, sempre con un avviso. Succede con clip più corte di 1,2 secondi, o con battute tagliate a metà parola.
- **Il server di Sliplane è piccolo.** La prova da 26 secondi si monta in circa un minuto qui (4 processori). Lì può volerci di più.

---

## Dettagli tecnici
- Officina 1.3.0: `src/sceneggiatura.js` (lettore), `src/regia.js` (regole e timeline piatta), `src/regia-render.js` (render), rotte `POST /sceneggiatura/leggi`, `POST /progetto/:pid/regia/controlla`, `POST /progetto/:pid/regia/monta`. Contratto completo in `officina/LEGGIMI.md`.
- La voce fuori campo entra come materiale audio (`A01`…) dalla stessa rotta del materiale; la trascrizione conserva il tempo di ogni parola.
- Il piano di regia (lo scrive Claude con `montatore/prompt/regia.md`):
```json
{
  "titolo": "Il pane dei Rossi",
  "battute": [
    { "fonte": "A01", "inizio": 0.3, "fine": 10.1, "coperture": [{ "scena": "V02.1" }, { "foto": "F01" }, { "scena": "V03.1", "posizione": "intera" }] },
    { "fonte": "V01", "inizio": 0.9, "fine": 5.0, "nome": "Mario Rossi", "ruolo": "fornaio", "posizione_volto": "centro" },
    { "fonte": "V01", "inizio": 10.2, "fine": 15.1, "coperture": [{ "scena": "V03.1" }] },
    { "immagini": 4, "coperture": ["V02.4"] }
  ],
  "coperture_riserva": ["V02.3", "V05.1"],
  "scritte": [{ "testo": "Dal 1994", "battuta": 2 }],
  "chiusura": "Ordina su MyCity",
  "musica": true
}
```
- Prove: `cd officina && node --test --test-concurrency=1 test/10-regia.test.js test/11-moodboard.test.js`. Ci sono 4 render veri, i piani casuali col ritmo veloce e con quello lento, rallenty, LUT e doppio formato.
- Più formati dalla stessa regia: `dati.formati: ["verticale","orizzontale"]` in `/regia/monta`. LUT: `POST /lut` una volta, poi `dati.lut`. Dettagli in `officina/LEGGIMI.md`, sezione 1.4.0.
