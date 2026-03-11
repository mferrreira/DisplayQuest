# Visao Geral do Sistema

## Objetivo

O DisplayQuest e uma plataforma web voltada ao apoio da rotina do laboratorio. Ele reune, em um unico ambiente, a organizacao de projetos, tarefas, carga horaria, relatorios e elementos de gamificacao.

De forma pratica, o sistema busca:

- centralizar operacao do laboratorio
- organizar tarefas por quadro Kanban
- acompanhar horas de trabalho e logs
- gerar relatorios
- aplicar gamificacao (pontos, badges, loja)
- manter trilha de manutencao para continuidade por novos alunos

## Publico-alvo

- alunos e bolsistas que participam dos projetos do laboratorio
- coordenacao e gerencia do laboratorio
- lideres/gerentes de projeto
- laboratoristas
- pesquisadores, colaboradores e voluntarios
- alunos responsaveis pela manutencao futura do sistema

## Principais modulos (visao funcional)

- Usuarios e aprovacao de contas
- Projetos e membros
- Tarefas (publicas, delegadas, privadas)
- Sessoes de trabalho e logs diarios
- Relatorios semanais
- Operacoes do laboratorio (responsabilidades, eventos, horarios, issues)
- Gamificacao (pontos, badges, recompensas e compras)
- Notificacoes

## Visao rapida da arquitetura

- Frontend: `Next.js (App Router)` + `React` + `TypeScript`
- Backend de aplicacao: `Route Handlers` em `app/api/*`
- Regras de negocio: modulos em `backend/modules/*`
- Persistencia: `Prisma` + `PostgreSQL`
- Autenticacao: `next-auth` (credenciais + sessao JWT)

## Fluxo geral de uso

1. O usuario realiza cadastro no sistema.
2. A conta fica pendente ate a aprovacao.
3. Coordenacao ou gerencia valida o acesso.
4. Depois de aprovado, o usuario passa a utilizar o dashboard conforme seu papel.
5. O sistema registra atividades, horas, logs, pontuacao e interacoes com os demais modulos.
6. A equipe de gestao acompanha a execucao dos projetos e a rotina do laboratorio por meio de relatorios e paines de apoio.

## Documentos relacionados

- `docs/02-manual-do-usuario.md`
- `docs/03-regras-de-negocio.md`
- `docs/04-arquitetura-tecnica.md`
- `docs/05-operacao-deploy.md`
- `docs/06-guia-de-manutencao-handover.md`
- `docs/07-modelo-de-dados.md`
