# Arquitetura do sistema

## Visão geral

O DisplayQuest é uma aplicação web monolítica com organização modular interna. O termo
*monolítica* é preciso: há um único processo de servidor, um único banco de dados e um
único artefato de implantação. O termo *modular* também é preciso: o código de domínio está
particionado em onze módulos com fronteiras verificadas automaticamente, e a comunicação
entre eles não acontece por importação direta.

A decisão de arquitetura mais importante do sistema é a de que o núcleo de domínio não
depende de nada externo. Ele não conhece o banco, o ORM, o framework web nem o relógio do
sistema. Todas as dependências apontam para dentro, e as dependências externas entram por
contratos declarados pelo consumidor e satisfeitos na borda.

O objetivo dessa inversão é verificável: as regras de negócio podem ser exercitadas por
teste unitário sem banco, sem servidor HTTP e sem infraestrutura. A consequência prática é
que a menor unidade de comportamento do sistema é testável de forma determinística, porque
o instante entra sempre como parâmetro.

## Camadas e a regra de dependência

```figure arq-camadas titulo="Camadas do sistema e a direção única da dependência"
O diagrama à esquerda mostra as quatro camadas da aplicação e as dependências permitidas.
A direção é sempre para dentro: a apresentação conhece a aplicação, que conhece o domínio.
A infraestrutura implementa as portas que a aplicação declara, e o ponto de composição é o
único elemento que conhece todas as camadas ao mesmo tempo.

As três setas marcadas como proibidas expressam a regra central: o domínio, os casos de uso
e as rotas não alcançam o banco diretamente. Quem fala com o banco são os adaptadores, e
eles são injetados.

O núcleo não lê o relógio. Essa restrição, aparentemente menor, é o que permite que uma
regra temporal — o teto de nove horas de um trecho, por exemplo — seja verificada em
microssegundos com um instante fixo.
```

## Módulos de domínio

O back-end está dividido em onze módulos. Cada módulo tem a mesma anatomia interna:

| Pasta | Papel | Pode importar |
| --- | --- | --- |
| `application/contracts` e `application/ports` | Comandos, resultados e contratos de acesso externo | Apenas o domínio e tipos do próprio módulo |
| `application/use-cases` | Orquestração dos casos de uso | O domínio, os contratos e as portas do próprio módulo |
| `infrastructure/repositories` | Adaptadores de persistência | As portas do próprio módulo e o ORM |
| `infrastructure/adapters` | Adaptadores de serviços externos | As portas do próprio módulo |
| `index.ts` | Fábrica do módulo | Tudo o que é interno ao módulo |

```figure arq-modulos titulo="Os onze módulos de domínio e as dependências entre eles"
O diagrama mostra a topologia das dependências. Nenhuma aresta liga diretamente um módulo
a outro dentro da árvore de módulos: as setas de publicação saem de uma porta local e são
atendidas por um módulo que o ponto de composição injetou.

Notificações e gamificação aparecem como sumidouros. Nenhum outro módulo os importa, e não
há caminho de volta. Todo o acoplamento que existe entre, por exemplo, execução de trabalho
e gamificação passa pelo ponto de composição, por meio da porta de premiação.

O módulo de identidade e acesso é o único sem casos de uso. Ele expõe diretamente uma
pergunta sobre permissão, papel e acesso ao próprio recurso, o que é coerente com sua
natureza: autorização é uma função das matrizes do domínio, não um fluxo com etapas.
```

### Os módulos e suas responsabilidades

| Módulo | Responsabilidade |
| --- | --- |
| `identity-access` | Responder perguntas de autorização sobre papéis e permissões |
| `user-management` | Cadastro, aprovação, suspensão e gestão de contas |
| `project-management` | Ciclo de vida do projeto, liderança e estatísticas |
| `project-membership` | Composição de pessoas e papéis dentro do projeto |
| `task-management` | Quadro de tarefas, atribuição, revisão e aprovação |
| `work-execution` | Sessões de trabalho, registros diários e relatórios |
| `lab-operations` | Plantão, grades, eventos, avisos e issues |
| `store` | Catálogo de recompensas, compras e fluxo de resgate |
| `gamification` | Pontos, experiência, níveis, distintivos e ranking |
| `reporting` | Relatórios de projeto e anexos |
| `notifications` | Registro e entrega de notificações internas |

### A verificação automática da fronteira

As regras de dependência não dependem de disciplina de quem escreve o código. Elas são
verificadas por análise estática em uma verificação que faz parte do critério de entrega.
As regras são as seguintes.

