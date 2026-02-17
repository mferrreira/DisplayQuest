# Refactor Stage 3 - TODO (2026-02-18)

## 1) Quests (prioridade alta)
- consolidar quest board (filtros: DAILY/WEEKLY/EVENT/STORY)
- adicionar estados de UX: disponivel, bloqueada, em progresso, concluida, resgatada, expirada
- permitir quest chain por capitulo/projeto (alinhada aos story arcs)
- adicionar painel admin para balanceamento de rewards e requisitos sem hardcode
- validar idempotencia de claim e duplicidade de recompensa

## 2) Ranking (prioridade alta)
- definir metricas oficiais do ranking:
  - xp total
  - nivel
  - trofeus
  - pontos de contribuicao
- criar ranking global e por projeto
- criar regras de desempate (xp > trofeus > points > updatedAt)
- incluir badges/elo no card de ranking para leitura rapida

## 3) Projetos + Gamificacao (prioridade alta)
- integrar progresso gamificado no contexto de projeto:
  - quests por projeto
  - ranking por projeto
  - contribuicao semanal por membro
- fechar inconsistencias de membros/voluntarios/lideres na UI de projetos
- exibir nome de usuario em todos os pontos onde hoje aparece ID
- validar atribuicao de horas e reflexo no perfil do voluntario

## 4) Checklist de fechamento do ciclo
- smoke manual:
  - abrir bau
  - claim quest
  - concluir task/work session
  - validar update de ranking
- garantir `tsc` verde no fim do lote
- opcional: configurar ESLint e adicionar `lint` ao fluxo de validacao
