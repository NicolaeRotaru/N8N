#!/bin/sh
# Avvio del container: se parte come root (succede quando il volume /dati arriva di proprietà di root),
# rende /dati scrivibile per l'utente "node" e poi lancia il servizio come "node". Il servizio non gira mai da root.
set -eu
DATI="${DATI_DIR:-/dati}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATI"
  chown -R node:node "$DATI"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
