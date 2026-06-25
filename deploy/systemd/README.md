# systemd timer — refresh do saldo de estoque

Agenda o `refresh-saldo` (recalcula `estoque_saldo`) 1x/dia às 03:00 no servidor de
produção, como alternativa ao crontab. Usa o wrapper [`backend/scripts/refresh-saldo.sh`](../../backend/scripts/refresh-saldo.sh).

## Pré-requisitos (no servidor)

```bash
cd /opt/integrador           # ajuste ao seu path real
git pull && cd backend
npm ci && npm run build      # o timer roda o dist compilado
./scripts/refresh-saldo.sh   # 1ª execução manual: cria a tabela e mede o tempo
```

## Instalação

1. Edite os 2 campos marcados no `refresh-saldo.service`: `User=` e o caminho
   absoluto em `ExecStart=`. Se o `node` for via nvm/fnm, descomente `Environment=NODE_BIN=...`.

2. Copie e ative:

```bash
sudo cp deploy/systemd/refresh-saldo.service /etc/systemd/system/
sudo cp deploy/systemd/refresh-saldo.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now refresh-saldo.timer
```

## Verificar

```bash
systemctl list-timers refresh-saldo.timer     # próximo disparo
sudo systemctl start refresh-saldo.service     # roda agora (teste)
journalctl -u refresh-saldo.service -n 50 -f   # acompanha o log
```

Sucesso = linha `✓ estoque_saldo recalculada: N linhas … em Xs` no journal e
status `inactive (dead)` com `code=exited, status=0/SUCCESS` (oneshot terminou OK).

## Alterar o horário

Edite `OnCalendar=` no `.timer` e rode `sudo systemctl daemon-reload && sudo systemctl restart refresh-saldo.timer`.
Exemplos: `OnCalendar=hourly`, `OnCalendar=*-*-* 02,14:00:00` (2x/dia).
