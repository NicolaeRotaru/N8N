# Piano del Tropico dal 26/11 sera al 2/12. Ritmo concordato con la sessione che pubblica:
# 26-28/11 tre contenuti nel feed (12:15, 18:30, 19:15) e quattro storie; poi uno nel feed e tre storie.
# Fatti: piano di dicembre (orari, indirizzo, telefono fisso, dal 1992, due sale e oltre 100 posti) e menu del sito
# letto il 26/11 alle 15:55 (nomi, ingredienti, piccantezza, caraffe da 1 litro). Niente prezzi nelle grafiche.
import json
INDIR = "📍 Via Mazzini 77/A, Piacenza\n📞 Prenota: 0523 335932"
def didasc(testo, tag): return f"{testo}\n\n{INDIR}\n\n#eltropicolatino #piacenza {tag}"
P = []
def storia(data, ora, **k): P.append(dict(tipo="storia", formato="storia", data_ora=f"{data} {ora}", **k))
def feed(tipo, data, ora, didascalia, primo, **k): P.append(dict(tipo=tipo, data_ora=f"{data} {ora}", didascalia=didascalia, primo_commento=primo, **k))
def lato(sl): return dict(modello="post-testo", piede=False, **sl)

# ---------- giovedì 26/11 ----------
storia("2026-11-26", "19:00", modello="storia-foto", foto="0278", titolo="Aperitivo al bancone", sotto="Da martedì a domenica, dalle 18:30")
storia("2026-11-26", "21:30", modello="storia-testo", colore="nero", titolo="Si cena<br>fino alle 23", sotto="Venerdì e sabato fino alle 23:30", foto="0444")

# ---------- venerdì 27/11 ----------
feed("post", "2026-11-27", "12:15",
     didasc("Aperitivo al Tropico, dalle 18:30. 🍹\nDa martedì a domenica, al bancone sotto il pappagallo: margarita, sangria, mojito e frozen. Molti li facciamo anche in caraffa da un litro, per chi non è da solo.\nCi vediamo stasera?", "#aperitivopiacenza #margarita"),
     "Con chi vieni all'aperitivo? Taggalo 👇",
     modello="post-testo", colore="giallo", titolo="Aperitivo<br>dalle 18:30", fs=124, sotto="Da martedì a domenica,<br>al bancone.", foto="0278")
storia("2026-11-27", "13:00", modello="storia-testo", colore="giallo", titolo="Stasera<br>si esce?", sotto="Prenota il tavolo: 0523 335932", foto="0286", fx=55, rot=-4)
storia("2026-11-27", "18:00", modello="storia-foto", foto="0307", fy=55, titolo="Sangria in caraffa", sotto="Da un litro, da dividere al tavolo")
feed("carosello", "2026-11-27", "18:30",
     didasc("I nostri cinque burrito, uno per ogni fame. 🌯\nIl Burrito con carne e formaggio. Quello De pollo, De verduras (vegetariano), Del mar coi frutti di mare, e De chile, l'unico piccante dei cinque.\nSfoglia e dicci il tuo.", "#burrito #cucinamessicana"),
     "Il tuo burrito? Scrivilo qui sotto 👇",
     slide=[dict(modello="post-foto", foto="0449", hb=360, titolo="I nostri <em>5 burrito</em>", sotto="Sfoglia: uno per ogni fame →", cont="1/6"),
            lato(dict(colore="nero", titolo="Burrito", fs=130, sotto="Carne e formaggio, con crema di fagioli e riso messicano.", ys=560, cont="2/6")),
            lato(dict(colore="verde", titolo="Burrito<br>de pollo", fs=130, sotto="Formaggio e pollo sfilettato in salsa, con insalata mista.", ys=700, cont="3/6")),
            lato(dict(colore="giallo", titolo="Burrito<br>de verduras", fs=126, sotto="Verdure grigliate e formaggio, con guacamole e sour cream. Vegetariano.", ys=700, cont="4/6")),
            lato(dict(colore="verde", titolo="Burrito<br>del mar", fs=130, sotto="Frutti di mare e formaggio, con riso messicano e salsa ranchera.", ys=700, cont="5/6")),
            lato(dict(colore="nero", titolo="Burrito<br>de chile", fs=130, sotto="Chile con carne e formaggio, con riso messicano e sour cream. Piccante.", ys=700, cont="6/6"))])
