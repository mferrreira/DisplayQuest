# Padrões e diretrizes

## Padrões arquiteturais

O sistema adota um conjunto pequeno de padrões, aplicados com consistência. A escolha
favorece poucos padrões bem compreendidos em vez de uma variedade que exigiria interpretação
caso a caso.

| Padrão | Onde se manifesta | Motivo da adoção |
| --- | --- | --- |
| Portas e adaptadores | Todos os onze módulos | Isolar o núcleo das tecnologias de persistência e de serviço |
| Injeção de dependência | Fábricas de módulo e ponto de composição | Permitir substituição em teste e localizar o acoplamento |
| Registro de domínio | Entidades e objetos de valor do núcleo | Concentrar a validação e o cálculo de negócio |
| Recurso com estados explícitos | Sessões, compras, issues, tarefas | Tornar as transições verificáveis e auditáveis |
| Publicação de evento por porta | Notificações e premiação | Desacoplar quem produz o fato de quem reage a ele |
| Idempotência por chave natural | Premiação | Impedir crédito duplicado sem depender de estado |
| Composição em raiz única | Ponto de composição | Manter o grafo de dependências legível e verificável |
| Verificação de fronteira | Análise estática de dependências | Impedir a degradação silenciosa da arquitetura |

## Diretrizes de código

As diretrizes a seguir são observáveis no código e não dependem de julgamento subjetivo.

**O instante entra como parâmetro.** Nenhuma regra de domínio lê o relógio do sistema. Toda
função que depende do tempo o recebe explicitamente. É o que permite que uma regra sobre
atraso, teto de duração ou expiração seja verificada com um instante fixo.

**O erro é tipado.** Falhas de negócio são lançadas como erros de domínio nomeados, e não
como retornos ambíguos nem como exceções genéricas. O mapeamento para código de estado HTTP
é feito em um único lugar.

**A rota é fina.** Uma rota HTTP autentica, autoriza, valida a forma da entrada, invoca um
caso de uso e traduz o resultado. Ela não contém regra de negócio, não conhece o ORM e não
monta consulta.

**O módulo não conhece outro módulo.** Um módulo declara suas necessidades como portas
locais. Quem satisfaz essas portas é o ponto de composição, com um adaptador fino.

**A regra pura não conhece infraestrutura.** O núcleo de domínio não importa ORM, framework,
adaptador nem modelo persistente. A violação é detectada automaticamente.

**O teste acompanha o comportamento congelado.** Onde um comportamento diverge da intuição
— e o capítulo 7 lista vários —, ele é fixado por teste com o mesmo cuidado com que um
comportamento correto seria fixado. Um comportamento preservado sem teste é um
comportamento que se perderá na próxima alteração.

## Diretrizes de interface

A interface segue um vocabulário visual consistente, e as decisões abaixo são parte do
contrato de apresentação.

| Diretriz | Aplicação |
| --- | --- |
| Tema escuro no quadro | Colunas em cor sólida por estado, sem degradê, com contraste verificado |
| Acessibilidade por teclado | O painel de notificações fecha com a tecla de escape e responde a foco |
| Fechamento por clique externo | O popover de notificações fecha ao clicar fora, como espera um painel auxiliar |
| Imagem de perfil quadrada | Recorte e conversão para WebP antes da gravação |
| Autoria explícita | A interface distingue o dado que a pessoa edita do dado que ela apenas consulta |

## Diretrizes de verificação

A verificação do sistema está organizada em quatro níveis, do mais barato ao mais custoso.

| Nível | Objeto | Requer banco |
| --- | --- | --- |
| Regra pura | Funções de domínio, com instante e entradas fixas | Não |
| Caso de uso | Orquestração, com portas substituídas por dublês | Não |
| Contrato | Forma e comportamento expostos por uma porta ou fábrica | Não |
| Integração | Idas e voltas reais contra um banco isolado | Sim, em banco de teste separado |

O nível de integração roda exclusivamente contra um banco de teste isolado, em porta
distinta da instância de operação. Essa separação é uma regra de higiene, não uma
preferência: um teste de integração que apontasse para a base de operação destruiria dados
reais.

## Diretrizes de modelagem de persistência

**A restrição que o banco pode garantir pertence ao banco.** Unicidade e integridade
referencial são declaradas no esquema, e não apenas verificadas em código.

**O histórico não depende do catálogo.** Onde um valor é copiado no momento do fato — nome e
preço de uma compra —, a cópia é intencional. Ela preserva o passado quando o catálogo
muda.

**O estado explícito prevalece.** Um valor de estado enumerado é preferível a um texto
livre. As exceções existentes são herança, e estão registradas como tal.

**A cascata segue a existência.** Um registro que não existe sem o seu pai é removido com
ele. Um registro que documenta um fato da operação não é removido com o seu autor.

## Convenções de nomenclatura

| Elemento | Convenção | Exemplo |
| --- | --- | --- |
| Módulo | Minúsculas, com hífen, descrevendo a responsabilidade | `work-execution` |
| Caso de uso | PascalCase com sufixo `UseCase` | `ApproveTaskUseCase` |
| Porta | Substantivo seguido de `Port` | `TaskRepositoryPort` |
| Adaptador | Prefixo da tecnologia seguido do papel | `PrismaTaskRepository` |
| Evento de domínio | Tempo verbal do fato, sem prefixo de tecnologia | `TaskCompletedEvent` |
| Papel | Maiúsculas, sem acento, valor do enumerador | `GERENTE_PROJETO` |
| Permissão | Maiúsculas, verbo e objeto | `MANAGE_WORK_SESSIONS` |

## Dependências tecnológicas

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| Apresentação | Framework de componentes com renderização no servidor | Páginas e interatividade |
| Aplicação | Rotas de servidor do próprio framework | Superfície HTTP |
| Persistência | ORM com cliente tipado | Acesso ao banco |
| Banco | PostgreSQL 15 | Armazenamento relacional |
| Autenticação | Sessão com credencial | Identidade e sessão |
| Converter imagens | Biblioteca de processamento de imagem | Recorte e conversão de avatar |
| Agenda | Agendador em processo | Tarefas periódicas |
| Documentação | PlantUML e conversor de Markdown | Geração deste documento |

::: nota titulo="A documentação também é código"
Este documento não é um artefato separado do repositório. Ele é gerado a partir de fontes
de texto e de diagramas versionados, e o processo de geração é reproduzível. A consequência
é que uma alteração de comportamento e a alteração da sua descrição podem ser revisadas no
mesmo lugar, e que não existe uma versão do documento desvinculada do código que ele
descreve.
:::
