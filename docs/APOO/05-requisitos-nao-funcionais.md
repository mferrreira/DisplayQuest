# Requisitos Nao Funcionais

## 1. Convencoes

- Identificador de requisito nao funcional: `RNF-XX`
- Estes requisitos foram inferidos a partir da arquitetura atual, da documentacao existente e das necessidades de manutencao observadas no repositorio

## 2. Seguranca e controle de acesso

- `RNF-01` O sistema deve exigir autenticacao para acesso as areas protegidas.
- `RNF-02` O sistema deve aplicar controle de acesso baseado em papeis e permissoes.
- `RNF-03` O backend deve ser a fonte de verdade para autorizacao, sem depender exclusivamente de restricoes de interface.
- `RNF-04` Senhas devem ser armazenadas com mecanismo de hash apropriado.
- `RNF-05` A sessao autenticada deve expor informacoes suficientes para verificacao de autorizacao e personalizacao da experiencia.
- `RNF-06` O sistema deve considerar, ainda que de forma inicial, principios basicos de protecao de dados pessoais compativeis com a LGPD.

## 3. Manutenibilidade

- `RNF-07` Regras de negocio relevantes devem ser concentradas preferencialmente em modulos backend, evitando excesso de logica em rotas HTTP.
- `RNF-08` A composicao de dependencias backend deve permanecer centralizada.
- `RNF-09` Novas funcionalidades devem preservar a separacao entre camadas de aplicacao, infraestrutura e adaptacao HTTP sempre que viavel.
- `RNF-10` Mudancas estruturais devem ser acompanhadas de atualizacao documental.
- `RNF-11` O sistema deve manter continuidade para novos mantenedores com base em documentacao e organizacao modular.

## 4. Consistencia e integridade

- `RNF-12` O sistema deve preservar integridade relacional entre usuarios, projetos, tarefas, sessoes e demais entidades centrais.
- `RNF-13` Mudancas de banco devem ser controladas por schema e migration.
- `RNF-14` Regras de unicidade, como membership unico por projeto e usuario, devem ser garantidas.
- `RNF-15` Estados de entidades devem respeitar transicoes coerentes com as regras do dominio.

## 5. Rastreabilidade e auditoria

- `RNF-16` O sistema deve permitir rastrear alteracoes relevantes em entidades, inclusive por meio de historico e metadados quando aplicavel.
- `RNF-17` O sistema deve manter datas, status e relacionamentos suficientes para auditoria funcional de tarefas, sessoes, compras e issues.

## 6. Usabilidade operacional

- `RNF-18` A interface deve oferecer navegacao orientada aos principais dominios operacionais do laboratorio.
- `RNF-19` O sistema deve disponibilizar paines e dashboards adequados aos diferentes perfis de uso.
- `RNF-20` O sistema deve permitir operacao cotidiana sem exigir conhecimento tecnico do usuario final.

## 7. Evolucao e compatibilidade

- `RNF-21` A evolucao do dominio de tarefas deve preservar compatibilidade controlada com campos legados enquanto houver dependencias ativas.
- `RNF-22` A arquitetura deve permitir extensao por dominio sem necessidade de reescrita integral do sistema.

## 8. Operacao e ambiente

- `RNF-23` O sistema deve ser executavel em ambiente local de desenvolvimento com banco relacional e migrations controladas.
- `RNF-24` O sistema deve possuir verificacoes minimas de saude e operacao para apoio a deploy e manutencao.
- `RNF-25` O sistema deve ser compativel com o modelo de execucao web adotado pelo projeto, incluindo frontend e backend no mesmo repositorio.
- `RNF-26` Nesta fase do projeto, o sistema deve operar adequadamente em rede local do laboratorio, mantendo aberta a possibilidade de endurecimento de seguranca em futuras implantacoes.
