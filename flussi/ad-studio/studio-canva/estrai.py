# Estrae le immagini base64 da uno o più risultati di «AD · Leggi materiale» salvati in file (strumento MCP di n8n:
# get_workflow_execution con includeData e nodeNames ["In base64"]; un risultato grosso finisce da solo in un file).
# Uso: python3 -I estrai.py <cartella-di-arrivo> <risultato1.txt> [<risultato2.txt> ...]
import json, sys, base64, os
out = sys.argv[1]
n = 0
for f in sys.argv[2:]:
    d = json.load(open(f))
    for r in d['data']['resultData']['runData'].get('In base64', []):
        for it in r['data']['main'][0]:
            j = it['json']
            nome = os.path.basename(j['name'])
            open(os.path.join(out, nome), 'wb').write(base64.b64decode(j['b64'])); n += 1
print(n, 'file salvati in', out)
