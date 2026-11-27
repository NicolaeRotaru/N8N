#!/usr/bin/env bash
# Prepara la cartella di lavoro di un cliente: impaginazioni, file del cliente, caratteri, musica.
# Uso: bash prepara.sh <cliente> <cartella-di-lavoro>     es.: bash prepara.sh tropico-latino /tmp/lavoro/tropico
# Dopo: foto in <cartella>/hd/, logo in <cartella>/logo.png (passo 2 della PROCEDURA), piano in <cartella>/piano.json.
set -euo pipefail
QUI="$(cd "$(dirname "$0")" && pwd)"
CLIENTE="$1"; W="$2"
[ -f "$QUI/clienti/$CLIENTE.json" ] || { echo "Manca clienti/$CLIENTE.json: copialo da clienti/tropico-latino.json e riempilo (PROCEDURA, passo 1)"; exit 1; }
mkdir -p "$W/font" "$W/hd" "$W/uscita"
cp "$QUI/studio.html" "$QUI/rendi.mjs" "$QUI/consegna.py" "$W/"
cp "$QUI/clienti/$CLIENTE.json" "$W/cliente.json"
# caratteri: quelli scritti in cliente.json, presi dall'officina se ci sono
python3 - "$W" "$QUI/../../../officina/font" <<'EOF'
import json, os, shutil, sys
w, officina = sys.argv[1], sys.argv[2]
c = json.load(open(f'{w}/cliente.json'))
mancano = []
for f in c['font']['titoli'] + c['font']['testo']:
    nome = os.path.basename(f['file'])
    if os.path.exists(f'{officina}/{nome}'): shutil.copy(f'{officina}/{nome}', f'{w}/font/{nome}')
    elif not os.path.exists(f"{w}/{f['file']}"): mancano.append(nome)
print('caratteri mancanti:', ', '.join(mancano) if mancano else 'nessuno')
EOF
( cd "$W" && python3 "$QUI/../strumenti/musica.py" >/dev/null && echo "musica.wav pronta" )
echo "Cartella pronta: $W"
