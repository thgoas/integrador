#!/usr/bin/env bash
#
# Refresh diário das tabelas materializadas de estoque — destinado ao cron/systemd.
# Roda os dois recálculos que alimentam os endpoints de custo:
#   1. estoque_saldo      → GET /api/estoque/custo-atual  (SUM(qtde) por empresa,loja,produto)
#   2. custo_medio_produto → GET /api/estoque/custo-medio  (média móvel ponderada das compras)
#
# O diretório do backend é resolvido a partir da localização deste script, então
# funciona em qualquer host sem hardcode de caminho. Roda o `dist` já compilado
# (faça `npm run build` no deploy) — este wrapper NÃO compila.
#
# Cron NÃO herda seu PATH interativo: se o `node` estiver instalado via nvm/fnm, o
# binário pode não estar no PATH do cron. Nesse caso defina NODE_BIN com o caminho
# absoluto (descubra no servidor com `which node`) — direto na linha do crontab:
#   NODE_BIN=/home/app/.nvm/versions/node/v22.x/bin/node /caminho/refresh-saldo.sh
#
set -euo pipefail

NODE_BIN="${NODE_BIN:-node}"

# backend/scripts/refresh-saldo.sh → BACKEND_DIR = backend/
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

echo "[$(date '+%F %T')] refresh: iniciando (dir: $BACKEND_DIR, node: $("$NODE_BIN" -v))"
echo "[$(date '+%F %T')] refresh: estoque_saldo ..."
"$NODE_BIN" --env-file=.env dist/scripts/refresh-estoque-saldo.js
echo "[$(date '+%F %T')] refresh: custo_medio_produto ..."
"$NODE_BIN" --env-file=.env dist/scripts/refresh-custo-medio.js
echo "[$(date '+%F %T')] refresh: concluído"