feed("reel", "2026-11-27", "19:15",
     didasc("Il Tropico in cinque numeri. 🦜\n1992: l'anno in cui abbiamo aperto in via Mazzini.\nDue sale e oltre 100 posti, 5 burrito nel menu, 10 piatti alla griglia.\nIl sesto numero è quello per prenotare 👇", "#cucinamessicana #cenapiacenza"),
     "Quale numero ti ha sorpreso? 👇", copertina_t=1.2,
     scene=[dict(foto="0286", fx=55, d=2.3, num="1992", lab="in via Mazzini", z0=1.0, z1=1.12),
            dict(foto="0267", d=2.0, num="2", lab="sale", z0=1.15, z1=1.0),
            dict(foto="0278", d=2.0, num="100+", lab="posti a sedere", z0=1.0, z1=1.12),
            dict(foto="0449", d=2.0, num="5", lab="burrito nel menu", z0=1.12, z1=1.0),
            dict(foto="0431", d=2.0, num="10", lab="piatti alla griglia", z0=1.0, z1=1.14),
            dict(colore="nero", d=3.2, outro=["Prenota il tuo tavolo", "0523 335932", "Via Mazzini 77/A · Piacenza"])])
storia("2026-11-27", "20:30", modello="storia-testo", colore="nero", titolo="Cucina aperta<br>fino alle 23:30", sotto="Venerdì e sabato", foto="0405", fx=45)
storia("2026-11-27", "21:30", modello="storia-foto", foto="0267", titolo="Venerdì aperti<br>fino alle 2", sotto="Via Mazzini 77/A, Piacenza", info=False)

# ---------- sabato 28/11 ----------
feed("post", "2026-11-28", "12:15",
     didasc("Dal 1992 in via Mazzini 77/A. 🦜\nIl pappagallo sulla parete gialla, il bancone di legno, la cucina messicana e i cocktail. Da allora apriamo la porta tutte le sere tranne il lunedì.\nTu da quanto ci conosci?", "#ristorantepiacenza #cucinamessicana"),
     "Da quanto tempo vieni al Tropico? 👇",
     modello="post-foto", foto="0286", fx=55, titolo="Dal 1992 <em>in via Mazzini</em>", sotto="Aperitivo dalle 18:30 · cucina dalle 19:00 · lunedì chiuso")
storia("2026-11-28", "13:00", modello="storia-lista", titolo="Il sabato al Tropico",
       righe=[["Aperitivo", "18:30"], ["Cucina", "dalle 19:00"], ["Cucina", "fino alle 23:30"], ["Aperti", "fino alle 2"]])
storia("2026-11-28", "18:00", modello="storia-foto", foto="0330", fy=45, titolo="Sale sul bordo<br>o no?", sotto="Margarita classico o frozen: rispondi qui")
feed("carosello", "2026-11-28", "18:30",
     didasc("La serata al Tropico, in quattro tempi. 🌶️\nSi comincia al bancone con l'aperitivo, dalle 18:30. Poi un margarita o la sangria, anche in caraffa. Dalle 19:00 si accende la cucina, e per chi ha fame vera c'è la griglia: dieci piatti, dalla Barbacoa alla Parrilla per 2 o più.\nSfoglia e dicci da dove cominci.", "#aperitivopiacenza #cenapiacenza"),
     "Aperitivo, margarita, cucina o griglia? 👇",
     slide=[dict(modello="post-foto", foto="0286", fx=55, titolo="La serata al Tropico,<br><em>in 4 tempi</em>", sotto="Sfoglia →", cont="1/6"),
            dict(modello="post-foto", foto="0278", titolo="1 · L'aperitivo", sotto="Al bancone, dalle 18:30", cont="2/6"),
            dict(modello="post-foto", foto="0307", fy=62, titolo="2 · Margarita o sangria", sotto="Anche in caraffa da un litro", cont="3/6"),
            dict(modello="post-foto", foto="0430", fy=45, titolo="3 · Si accende la cucina", sotto="Dalle 19:00", cont="4/6"),
            dict(modello="post-foto", foto="0431", titolo="4 · A la grilla", sotto="Dieci piatti, dalla Barbacoa alla Parrilla per 2 o più", cont="5/6"),
            dict(modello="post-testo", colore="nero", titolo="E tu, da quale tempo cominci?", fs=104, sotto="Prenota il tavolo:<br>0523 335932", foto="0267", cont="6/6", piede=False)])
