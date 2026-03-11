# Operacao e Deploy

## Objetivo

Registrar o procedimento atual para subir, atualizar e operar o sistema em ambiente local ou containerizado, mantendo o uso de migrations versionadas e evitando seed automatica fora de cenarios de desenvolvimento.

## 1. Escopo atual

O projeto hoje esta preparado principalmente para:

- execucao local com Node.js e PostgreSQL
- execucao local com Docker Compose
- aplicacao de migrations versionadas com Prisma

Observacao:

- o uso principal previsto ate aqui é em ambiente local ou rede interna do laboratorio
- este documento nao presume uma esteira completa de producao com observabilidade, rollback automatizado ou orquestracao externa (CI/CD)

## 2. Requisitos

- Node.js em versao compativel com o projeto
- npm
- PostgreSQL local ou via container
- Docker e Docker Compose, quando a opcao for usar containers

## 3. Variaveis de ambiente minimas

Exemplo funcional:

```env
DATABASE_URL="postgresql://display-quest:display-quest123@localhost:5432/display-quest"
NEXTAUTH_SECRET="troque-isto"
NEXTAUTH_URL="http://localhost:3000"
```

Observacoes:

- em ambiente Docker, o host do banco muda para o nome do servico, hoje `postgres`
- `NEXTAUTH_SECRET` nao deve permanecer com valor generico em ambiente compartilhado

## 4. Subida local sem Docker

Fluxo recomendado:

```bash
npm install
npm run db:generate
npm run db:migrate:dev
npm run dev
```

### Seed em desenvolvimento

Quando for necessario popular dados de apoio:

```bash
npm run db:seed
```

Importante:

- seed e manual
- seed nao deve ser executada automaticamente em startup ou deploy

## 5. Subida local com Docker Compose

Comandos principais:

```bash
docker-compose up -d
docker-compose ps
docker-compose logs -f
```

Comportamento atual do `docker-compose.yml`:

- sobe o PostgreSQL
- espera o healthcheck do banco
- sobe a aplicacao
- executa `prisma migrate deploy` antes de iniciar o servidor
- nao executa seed automaticamente

## 6. Dockerfile e imagem da aplicacao

O `Dockerfile` atual:

- usa build em duas etapas
- gera o Prisma Client durante o build
- compila a aplicacao Next.js
- publica a aplicacao com `node server.js`
- executa o processo final com usuario nao root

Observacao:

- a imagem final ainda instala dependencias completas com `npm install --legacy-peer-deps`, incluindo o necessario para rodar Prisma no container

## 7. Banco de dados e migrations

Fluxo recomendado com Prisma:

- desenvolvimento: `npm run db:migrate:dev`
- deploy com schema versionado: `npm run db:migrate:deploy`
- verificacao de estado: `npm run db:migrate:status`

Evitar como fluxo principal:

- `prisma db push` em ambiente que precise manter historico versionado de schema

## 8. Deploy de banco com caminho mais seguro

Comando disponivel:

```bash
npm run db:safe-deploy
```

Esse fluxo:

- executa `prisma migrate deploy`
- pode criar backup antes da migracao, se configurado
- nao executa seed

Flags suportadas pelo script:

- `BACKUP_BEFORE_MIGRATE=1`
- `BACKUP_DIR=./backups`

## 9. Scripts operacionais do repositorio

Scripts relevantes hoje:

- `scripts/db-safe-deploy.sh`: aplicacao segura de migrations
- `scripts/reset-weekly-hours.ts`: consolidacao e reset manual das horas semanais
- `scripts/auto-reset-weekly-hours.ts`: variante automatizavel do reset semanal
- `scripts/create-coordenador.ts`: apoio para criacao ou ajuste de usuario coordenador
- `scripts/cleanup-avatars.ts`: limpeza de arquivos antigos de avatar

Observacao importante:

- `scripts/docker-setup.sh` existe no repositorio, mas o texto dele esta desatualizado em relacao ao comportamento atual do projeto
- esse script menciona seed automatica e credenciais padrao que nao refletem o fluxo real atual
- se for mantido, ele deve ser revisado antes de ser tratado como referencia operacional

## 10. Troubleshooting

### `DATABASE_URL` nao definida

- configure `.env.local` no ambiente local
- ou exporte a variavel antes do comando

### Prisma acusa tabela ausente ou schema fora de sincronia

- confirme se as migrations foram aplicadas
- use `npm run db:migrate:dev` em desenvolvimento
- use `npm run db:migrate:deploy` em ambiente de execucao padronizado

### Usuario nao consegue entrar

- confirme se o status do usuario esta `active`
- usuarios `pending` ainda dependem de aprovacao

### Aplicacao sobe, mas sem dados iniciais

- isso pode ser normal
- o projeto nao executa seed automaticamente
- rode `npm run db:seed` apenas se estiver preparando um ambiente de desenvolvimento ou demonstracao

### Build do container falha

- valide variaveis de ambiente necessarias para o build
- confirme que o schema Prisma gera corretamente
- confirme que a pagina e os componentes do App Router nao dependem de APIs de cliente fora do padrao de build

## 11. Checklist de operacao

Antes de atualizar ou subir o sistema:

1. confirmar variaveis de ambiente
2. confirmar acesso ao banco
3. aplicar migrations necessarias
4. subir a aplicacao
5. verificar logs e acesso inicial
6. validar login e rotas principais

## 12. Checklist de deploy enxuto

1. `npm ci` ou instalacao equivalente
2. `npm run build`
3. `npm run db:migrate:deploy`
4. iniciar a aplicacao
5. verificar logs
6. validar autenticacao, dashboard e uma rota critica do laboratorio ou de tarefas
