# Controllo: nessun nome di piatto o di drink scritto SOPRA una foto, se quella foto non è confermata.
# Nato il 27/11/2026: la storia del Tropico delle 18:00 ha scritto «Sangria in caraffa» sopra la foto 0307,
# che è un margarita frozen alla fragola (correzione di Nicola, 21:48). Era uscita su quattro pagine.
# Uso: python3 controlla-nomi.py piano.json cliente.json   -> esce con 1 e l'elenco dei pezzi da correggere.
# Si lancia dopo il piano e prima di rendi.mjs (PROCEDURA, passo 4).
import json, re, sys
piano = json.load(open(sys.argv[1])); cliente = json.load(open(sys.argv[2]))
confermate = {k: v for k, v in cliente.get('foto_confermate', {}).items() if not k.startswith('_')}
e_ = lambda f: str(confermate.get(f, {}).get('è', '')).lower()
non_e = lambda f: [n.lower() for n in confermate.get(f, {}).get('non_è', [])]
nomi = [n.lower() for n in cliente.get('nomi_da_confermare', [])]
pulisci = lambda s: re.sub(r'<[^>]+>', ' ', str(s or '')).lower()
problemi = []
for pezzo in piano:
    parti = pezzo.get('slide') or pezzo.get('scene') or [pezzo]
    for i, parte in enumerate(parti):
        foto = str(parte.get('foto') or '')
        if not foto: continue
        testo = ' '.join(pulisci(parte.get(c)) for c in ('titolo', 'sotto', 'lab', 'num'))
        for nome in nomi:
            if nome not in testo: continue
            if nome in non_e(foto):
                problemi.append(f"{pezzo['id']} parte {i + 1}: scrive «{nome}» sopra la foto {foto}, che NON è {nome}: è {e_(foto)}")
            elif nome not in e_(foto):
                problemi.append(f"{pezzo['id']} parte {i + 1}: scrive «{nome}» sopra la foto {foto} ({e_(foto) or 'foto non confermata'})")
for p in problemi: print('FERMO ·', p)
print(f"{len(problemi)} nomi sopra foto non confermate" if problemi else 'ok: nessun nome sopra una foto non confermata')
sys.exit(1 if problemi else 0)
