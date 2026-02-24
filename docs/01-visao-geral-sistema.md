# Visao Geral do Sistema

## Objetivo

O DisplayQuest e uma plataforma web para gestao de laboratorio, equipes, projetos, tarefas, carga horaria e gamificacao.

O sistema foi pensado para:

- centralizar operacao do laboratorio
- organizar tarefas por quadro Kanban
- acompanhar horas de trabalho e logs
- gerar relatorios
- aplicar gamificacao (pontos, badges, loja)
- manter trilha de manutencao para continuidade por novos alunos

## Publico-alvo

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

1. Usuario se cadastra.
2. Conta fica `pending`.
3. Coordenador/Gerente aprova.
4. Usuario acessa dashboard e interage com projetos/tarefas.
5. Sistema registra progresso, horas, logs e pontuacao.
6. Gestao acompanha relatorios e operacao do laboratorio.

## Documentos relacionados

- `docs/02-manual-do-usuario.md`
- `docs/03-regras-de-negocio.md`
- `docs/04-arquitetura-tecnica.md`
- `docs/05-operacao-deploy.md`
- `docs/06-guia-de-manutencao-handover.md`
- `docs/07-modelo-de-dados.md`
