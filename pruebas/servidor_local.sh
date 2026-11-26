#!/bin/sh
# Arranca `wrangler dev` desde una copia del proyecto en /tmp para que las escrituras
# (git, registros de pruebas, capturas) no reinicien el servidor a mitad de una prueba.
# Uso: sh pruebas/servidor_local.sh [puerto]   → detener: kill $(cat /tmp/ultima-noche-dev.pid)
PUERTO=${1:-8787}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
COPIA=/tmp/ultima-noche-dev
PIDF=/tmp/ultima-noche-dev.pid
[ -f "$PIDF" ] && kill $(cat "$PIDF") 2>/dev/null && sleep 1
rm -rf "$COPIA" && mkdir -p "$COPIA"
(cd "$RAIZ" && tar cf - --exclude=./.git --exclude=./.superpowers --exclude=./.wrangler --exclude=./node_modules --exclude=./pruebas/capturas .) | (cd "$COPIA" && tar xf -)
ln -sfn "$RAIZ/node_modules" "$COPIA/node_modules"
: > /tmp/wrangler-dev.log
cd "$COPIA" && WRANGLER_SEND_METRICS=false nohup npx wrangler dev --port "$PUERTO" --ip 127.0.0.1 > /tmp/wrangler-dev.log 2>&1 &
echo $! > "$PIDF"
i=0; while [ $i -lt 60 ]; do
  grep -q "Ready on" /tmp/wrangler-dev.log 2>/dev/null && { echo "listo en http://127.0.0.1:$PUERTO"; exit 0; }
  sleep 1; i=$((i+1))
done
echo "wrangler dev no arrancó; ver /tmp/wrangler-dev.log"; exit 1
