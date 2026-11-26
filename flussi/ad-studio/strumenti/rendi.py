# Strumento dell'AD: si copia nella cartella di lavoro (con sorgenti/, originali/, piano.json, logo-contorno.png) e si lancia da lì.
# Produce post, storie e reel del Tropico con l'officina locale (stesso codice della produzione).
import json, subprocess, os, sys, urllib.request, uuid
S = os.path.dirname(os.path.abspath(__file__))
SRC, OUT, CLIP = f'{S}/originali', f'{S}/uscita', f'{S}/clip'
os.makedirs(OUT, exist_ok=True); os.makedirs(CLIP, exist_ok=True)
CHIAVE = open(f'{S}/officina-chiave.txt').read().strip()
BASE = 'http://127.0.0.1:8099'
MARCHIO = {"colori": {"primario": "#D61D73", "secondario": "#3D7C2B", "testo": "#FFFFFF"}, "font": "Roboto Slab", "peso_titolo": 800, "font_testo": "Archivo"}
STILE = {"luminosita": 1.0, "contrasto": 1.05, "saturazione": 1.08, "calore": 0.02}
LOGO = f'{S}/logo-contorno.png'
piano = json.load(open(f'{S}/piano.json'))
solo = sys.argv[1:]

def chiama(percorso, dati, files):
    args = ['curl', '-sS', '-m', '900', '-H', f'X-Officina-Chiave: {CHIAVE}', '-F', 'dati=' + json.dumps(dati, ensure_ascii=False)]
    for campo, f in files: args += ['-F', f'{campo}=@{f}']
    r = subprocess.run(args + [BASE + percorso], capture_output=True, text=True)
    j = json.loads(r.stdout)
    if 'errore' in j: raise SystemExit(f'{percorso}: {j}')
    return j

def scarica(url, dest):
    subprocess.run(['curl', '-sS', '-H', f'X-Officina-Chiave: {CHIAVE}', '-o', dest, url], check=True)

def clip_da_foto(foto, durata, nome):
    # Verticali: zoom lento 1.00 -> 1.06. Orizzontali: finestra 9:16 a tutta altezza che scorre sul piatto (dal 30% al 70%).
    # Uscita sempre 1080x1920 a 30 fps: niente sfondo sfocato, la foto riempie lo schermo.
    w, h = map(int, subprocess.check_output(['identify', '-format', '%w %h', f'{SRC}/{foto}']).split())
    n = int(round(durata * 30))
    dest = f'{CLIP}/{nome}.mp4'
    if h > w:
        vf = ("scale=3240:5760:force_original_aspect_ratio=increase,crop=3240:5760,"
              f"zoompan=z='1+0.06*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1080x1920:fps=30,format=yuv420p")
        ingresso = ['-loop', '1', '-i', f'{SRC}/{foto}']
    else:
        D = max(durata, 0.1)
        vf = (f"scale=-2:2112,crop=1188:2112:x='(iw-ow)*(0.30+0.40*t/{D:.3f})':y=0,scale=1080:1920,format=yuv420p")
        ingresso = ['-loop', '1', '-framerate', '30', '-i', f'{SRC}/{foto}']
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *ingresso, '-vf', vf, '-frames:v', str(n),
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-r', '30', dest], check=True)
    return dest

for p in piano['pezzi']:
    k = p['chiave']
    if solo and k not in solo: continue
    if p['tipo'] in ('post', 'carosello'):
        for i, foto in enumerate(p['foto'], 1):
            j = chiama('/foto/prepara', {"formati": ["4:5"], "stile": STILE}, [('foto', f'{SRC}/{foto}')])
            f = next(x for x in j['file'] if x['formato'] == '4:5')
            dest = f'{OUT}/{k}-{i}.jpg' if p['tipo'] == 'carosello' else f'{OUT}/{k}.jpg'
            scarica(f['url'], dest); print(k, '->', os.path.basename(dest), f['larghezza'], f['altezza'], j.get('avvisi'))
    elif p['tipo'] == 'storia':
        dati = dict(MARCHIO, modello=p.get('modello', 'titolo'), righe=p['righe'], stile=STILE)
        j = chiama('/grafica/storia', dati, [('foto', f"{SRC}/{p['foto'][0]}"), ('logo', LOGO)])
        scarica(j['file'][0]['url'], f'{OUT}/{k}.jpg'); print(k, '-> storia', j.get('avvisi'))
    elif p['tipo'] == 'reel':
        clips = [clip_da_foto(foto, d, f'{k}-{i:02d}') for i, (foto, d) in enumerate(p['sequenza'])]
        dati = dict(MARCHIO, intro={'testo': p['intro']}, outro={'testo': p['outro']}, durata_max=60)
        files = [('clip', c) for c in clips] + [('logo', LOGO)]
        if os.path.exists(f'{S}/musica.wav'): files.append(('musica', f'{S}/musica.wav')); dati['volume_musica'] = 0.8
        j = chiama('/video/reel', dati, files)
        for f in j['file']:
            est = {'video': 'mp4', 'copertina': 'jpg', 'fotogrammi': 'jpg'}[f['tipo']]
            dest = f'{OUT}/{k}.mp4' if f['tipo'] == 'video' else f'{OUT}/{k}-{f["tipo"]}.{est}'
            scarica(f['url'], dest)
        print(k, '-> reel', [(f['tipo'], f.get('durata')) for f in j['file']], j.get('avvisi'))
