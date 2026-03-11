# Visao Geral e Escopo do Sistema

## 1. Visao geral

O `DisplayQuest` e uma plataforma web de gestao operacional voltada a um laboratorio com projetos, equipes, tarefas, horas de trabalho e mecanismos de gamificacao.

O sistema foi concebido para unificar em uma mesma aplicacao:

- controle de usuarios e aprovacoes
- gestao de projetos e equipes
- acompanhamento de tarefas
- registro de trabalho executado
- acompanhamento gerencial e operacional do laboratorio
- mecanismos de engajamento e recompensa

## 2. Escopo funcional

O escopo funcional atual do sistema abrange os seguintes dominios:

### 2.1 Acesso e usuarios

- cadastro de novos usuarios
- autenticacao por credenciais
- aprovacao ou rejeicao de contas pendentes
- atualizacao de perfil
- atribuicao de papeis globais

### 2.2 Projetos e membros

- criacao e manutencao de projetos
- definicao de lider de projeto
- inclusao e remocao de membros
- atribuicao de papeis no contexto do projeto
- consulta de projetos acessiveis ao ator

### 2.3 Tarefas

- criacao de tarefas individuais ou em lote
- organizacao em quadro Kanban
- tarefas publicas, delegadas e privadas
- multiatribuicao de responsaveis
- progresso individual em tarefas publicas
- aprovacao e rejeicao de tarefas em revisao

### 2.4 Execucao de trabalho

- inicio e encerramento de sessoes de trabalho
- associacao de tarefas a sessoes
- geracao e consulta de logs diarios
- consolidacao de relatorios semanais

### 2.5 Operacoes do laboratorio

- atribuicao de responsabilidade pelo laboratorio
- registro e acompanhamento de issues
- gerenciamento de horarios gerais e individuais
- registro de eventos de laboratorio

### 2.6 Gamificacao, loja e notificacoes

- acumulacao de pontos
- atribuicao de badges
- consulta de leaderboard
- consulta e resgate de recompensas
- acompanhamento de compras
- notificacoes ao usuario

## 3. Fora de escopo desta documentacao

Esta documentacao nao detalhara, salvo quando estritamente necessario:

- comportamento visual componente a componente
- endpoints utilitarios sem relevancia de negocio
- detalhes de baixo nivel da implementacao frontend
- funcoes auxiliares sem impacto funcional ou arquitetural

## 4. Limites funcionais observados

Com base no codigo atual, alguns pontos merecem registro como limites ou particularidades da versao:

- parte do dominio de tarefas ainda convive com campos legados de compatibilidade, como `assignedTo` e `isGlobal`
- nem todos os modulos backend apresentam o mesmo grau de encapsulamento em casos de uso
- certas regras ficam distribuidas entre rotas, modulos e repositorios, exigindo leitura cruzada na manutencao

## 5. Premissas operacionais

A documentacao adota as seguintes premissas:

- o backend e a fonte de verdade para autenticacao, permissao e regra de negocio
- a interface apenas expoe ou restringe interacoes, mas nao substitui validacoes backend
- o dominio de tarefas e o principal eixo de integracao com projetos, sessoes de trabalho e gamificacao
- o sistema foi desenhado para uso continuo por equipes com diferentes papeis

## 6. Criticos de negocio

Os elementos mais criticos do sistema, sob a perspectiva de projeto e manutencao, sao:

- aprovacao de usuarios e controle de acesso
- gestao de projetos e membros
- tarefas e seus diferentes modos de visibilidade e conclusao
- fechamento de sessao de trabalho com reflexos em logs e pontuacao
- operacao do laboratorio por responsabilidades e issues

## 7. Interfaces principais de uso

As principais areas da aplicacao atualmente mapeadas sao:

- `/login`
- `/register`
- `/dashboard`
- `/dashboard/admin`
- `/dashboard/projetos`
- `/dashboard/laboratorio`
- `/dashboard/weekly-reports`
- `/dashboard/loja`
- `/dashboard/profile`
- `/dashboard/leaderboard`