feed("reel", "2026-11-28", "19:15",
     didasc("Siete in tanti? Ordinate la caraffa. 🍹\nSangria, margarita, frozen, mojito e gli altri pestati: nel menu li trovi anche in caraffa da un litro, da dividere al tavolo.\nPer la tavolata del weekend conviene prenotare.", "#aperitivopiacenza #sangria #margarita"),
     "Con chi la dividi la caraffa? Taggali 👇", copertina_t=1.4,
     scene=[dict(foto="0307", fy=55, d=2.4, lab="Siete in tanti?", y=1000, z0=1.0, z1=1.12),
            dict(foto="0307", fy=40, d=2.0, lab="La sangria", y=1000, z0=1.3, z1=1.15),
            dict(foto="0330", fy=45, d=2.0, lab="il margarita", y=1000, z0=1.0, z1=1.12),
            dict(colore="verde", d=2.0, lab="il mojito,<br>il frozen…", y=820),
            dict(colore="giallo", d=2.3, lab="anche in caraffa<br>da un litro", y=820),
            dict(colore="nero", d=3.2, outro=["La tavolata la prenoti qui", "0523 335932", "Via Mazzini 77/A · Piacenza"])])
storia("2026-11-28", "20:00", modello="storia-lista", titolo="Quanto sei piccante?",
       righe=[["Burrito de chile", "piccante"], ["Chile con carne", "piccante"], ["Camarones a la diabla", "piccante"], ["Cheviche", "molto piccante"]],
       sotto="Nel menu è segnato accanto a ogni piatto")
storia("2026-11-28", "21:30", modello="storia-foto", foto="0405", fx=40, titolo="La cucina<br>è aperta", sotto="Stasera fino alle 23:30")

# ---------- domenica 29/11 ----------
storia("2026-11-29", "12:30", modello="storia-foto", foto="0444", titolo="Un po' di tutto", sotto="Per quando non sai scegliere")
storia("2026-11-29", "18:00", modello="storia-testo", colore="verde", titolo="Domenica<br>siamo aperti", sotto="Aperitivo dalle 18:30<br>cucina dalle 19 alle 23", foto="0399", fx=45)
feed("post", "2026-11-29", "18:30",
     didasc("Fajitas per 2: arrivano su una griglia fumante. 🔥\nCon peperoncino, pico de gallo, guacamole, sour cream, formaggio e tortillas di farina. Nel menu ce ne sono sei: Tropico (maiale con ananas e banane), del Sol, pollo, combo, pollo y vegetales e gambas.\nVoi quale dividete?", "#fajitas #cucinamessicana"),
     "Quale fajitas dividete? 👇",
     modello="post-testo", colore="nero", titolo="Fajitas per 2", fs=118, sotto="Arrivano su una griglia fumante.", ys=470, piede=True,
     righe=[["1", "Tropico"], ["2", "Del sol"], ["3", "Pollo"], ["4", "Combo"], ["5", "Pollo y vegetales"], ["6", "Gambas"]], yl=560)
storia("2026-11-29", "21:30", modello="storia-foto", foto="0286", fx=55, titolo="Bienvenidos!", sotto="In via Mazzini dal 1992")

# ---------- lunedì 30/11 (chiuso) ----------
storia("2026-11-30", "12:30", modello="storia-testo", colore="nero", titolo="Oggi<br>riposiamo", sotto="Ci vediamo domani dalle 18:30", foto="0292", fy=40)
storia("2026-11-30", "17:30", modello="storia-lista", titolo="I nostri burrito",
       righe=[["Burrito", ""], ["De pollo", ""], ["De verduras", "vegetariano"], ["Del mar", ""], ["De chile", "piccante"]], sotto="Da domani, dalle 19:00")
feed("post", "2026-11-30", "18:30",
     didasc("Il lunedì il Tropico riposa. 💤\nDa martedì si riparte: aperitivo al bancone dalle 18:30 e cucina dalle 19:00.\nSe stai già pensando al weekend, a dicembre conviene prenotare.", "#cenapiacenza"),
     "Cosa ordini martedì? 👇",
     modello="post-testo", colore="verde", titolo="Lunedì chiuso.<br>Martedì si riparte.", fs=100,
     sotto="Aperitivo dalle 18:30,<br>cucina dalle 19:00.", foto="0267")

