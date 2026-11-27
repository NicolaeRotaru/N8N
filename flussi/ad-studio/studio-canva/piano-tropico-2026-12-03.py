# Piano del Tropico dal 3 al 9 dicembre, con le foto nuove messe da Nicola su Drive il 27/11 (16:56-17:21),
# cartella «Da programmare / Originali»: 91 scatti da studio del 5/10/2015 (codici T1…T93) e 32 dolci del 21/4/2016 (D1…D32).
# Più il post del burrito del 17/12, rifiutato il 25/11, rifatto con una foto nuova (id nuovo: la riga vecchia resta in bozza).
# Orari scelti fra quelli liberi del Calendario letto il 27/11 alle 22:21; tre righe «idea» del piano di dicembre si riempiono
# col loro id (3/12 20:30, 6/12 19:00, 8/12 20:00).
# Fatti: orari, indirizzo, telefono fisso (cliente.json); menu del sito letto il 26/11 (burrito, fajitas e loro sei nomi,
# nachos, dieci piatti alla griglia, caraffe da un litro, churros e brownie fra i dolci, Oreo cake); «margarita frozen alla
# fragola» detto da Nicola il 27/11 alle 21:48. Niente prezzi nelle grafiche, niente nomi a piatti incerti.
# Nicola, 27/11 verso le 22:35: nelle grafiche e nei testi solo «margarita frozen», senza «alla fragola» (appesantisce la frase).
# Le foto «…v» sono la stessa foto messa in verticale per storie e reel, col suo fondo grigio allungato sopra e sotto.
import json
INDIR = "📍 Via Mazzini 77/A, Piacenza\n📞 Prenota: 0523 335932"
def didasc(testo, tag): return f"{testo}\n\n{INDIR}\n\n#eltropicolatino #piacenza {tag}"
P = []
def storia(data, ora, **k): P.append(dict(tipo="storia", formato="storia", data_ora=f"{data} {ora}", **k))
def feed(tipo, data, ora, didascalia, primo, **k): P.append(dict(tipo=tipo, data_ora=f"{data} {ora}", didascalia=didascalia, primo_commento=primo, **k))
SF = dict(modello="storia-foto", y=1210)   # storia con la foto verticale: la scritta sotto il piatto

# ---------- giovedì 3/12 ----------
storia("2026-12-03", "13:00", **SF, foto="T63v", titolo="Stasera<br>fajitas?", sotto="Per due, da dividere al tavolo", info=False)
feed("reel", "2026-12-03", "19:15",
     didasc("Il menu del Tropico in quindici secondi. 🌮\nBurrito, fajitas per due, nachos, la griglia, i churros e il margarita frozen.\nIl menu intero è sul nostro sito.\nCucina aperta dalle 19:00 alle 23:00, venerdì e sabato fino alle 23:30. Lunedì chiuso.", "#cucinamessicana #cenapiacenza"),
     "Da cosa cominci? 👇", copertina_t=1.0,
     scene=[dict(foto="T27v", d=2.2, lab="Il menu del Tropico", y=1330, z0=1.0, z1=1.10),
            dict(foto="T32v", d=1.7, lab="Burrito", y=1330, z0=1.12, z1=1.0),
            dict(foto="T63v", d=1.7, lab="Fajitas per 2", y=1330, z0=1.0, z1=1.12),
            dict(foto="T73v", d=1.7, lab="Nachos", y=1330, z0=1.12, z1=1.0),
            dict(foto="T41v", d=1.7, lab="A la grilla", y=1330, z0=1.0, z1=1.12),
            dict(foto="D19v", d=1.7, lab="Churros", y=1330, z0=1.12, z1=1.0),
            dict(foto="T89v", d=1.9, lab="Margarita frozen", y=1330, z0=1.0, z1=1.12),
            dict(colore="nero", d=3.2, outro=["Prenota il tuo tavolo", "0523 335932", "Via Mazzini 77/A · Piacenza"])])
