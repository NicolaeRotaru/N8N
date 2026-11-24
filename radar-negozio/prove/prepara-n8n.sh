#!/bin/sh
# Installa in prove/.n8n la stessa versione di n8n usata per le prove, con Node 24 (n8n 2.x lo richiede).
# Serve solo per lanciare prove/prova-n8n.mjs. Circa 1 GB e 3-4 minuti.
set -eu
CARTELLA="$(cd "$(dirname "$0")" && pwd)/.n8n"
mkdir -p "$CARTELLA"
cd "$CARTELLA"
[ -f package.json ] || npm init -y >/dev/null
npm install --no-audit --no-fund node@24 n8n@2.49.5
echo "Pronto: N8N_DIR=$CARTELLA"
