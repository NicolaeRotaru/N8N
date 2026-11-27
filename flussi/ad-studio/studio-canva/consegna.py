# Consegna dei contenuti di un cliente nel giro dell'agenzia, coi flussi esistenti dell'AD.
#   python3 consegna.py comprimi            -> rifà con crf 25 i video sopra i 4 MB
#   python3 consegna.py lotti               -> divide i file in lotti sotto il limite e li elenca
#   python3 consegna.py prepara <n>         -> scrive il lotto n nel nodo «Prepara» di «AD · Carica su Drive»
#   python3 consegna.py leggi <esecuzione>  -> legge l'esito del caricamento e salva gli ID in drive.json
#   python3 consegna.py svuota              -> rimette il segnaposto nel nodo
#   python3 consegna.py righe               -> scrive proposte.json: il corpo per «AD · Proponi nel Calendario», uno per contenuto,
#                                              e riepilogo.json: il corpo dell'ultima chiamata, l'elenco col tasto «Approva tutti»
import sys, json, os, re, base64, subprocess, mimetypes
D = os.path.dirname(os.path.abspath(__file__)); OUT = f'{D}/uscita'
N8N = 'https://n8n-shdy.sliplane.app/api/v1'; WF = '6o75dipPqyQIojx2'
SEGNAPOSTO = "const FILE = []; // __FILE__ (lo riempie l'AD prima della corsa e lo svuota dopo)"
LIMITE = 9 * 1024 * 1024
piano = json.load(open(f'{D}/piano.json'))
_cliente = json.load(open(f'{D}/cliente.json'))
CLIENTE = _cliente['id']
NOME = _cliente.get('nome') or CLIENTE
# un id già occupato nel Calendario si cambia nel piano col campo «id_riga»
ID_RIGA = {p['id']: p.get('id_riga', p['id']) for p in piano}

def file_di(p):
    if p['tipo'] == 'storia': return [p['id'] + '.mp4']
    if p['tipo'] == 'post': return [p['id'] + '.jpg']
    if p['tipo'] == 'reel': return [p['id'] + '.mp4', p['id'] + '-copertina.jpg']
    return [f"{p['id']}-{i + 1}.jpg" for i in range(len(p['slide']))]

def api(metodo, percorso, corpo=None):
    args = ['curl', '-sS', '-m', '600', '-X', metodo, '-H', 'X-N8N-API-KEY: x', '-H', 'content-type: application/json']
    if corpo is not None:
        open(f'{D}/_corpo.json', 'w').write(json.dumps(corpo)); args += ['--data-binary', f'@{D}/_corpo.json']
    r = subprocess.run(args + [N8N + percorso], capture_output=True, text=True)
    return json.loads(r.stdout or '{}')

def lotti():
    tutti = [f for p in piano for f in file_di(p)]
    gruppi, cur, tot = [], [], 0
    for f in tutti:
        s = os.path.getsize(f'{OUT}/{f}')
        if cur and tot + s > LIMITE: gruppi.append(cur); cur, tot = [], 0
        cur.append(f); tot += s
    if cur: gruppi.append(cur)
    return gruppi

def scrivi(riga_file):
    w = api('GET', f'/workflows/{WF}')
    for n in w['nodes']:
        if n['name'] == 'Prepara':
            righe = n['parameters']['jsCode'].split('\n'); righe[0] = riga_file; n['parameters']['jsCode'] = '\n'.join(righe)
    r = api('PUT', f'/workflows/{WF}', {k: w[k] for k in ('name', 'nodes', 'connections', 'settings')})
    return r.get('id'), r.get('message', '')

cmd = sys.argv[1]
if cmd == 'comprimi':
    for f in sorted(os.listdir(OUT)):
        q = f'{OUT}/{f}'
        if f.endswith('.mp4') and os.path.getsize(q) > 4_000_000:
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', q, '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '25', '-preset', 'slow', '-maxrate', '6M', '-bufsize', '12M', '-c:a', 'copy', '-movflags', '+faststart', f'{OUT}/_tmp.mp4'], check=True)
            os.replace(f'{OUT}/_tmp.mp4', q); print(f, '->', os.path.getsize(q))
elif cmd == 'lotti':
    g = lotti()
    for i, x in enumerate(g): print(i, len(x), round(sum(os.path.getsize(f'{OUT}/{f}') for f in x) / 1e6, 1), 'MB')
