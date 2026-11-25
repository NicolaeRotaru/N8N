# Trasporto dei file verso «AD · Carica su Drive»: scrive i file (base64) nel nodo Prepara via API n8n,
# poi l'AD avvia il flusso con MCP; --leggi legge l'esito; --svuota rimette il segnaposto.
import sys, json, base64, subprocess, os, mimetypes
N8N = 'https://n8n-shdy.sliplane.app/api/v1'
WF = '6o75dipPqyQIojx2'
SEGNAPOSTO = "const FILE = []; // __FILE__ (lo riempie l'AD prima della corsa e lo svuota dopo)"
def api(metodo, percorso, corpo=None):
    args = ['curl', '-sS', '-m', '300', '-X', metodo, '-H', 'X-N8N-API-KEY: x', '-H', 'content-type: application/json']
    if corpo is not None:
        p = os.path.join(os.environ.get('LAVORO', os.getcwd()), '_corpo.json')
        open(p, 'w').write(json.dumps(corpo)); args += ['--data-binary', '@' + p]
    return json.loads(subprocess.run(args + [N8N + percorso], capture_output=True, text=True).stdout or '{}')
def scrivi(riga_file):
    w = api('GET', f'/workflows/{WF}')
    for n in w['nodes']:
        if n['name'] == 'Prepara':
            righe = n['parameters']['jsCode'].split('\n'); righe[0] = riga_file; n['parameters']['jsCode'] = '\n'.join(righe)
    r = api('PUT', f'/workflows/{WF}', {k: w[k] for k in ('name', 'nodes', 'connections', 'settings')})
    return r.get('id'), r.get('message', '')
if sys.argv[1] == '--svuota':
    print(scrivi(SEGNAPOSTO))
elif sys.argv[1] == '--leggi':
    d = api('GET', f'/executions/{sys.argv[2]}?includeData=true')
    print(d.get('status'), json.dumps(d['data']['resultData'].get('error'))[:300] if d['data']['resultData'].get('error') else '')
    for it in d['data']['resultData']['runData'].get('Carica il file', [{}])[0].get('data', {}).get('main', [[]])[0]:
        print(it['json'].get('id'), it['json'].get('name'))
else:
    file = [{'nome': os.path.basename(f), 'mime': mimetypes.guess_type(f)[0] or 'application/octet-stream',
             'b64': base64.b64encode(open(f, 'rb').read()).decode()} for f in sys.argv[1:]]
    riga = 'const FILE = ' + json.dumps(file) + '; // __FILE__ (lo riempie l\'AD prima della corsa e lo svuota dopo)'
    print(len(riga) // 1024, 'KB nel nodo;', scrivi(riga))
