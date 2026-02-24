# Operacao e Deploy

## Objetivo

Descrever como subir, atualizar e operar o sistema com seguranca (sem seed automatica em producao).

## 1. Requisitos

- Node.js (versao compativel com o projeto)
- npm
- PostgreSQL (local ou container)
- Docker / Docker Compose (opcional, recomendado para ambiente local)

## 2. Variaveis de ambiente (minimas)

Exemplo:

```env
DATABASE_URL="postgresql://display-quest:display-quest123@localhost:5432/display-quest"
NEXTAUTH_SECRET="troque-isto"
NEXTAUTH_URL="http://localhost:3000"
```

## 3. Subida local (sem Docker)

```bash
npm install
npm run db:generate
npm run db:migrate:dev
npm run dev
```

### Seed (apenas dev/teste)

```bash
npm run db:seed
```

Importante:

- seed e manual
- seed nao deve ser executada automaticamente em producao

## 4. Subida local com Docker

```bash
docker-compose up -d
docker-compose ps
docker-compose logs -f
```

Fluxo atual do `docker-compose.yml`:

- sobe Postgres
- aguarda healthcheck
- roda `prisma migrate deploy`
- inicia aplicacao

Nao executa seed automaticamente.

## 5. Deploy de banco (caminho seguro)

Comando:

```bash
npm run db:safe-deploy
```

O script:

- aplica `prisma migrate deploy`
- opcionalmente cria backup (se flag habilitada)
- nao executa seed

Flags suportadas:

- `BACKUP_BEFORE_MIGRATE=1`
- `BACKUP_DIR=./backups`

## 6. Prisma: fluxo recomendado

- desenvolvimento: `prisma migrate dev`
- producao: `prisma migrate deploy`
- evitar `prisma db push` como fluxo padrao de producao

Obs.: `db push` pode ser util em ambiente local de desenvolvimento/ajuste rapido, mas nao substitui migrations versionadas.

## 7. Troubleshooting (operacao)

### Erro: `DATABASE_URL` nao definida

- configure `.env.local` (dev)
- ou exporte a variavel na shell antes do comando

### Erro: tabela nao existe (Prisma P2021)

- schema local e banco estao dessincronizados
- rode migrations (`db:migrate:dev` ou `db:migrate:deploy`)
- em dev, `prisma db push` pode ser usado para alinhar rapidamente

### Erro de login com usuario pendente

- usuario precisa estar `active`
- aprovar via fluxo administrativo/CLI

### App sobe mas dados estao vazios

- seed e manual (nao automatica)
- rode `npm run db:seed` somente em dev/teste

## 8. Checklist de deploy (resumo)

1. Backup (se aplicavel)
2. `npm ci` / build
3. `npm run db:migrate:deploy`
4. Subir app
5. Verificar health/logs
6. Validar login e rotas criticas