elif cmd == 'prepara':
    x = lotti()[int(sys.argv[2])]
    file = [{'nome': f, 'mime': mimetypes.guess_type(f)[0], 'b64': base64.b64encode(open(f'{OUT}/{f}', 'rb').read()).decode()} for f in x]
    print(len(x), 'file;', scrivi('const FILE = ' + json.dumps(file) + "; // __FILE__ (lo riempie l'AD prima della corsa e lo svuota dopo)"))
elif cmd == 'svuota':
    print(scrivi(SEGNAPOSTO))
elif cmd == 'leggi':
    d = api('GET', f'/executions/{sys.argv[2]}?includeData=true')
    err = d['data']['resultData'].get('error')
    print(d.get('status'), json.dumps(err)[:300] if err else '')
    reg = json.load(open(f'{D}/drive.json')) if os.path.exists(f'{D}/drive.json') else {}
    for it in d['data']['resultData']['runData'].get('Carica il file', [{}])[0].get('data', {}).get('main', [[]])[0]:
        reg[it['json']['name']] = it['json']['id']
    json.dump(reg, open(f'{D}/drive.json', 'w'), indent=1); print(len(reg), 'file su Drive in tutto')
elif cmd == 'righe':
    reg = json.load(open(f'{D}/drive.json'))
    link = lambda f: f'https://drive.google.com/file/d/{reg[f]}/view'
    import datetime, zoneinfo
    # Il gruppo di questa consegna: va nelle note di ogni riga e lo legge il tasto «Approva tutti» (massimo 40 caratteri).
    LOTTO = re.sub('[^a-z0-9-]', '-', CLIENTE.lower())[:29].strip('-') + datetime.datetime.now(zoneinfo.ZoneInfo('Europe/Rome')).strftime('-%m%d-%H%M')
    out = []
    for p in piano:
        adesso = datetime.datetime.now(zoneinfo.ZoneInfo('Europe/Rome')).strftime('%Y-%m-%d %H:%M')
        if p['data_ora'] <= adesso: continue  # già scaduto: non si propone
        fs = file_di(p)
        media = ' | '.join(link(f) for f in fs if not f.endswith('-copertina.jpg'))
        chiave = {'storia': 'storia', 'post': 'post', 'carosello': 'carosello', 'reel': 'reel'}[p['tipo']]
        riga = {'id': ID_RIGA[p['id']], 'cliente': CLIENTE, 'tipo': p['tipo'], 'piattaforme': 'ig+fb', 'data_ora': p['data_ora'],
                'didascalia': p.get('didascalia', ''), 'primo_commento': p.get('primo_commento', ''), 'media': media,
                'copertina': link(p['id'] + '-copertina.jpg') if p['tipo'] == 'reel' else '',
                'note': f"[AD 26/11 · {chiave} {p['data_ora'][5:]}] proposta dell'AD (piano Max), impaginazioni Canva e reel · SALTA CONTROLLO AI"}
        anteprima = {'file_id': reg[fs[0]], 'tipo': 'video' if fs[0].endswith('.mp4') else 'foto'}
        g = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
        import datetime
        dt = datetime.datetime.strptime(p['data_ora'], '%Y-%m-%d %H:%M')
        quando = f"{g[dt.weekday()]} {dt.day}/{dt.month} alle {p['data_ora'][11:]}"
        if p['tipo'] == 'storia':
            tel = f"{CLIENTE} · storia animata · {quando}"
        else:
            tel = f"{CLIENTE} · {p['tipo']} · {quando}\n\n{p['didascalia']}"[:1000]
        if p['tipo'] == 'carosello': tel = (f"{CLIENTE} · carosello di {len(fs)} immagini (qui la prima) · {quando}\n\n" + p['didascalia'])[:1000]
        out.append({'riga': riga, 'anteprima': anteprima, 'didascalia_telegram': tel, 'lotto': LOTTO,
                    'messaggio': f"Approvi questo contenuto per {quando}? Esce su Instagram e Facebook all'ora scritta."})
    json.dump(out, open(f'{D}/proposte.json', 'w'), ensure_ascii=False, indent=1); print(len(out), 'proposte pronte, gruppo', LOTTO)
    json.dump({'riepilogo': {'lotto': LOTTO, 'nome': NOME}}, open(f'{D}/riepilogo.json', 'w'), ensure_ascii=False, indent=1)