| Regra | O que proíbe |
| --- | --- |
| RG-01 | O núcleo de domínio de importar ORM, framework, HTTP, adaptador ou outro módulo |
| RG-02 | O domínio de um módulo de instanciar repositório ou tocar em entrada e saída |
| RG-03 | A camada de aplicação de alcançar ORM, framework, modelo persistente, a própria infraestrutura ou outro módulo |
| RG-04 | A infraestrutura de alcançar o ponto de composição, outro módulo ou a fábrica de outro módulo |
| RG-05 | Nada: é a permissão explícita de o ponto de composição alcançar qualquer camada |
| RG-06 | As rotas HTTP de alcançar o ORM, um repositório, um modelo persistente ou a fábrica de um módulo |
| RG-06b | O front-end de importar o ORM |
| RG-10 | Reforça RG-04 no que diz respeito à fábrica de outro módulo |

A lista de exceções está vazia. Uma importação proibida nova derruba a verificação, sem
necessidade de revisão humana para ser percebida.

::: nota titulo="Por que a lista de exceções vazia importa"
Uma lista de exceções com entradas antigas é indistinguível, na prática, de uma regra
inexistente: o passivo tolerado esconde a violação nova. A lista foi esvaziada ao final do
processo de refatoração, e uma isenção só pode ser acrescentada com registro explícito da
decisão que a autoriza.
:::

## Ponto de composição

O ponto de composição é o único lugar do sistema onde dois módulos se conhecem. Ele
constrói as onze instâncias, injeta as dependências cruzadas e as expõe por um único
acesso.

```figure arq-composicao titulo="O ponto de composição e o grafo de montagem dos módulos"
O diagrama mostra a função de construção, o singleton preguiçoso que a envolve e as quatro
injeções que atravessam módulos.

Três dessas injeções são de publicação: gestão de tarefas, operação do laboratório e
relatórios recebem um publicador que os liga a notificações. Uma é de premiação: execução
de trabalho e gestão de tarefas recebem um publicador que os liga à gamificação.

O singleton é preguiçoso e compartilhado. A primeira requisição que precisar do back-end
constrói os onze módulos; todas as seguintes reutilizam a mesma instância. Isso é
deliberado: a construção é barata, mas a existência de uma única instância é o que garante
que não haja duas autoridades de autorização coexistindo no processo.
```

### Como uma dependência cruzada é declarada

O padrão é sempre o mesmo, e vale descrevê-lo porque ele aparece repetidamente. O módulo
que produz o fato declara uma **porta local** — uma interface que descreve o que ele
precisa que aconteça, sem nomear quem vai fazer. A fábrica do módulo recebe a
implementação dessa porta como parâmetro. O ponto de composição fornece a implementação,
que é um adaptador fino sobre o módulo consumidor.

O efeito é que a infraestrutura do módulo produtor não importa nada do módulo consumidor.
O acoplamento existe, mas está localizado em um único arquivo, e é verificável por leitura
desse arquivo.

## Componentes do sistema implantado

```figure arq-componentes titulo="Componentes do sistema, do navegador ao armazenamento"
O diagrama organiza os componentes em quatro grupos: o que está fora do servidor, o
processo Node, a persistência e os arquivos, e os serviços externos.

No processo Node convivem três mecanismos de entrada. O primeiro é o App Router, que serve
as páginas. O segundo são as rotas HTTP, que atendem a interface e clientes programáticos.
O terceiro é o serviço de agenda, que dispara tarefas periódicas sem intervenção externa.

As portas e adaptadores formam a camada que traduz as intenções dos casos de uso em
operações de banco e de sistema de arquivos. É a única camada que conhece o ORM.

O PostgreSQL aparece fora da rede alcançável, porque é assim que ele é declarado na
orquestração. Os dois diretórios de arquivos têm regimes distintos: o de avatares é servido
estaticamente, e o de anexos é servido apenas por rota autenticada.
```

## O caminho de uma requisição

```figure arq-fluxo-requisicao titulo="Fluxo de uma requisição de escrita, da sessão à resposta"
O diagrama descreve o caminho completo, com as decisões que podem interrompê-lo. A sessão
é resolvida primeiro, e o ator é derivado dela. A autorização vem em seguida, por consulta
à matriz de permissões do domínio.

A partir daí o caso de uso executa. Ele consulta as regras puras do domínio, que podem
lançar um erro tipado, e persiste pelas portas. Os efeitos colaterais — notificação e
premiação — são publicados por porta local, e uma falha neles é absorvida.

O mapeamento de erro é a última etapa decisiva. Erros de domínio são traduzidos para os
códigos de estado correspondentes: validação vira 400, não encontrado vira 404, conflito
vira 409 e proibido vira 403. Erros que não são de domínio — uma violação de chave
estrangeira, por exemplo — seguem pelo caminho legado de 500.
```