storia("2026-12-03", "20:30", **SF, foto="T89v", titolo="Margarita frozen<br>o mojito?", sotto="Al bancone, dalle 18:30", info=False)

# ---------- venerdì 4/12 (alle 18:30 c'è già il post del piatto misto, approvato) ----------
storia("2026-12-04", "13:00", modello="storia-testo", colore="giallo", titolo="Il weekend<br>si prenota oggi", sotto="Chiama lo 0523 335932", foto="T41", rot=-4)
storia("2026-12-04", "21:30", **SF, foto="T73v", titolo="Cucina aperta<br>fino alle 23:30", sotto="Venerdì e sabato", info=False)

# ---------- sabato 5/12 (alle 19:00 c'è già la storia dell'aperitivo, approvata) ----------
storia("2026-12-05", "13:00", **SF, foto="T41v", titolo="Sabato<br>alla griglia", sotto="Dieci piatti, anche per 2 o più", info=False)
feed("carosello", "2026-12-05", "18:30",
     didasc("Lascia posto per il dolce. 🍫\nChurros con gelato e caramello, l'Oreo cake, il brownie, il waffle e la coppa con la panna.\nQuelli di stasera te li dice chi ti serve al tavolo.\nSfoglia: tu quale prendi?", "#dolci #cenapiacenza"),
     "Quale dividi, e quale tieni tutto per te? 👇",
     slide=[dict(modello="post-foto", foto="D17", titolo="Lascia posto <em>per il dolce</em>", sotto="Sfoglia →", cont="1/6"),
            dict(modello="post-foto", foto="D19", fy=55, titolo="Churros", sotto="Con gelato e caramello", cont="2/6"),
            dict(modello="post-foto", foto="T78", titolo="Oreo cake", sotto="Con la panna e il cioccolato", cont="3/6"),
            dict(modello="post-foto", foto="D24", titolo="Brownie", sotto="Con gelato e panna", cont="4/6"),
            dict(modello="post-foto", foto="D13", titolo="Il waffle", sotto="Col gelato e il caramello", cont="5/6"),
            dict(modello="post-testo", colore="nero", titolo="Tu quale<br>prendi?", fs=120, sotto="I dolci di stasera<br>te li dice chi ti serve.", cont="6/6", piede=False)])
storia("2026-12-05", "21:30", **SF, foto="D19v", titolo="Spazio<br>per i churros?", sotto="Sfoglia i dolci nel post di oggi", info=False)

# ---------- domenica 6/12 ----------
storia("2026-12-06", "13:00", modello="storia-testo", colore="verde", titolo="Domenica<br>siamo aperti", sotto="Aperitivo dalle 18:30<br>cucina dalle 19 alle 23", foto="T63c", fx=40)
feed("carosello", "2026-12-06", "18:30",
     didasc("Come si mangia una fajita, in quattro mosse. 🔥\nSi prende una tortilla calda, si mette poca carne e tanto colore, poi le salse: guacamole, pico de gallo, sour cream e formaggio. Si arrotola stretto e si mangia con le mani.\nNel menu le fajitas sono per due, e sono sei: Tropico, del Sol, pollo, combo, pollo y vegetales e gambas.\nSalva il post per la prossima volta.", "#fajitas #cucinamessicana"),
     "Con chi le dividi? Taggalo 👇", id_riga="tropico-latino-20261206-1830-car",
     slide=[dict(modello="post-foto", foto="T63c", fy=60, titolo="Come si mangia <em>una fajita</em>", sotto="In quattro mosse. Sfoglia →", cont="1/6"),
            dict(modello="post-foto", foto="T63tortilla", titolo="1 · La tortilla calda", sotto="Una alla volta, dal suo contenitore", cont="2/6"),
            dict(modello="post-foto", foto="T63piastra", titolo="2 · Poca carne, tanto colore", sotto="Carne e peperoni dalla piastra", cont="3/6"),
            dict(modello="post-foto", foto="T63salse", titolo="3 · Le salse", sotto="Guacamole, pico de gallo, sour cream, formaggio", cont="4/6"),
            dict(modello="post-testo", colore="verde", titolo="4 · Arrotola<br>stretto", fs=118, sotto="E si mangia<br>con le mani.", foto="T64c", fx=35, cont="5/6"),
            dict(modello="post-testo", colore="giallo", titolo="Fajitas per 2:<br>sei nel menu", fs=100, sotto="Tropico, del Sol, pollo, combo, pollo y vegetales e gambas.<br><br>Prenota: 0523 335932", cont="6/6", piede=False)])