# ---------- martedì 1/12 ----------
storia("2026-12-01", "12:30", modello="storia-testo", colore="giallo", titolo="Dicembre<br>al Tropico", sotto="A dicembre conviene prenotare:<br>0523 335932", foto="0278", rot=-3)
feed("reel", "2026-12-01", "19:15",
     didasc("A la grilla: dieci piatti. 🔥\nNel menu si va dalla Barbacoa alla Parrilla per 2 o più, passando per i filetti e i Tacos al carbon.\nCucina aperta dalle 19:00 alle 23:00, venerdì e sabato fino alle 23:30. Lunedì chiuso.", "#grigliata #cenapiacenza"),
     "Barbacoa o Parrilla? 👇", copertina_t=3.3,
     scene=[dict(foto="0430", fy=45, d=2.4, lab="Dalla nostra cucina", y=820, z0=1.0, z1=1.1),
            dict(foto="0431", d=2.3, num="10", lab="piatti dalla griglia", z0=1.0, z1=1.15),
            dict(foto="0431", fx=62, d=2.3, lab="dalla Barbacoa<br>alla Parrilla per 2 o più", y=1050, z0=1.35, z1=1.2),
            dict(foto="0399", fx=45, d=2.0, lab="Cucina dalle 19:00", y=1050, z0=1.12, z1=1.0),
            dict(colore="verde", d=3.2, outro=["A dicembre conviene prenotare", "0523 335932", "Via Mazzini 77/A · Piacenza"])])
storia("2026-12-01", "19:45", modello="storia-foto", foto="0430", fy=45, titolo="Si accende<br>la cucina", sotto="Dalle 19:00 alle 23:00")
storia("2026-12-01", "21:30", modello="storia-foto", foto="0437", fx=40, titolo="Da dividere?", sotto="Meglio ordinarne due")

# ---------- mercoledì 2/12 ----------
storia("2026-12-02", "12:30", modello="storia-testo", colore="verde", titolo="Serata<br>libera?", sotto="Prenota il tavolo: 0523 335932", foto="0449")
storia("2026-12-02", "18:00", modello="storia-foto", foto="0292", fy=55, titolo="Al bancone<br>dalle 18:30", sotto="Da martedì a domenica")
feed("carosello", "2026-12-02", "18:30",
     didasc("Bienvenidos al Tropico. 🦜\nSiamo in via Mazzini 77/A dal 1992: il pappagallo sulla parete gialla, il bancone di legno, le bottiglie in fila. Due sale e oltre 100 posti, per la cena in due e per la tavolata.\nSfoglia e vieni a trovarci.", "#ristorantepiacenza #cucinamessicana"),
     "Ci sei già stato? Raccontaci la tua serata 👇",
     slide=[dict(modello="post-foto", foto="0286", fx=55, titolo="Bienvenidos <em>al Tropico</em>", sotto="Via Mazzini 77/A, dal 1992", cont="1/5"),
            dict(modello="post-foto", foto="0267", titolo="Il bancone", sotto="Dove comincia la serata", cont="2/5"),
            dict(modello="post-foto", foto="0278", titolo="Le bottiglie in fila", sotto="Aperitivo dalle 18:30, da martedì a domenica", cont="3/5"),
            dict(modello="post-testo", colore="nero", titolo="Due sale,<br>oltre 100 posti", fs=110, sotto="Per la cena in due<br>e per la tavolata.", foto="0405", fx=45, cont="4/5"),
            dict(modello="post-testo", colore="giallo", titolo="Prenota il tuo tavolo", fs=110, sotto="0523 335932<br>Lunedì chiuso", foto="0292", cont="5/5", piede=False)])
storia("2026-12-02", "21:30", modello="storia-testo", colore="bianco", titolo="E per finire?", sotto="Churros, brownie, e la mousse al cioccolato e peperoncino")

for x in P:
    d, o = x["data_ora"].split(" ")
    x["id"] = "tropico-latino-" + d.replace("-", "") + "-" + o.replace(":", "")
P.sort(key=lambda x: x["data_ora"])
json.dump(P, open("piano.json", "w"), ensure_ascii=False, indent=1)
from collections import Counter
ids = Counter(x["id"] for x in P)
print(len(P), dict(Counter(x["tipo"] for x in P)), "doppioni:", [k for k, v in ids.items() if v > 1])