| Tipo de erro | Código | Origem |
| --- | --- | --- |
| `ValidationError` | 400 | Entrada inválida em regra de domínio |
| `ForbiddenError` | 403 | Autoridade insuficiente |
| `NotFoundError` | 404 | Entidade inexistente |
| `ConflictError` | 409 | Transição de estado inválida |
| Erro não mapeado | 500 | Falha de persistência ou defeito não previsto |

## Implantação

```figure arq-implantacao titulo="Implantação, contêineres, volumes e exposição de portas"
O sistema é implantado por orquestração de contêineres, em duas imagens: a aplicação e o
banco. A aplicação é construída em duas etapas, e a imagem final executa o servidor Node
diretamente, sem gerenciador de processos interposto.

O contêiner da aplicação roda com usuário sem privilégio. Apenas dois caminhos são graváveis
por esse usuário, e são exatamente os dois volumes de arquivos. Essa restrição é deliberada
e tem uma consequência operacional: qualquer caminho de gravação novo precisa ser criado e
ter sua propriedade atribuída na construção da imagem, sob pena de falha de permissão em
tempo de execução.

O banco é declarado apenas com exposição intra-rede. A publicação de porta no hospedeiro
vem de um arquivo de sobreposição versionado, que amarra a publicação ao endereço de
retorno local, e não à interface externa. O efeito é que o banco é acessível a partir da
própria máquina hospedeira para depuração, e não é acessível a partir da rede.
```

### Agenda de tarefas periódicas

A agenda roda dentro do processo do servidor, no fuso do laboratório. São quatro entradas.

| Agenda | Horário | Efeito |
| --- | --- | --- |
| Reinício semanal | Toda segunda-feira, às 00:00 | Consolida a semana e reinicia a contagem corrente |
| Pausa programada | 09:30 | Pausa as sessões ativas no horário marcado |
| Pausa programada | 12:00, 15:00 e 17:00 | Idem, nos demais horários |
| Varredura noturna | 23:59 | Converte em pausada toda sessão ativa remanescente |

::: limite titulo="A agenda e a réplica única"
Como a agenda roda dentro do processo web, cada réplica da aplicação executaria a mesma
agenda uma vez. O sistema não possui trava distribuída, e portanto não possui proteção
contra execução concorrente da mesma tarefa periódica. A implantação de referência é de
réplica única, e a ampliação horizontal exige antes a extração da agenda para um processo
próprio ou a introdução de uma trava.
:::

### Requisitos de ambiente

A aplicação falha na inicialização, por construção, quando variáveis obrigatórias não estão
definidas: a senha do banco e o segredo de autenticação. O segredo de autenticação é
validado quanto a comprimento mínimo e quanto à ausência de valores de exemplo conhecidos.

| Variável | Obrigatória | Observação |
| --- | --- | --- |
| `DATABASE_URL` | Sim | Montada a partir das variáveis do banco |
| `NEXTAUTH_SECRET` | Sim | Comprimento mínimo e ausência de valor de exemplo |
| `NEXTAUTH_URL` | Sim | Endereço público da aplicação |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Sim | Consumidas pelo contêiner do banco |
| `NODE_ENV` | Não | Fixada em produção na imagem |

## Decisões estruturais e suas consequências

| Decisão | Consequência favorável | Custo assumido |
| --- | --- | --- |
| Núcleo de domínio puro | Regras testáveis sem infraestrutura; comportamento determinístico | Instante e efeitos externos precisam ser propagados como parâmetros |
| Dependências cruzadas só no ponto de composição | Fronteiras de módulo verificáveis; acoplamento localizado | O grafo de montagem cresce com o número de módulos |
| Portas declaradas pelo consumidor | O produtor não conhece o consumidor | Um adaptador fino por cruzamento |
| Verificação de dependências no critério de entrega | A regra de arquitetura não se degrada em silêncio | Toda exceção exige registro de decisão |
| Agenda dentro do processo web | Simplicidade operacional, sem serviço adicional | Não sobrevive a mais de uma réplica |
| Documento gerado a partir de fontes | O texto e os diagramas têm origem versionada e verificável | Exige a etapa de geração antes da leitura |