storia("2026-12-06", "19:00", **SF, foto="T63v", titolo="Fajitas per 2", sotto="Come si mangiano? È nel post di oggi", info=False)

# ---------- lunedì 7/12: chiuso ----------

# ---------- martedì 8/12 ----------
storia("2026-12-08", "13:00", modello="storia-testo", colore="nero", titolo="Martedì<br>si riparte", sotto="Aperitivo dalle 18:30<br>cucina dalle 19:00", foto="T32")
storia("2026-12-08", "20:00", **SF, foto="T27v", titolo="Il nostro nome,<br>nel piatto", sotto="Via Mazzini 77/A, dal 1992", info=False)

# ---------- mercoledì 9/12 (alle 18:30 c'è già la storia della cucina, approvata) ----------
storia("2026-12-09", "13:00", **SF, foto="T85v", titolo="Mercoledì<br>al bancone", sotto="Aperitivo dalle 18:30", info=False)
feed("reel", "2026-12-09", "19:15",
     didasc("Mercoledì sera, al bancone. 🍹\nIl mojito, la sangria e il margarita frozen. Nel menu li trovi anche in caraffa da un litro, da dividere al tavolo.\nAperitivo dalle 18:30, da martedì a domenica.", "#aperitivopiacenza #mojito #sangria"),
     "Mojito, sangria o frozen? 👇", copertina_t=1.0,
     scene=[dict(foto="T85v", d=2.2, lab="Mercoledì, al bancone", y=1330, z0=1.0, z1=1.10),
            dict(foto="T85v", d=1.8, lab="il mojito", y=1330, z0=1.22, z1=1.10),
            dict(foto="T87v", d=1.8, lab="la sangria", y=1330, z0=1.0, z1=1.12),
            dict(foto="T89v", d=2.0, lab="il margarita frozen", y=1330, z0=1.12, z1=1.0),
            dict(colore="giallo", d=2.2, lab="anche in caraffa<br>da un litro", y=820),
            dict(colore="nero", d=3.2, outro=["Aperitivo dalle 18:30", "0523 335932", "Da martedì a domenica"])])
storia("2026-12-09", "20:30", **SF, foto="D24v", titolo="Spazio<br>per il brownie?", sotto="Chiedi i dolci di stasera", info=False)

# ---------- giovedì 17/12: il post del burrito, rifatto ----------
feed("post", "2026-12-17", "18:30",
     didasc("Il burrito, col riso messicano accanto. 🌯\nNel menu ce ne sono cinque: il classico con carne e formaggio, de pollo, de verduras, del mar e de chile, l'unico piccante.\nTu quale scegli?", "#burrito #cucinamessicana"),
     "Il tuo burrito? Scrivilo qui sotto 👇", id_riga="tropico-latino-20261217-1830-v2",
     modello="post-foto", foto="T32", titolo="Il burrito, <em>col riso messicano</em>", sotto="Cucina dalle 19:00 · lunedì chiuso")

for x in P:
    d, o = x["data_ora"].split(" ")
    x["id"] = x.pop("id_riga", None) or "tropico-latino-" + d.replace("-", "") + "-" + o.replace(":", "")
P.sort(key=lambda x: x["data_ora"])
json.dump(P, open("piano.json", "w"), ensure_ascii=False, indent=1)
from collections import Counter
ids = Counter(x["id"] for x in P)
print(len(P), dict(Counter(x["tipo"] for x in P)), "doppioni:", [k for k, v in ids.items() if v > 1])
