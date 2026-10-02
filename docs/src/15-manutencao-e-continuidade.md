# Manutenção e continuidade

## Onde reside a informação

A manutenção do sistema depende de que cada tipo de informação tenha uma única fonte. O
repositório é a fonte primária em todos os casos; este documento é uma projeção dela,
construída por geração a partir de fontes versionadas.

| Informação | Fonte |
| --- | --- |
| Comportamento implementado | Código dos módulos, rotas e peças de interface |
| Esquema de dados e versões de esquema | Esquema do ORM e migrações versionadas |
| Regras de arquitetura e verificação correspondente | Configuração da análise estática de dependências |
| Estrutura de módulos e de interface | Guia do back-end e guia da interface, no repositório |
| Desenho, requisitos, regras e decisões de modelagem | Fontes deste documento |
| Registro de decisões, lacunas e dívidas | Arquivo de estado do processo de refatoração |
| Notas de trabalho e armadilhas verificadas | Notas de trabalho do repositório |
| Comportamento anterior à refatoração | Histórico do controle de versão, na etiqueta de pré-limpeza |

A separação entre o código e a documentação não é duplicação: o código é a verdade executável,
e a documentação é o modelo declarado. Onde os dois divergirem, a divergência é um defeito de
manutenção e deve ser tratada como tal.

## Como estender o sistema

As receitas abaixo descrevem o caminho já estabelecido para cada tipo de alteração. Seguir o
caminho existente é o que mantém a verificação de arquitetura verde sem exceção registrada.

### Nova regra de negócio

A regra entra como função pura no núcleo de domínio, sem dependência de infraestrutura, e todo
parâmetro de que ela precisa é explícito. O instante entra como parâmetro, nunca é lido do
sistema. A regra é verificada por teste unitário com instante e entradas fixas, e a verificação
de dependências confirma que o núcleo continua sem ORM, framework, entrada e saída.

### Novo caso de uso

O caso de uso vive na camada de aplicação do módulo responsável, com o contrato de comando e o
resultado em `application/contracts` e, se precisar falar com o exterior, a interface necessária
em `application/ports`. A orquestração chama o domínio e as portas; ela não conhece adaptador.
A fábrica do módulo passa a aceitar a porta como parâmetro, e o ponto de composição fornece a
implementação.

### Nova rota

A rota autentica, autoriza, valida a forma da entrada, invoca o caso de uso e traduz o resultado.
Ela não contém regra de negócio, não monta consulta e não instancia módulo: resolve a composição
pelo acesso único. O mapeamento de erro de domínio é aplicado para que validação, proibição,
ausência e conflito cheguem como códigos de estado correspondentes.

### Nova dependência entre módulos

Quem produz o fato declara uma porta local que descreve o que precisa que aconteça, sem nomear o
consumidor. O ponto de composição injeta um adaptador fino. Nenhuma aresta de importação direta
entre módulos é criada, e a verificação de dependências continua verde por construção.

### Novo dado persistido

A alteração entra como migração versionada, e nunca como mudança direta no banco em execução. A
restrição que o banco possa garantir é declarada no esquema; o valor de estado, quando enumerado,
é declarado como enumerado, e não como texto livre. O histórico que precisa sobreviver à mudança
de catálogo é copiado no momento do fato.

### Alteração ou acréscimo neste documento

O texto é editado em `docs/src` e os diagramas em `docs/diagrams`; o documento final é gerado.
Um diagrama novo é referenciado uma única vez, pelo identificador do arquivo, e a numeração das
figuras e o sumário são produzidos pela geração. A verificação de caracteres precede a geração,
para que um texto de origem não carregue ruído até o artefato final.

## Verificação antes da entrega

O critério de entrega é um conjunto de verificações, e todas precisam estar verdes.

| Verificação | Objeto | Requisito adicional |
| --- | --- | --- |
| Arquitetura | Dependências entre camadas e módulos, com lista de exceções vazia | Nenhuma |
| Lint | Convenções e restrições de importação | Nenhuma |
| Tipos | Compilação sem emissão | Nenhuma |
| Testes | Regras, casos de uso, contratos e idas e voltas | Banco de teste no ar para as idas e voltas |
| Segredos de ambiente | Variáveis obrigatórias e valores de exemplo | Nenhuma |
| Documento | Geração do documento e integridade dos diagramas | Contêiner de renderização disponível |

A suíte de testes cobre hoje as regras puras, os casos de uso com portas substituídas, os
contratos de portas e fábricas, e as idas e voltas de integração contra banco real. A separação
entre esses níveis é o que permite que a maior parte da verificação rode sem infraestrutura.

## Separação entre o banco de teste e o banco de operação

Os testes de integração usam o ORM real e gravam no banco. O banco de operação está na porta
que a orquestração publica em endereço de retorno local, de modo que um endereço errado no
ambiente de execução transforma uma rodada de testes em escrita sobre dados reais.

Essa separação é defendida por três mecanismos cumulativos. A orquestração de teste é um arquivo
distinto, com contêiner, porta e volume próprios. O procedimento de preparação declara o
endereço explicitamente em cada etapa. E um verificador recusa a execução quando o endereço de
conexão aponta para fora da lista de teste, por host e porta, recusando inclusive o nome interno
do banco de operação.

::: atencao titulo="Recusa por endereço, não por aparência"
O verificador compara host e porta, e não trechos de texto do endereço. Credenciais diferentes
na mesma porta não alteram a decisão, e o nome interno do banco de operação é recusado mesmo
quando o endereço parece formado por outra combinação de nome, porta e credencial.
:::

## Dívidas e divergências conhecidas

As condições abaixo são conhecidas e assumidas. Estão registradas aqui porque qualquer
alteração futura precisa conhecê-las, e porque a decisão de cobrá-las ou mantê-las pertence a
quem responde pelo sistema.

| Condição | Onde | Consequência prática | Situação |
| --- | --- | --- | --- |
| A agenda periódica roda em cada processo da aplicação | Serviço de agenda | Tarefa periódica executa uma vez por instância, sem trava | Assumido; a implantação de referência tem instância única |
| Colunas de estado remanescentes são texto livre | Esquema de persistência de sessões e contas | O valor gravado depende do chamador; a reconciliação acontece na leitura | Herança do modelo anterior; a enumeração do domínio existe e é usada pelo núcleo |
| A autorização de maior parte das rotas é avaliada na própria rota | Rotas HTTP com verificação direta de papel ou permissão | A regra efetiva está fora do caso de uso, e a matriz do domínio é permissiva | Herança consolidada; a extração para o caso de uso é alteração de médio porte |
| A camada de registros de entidade é adotada por um único módulo | Adaptadores de persistência do laboratório | A forma de construir registros não é uniforme entre módulos | Assumido; adotá-la nos demais módulos é alteração mecânica |
| O processo grava em dois diretórios | Contêiner da aplicação | Caminho de escrita novo falha sem alteração da construção da imagem | Documentado e verificado |
| A versão de execução da aplicação está fixada | Imagem de execução e versão declarada | Verificação local só vale se a versão local coincidir com a da imagem | Alinhado; divergir de novo reintroduz o risco |

A divergência entre a autorização avaliada na rota e a matriz do domínio merece uma observação
de método. A matriz do domínio descreve o que o sistema permite; a verificação na rota decide o
que é efetivamente recusado. Enquanto as duas não coincidirem, a matriz é documentação com
força normativa parcial. Qualquer regra nova de permissão deve ser escrita na matriz e, no
mesmo movimento, avaliada por um caso de uso — escrever apenas na matriz cria a impressão de
restrição sem produzir efeito.

## Continuidade

O conhecimento do sistema é contínuo porque é versionado junto com ele. O texto e os diagramas
deste documento são fontes no repositório, e a geração é reproduzível; o comportamento anterior
a uma refatoração extensa permanece recuperável no histórico, na etiqueta que marca o estado
anterior à limpeza. Um mantenedor que não participasse da construção consegue, por esses dois
caminhos, reconstruir a intenção do sistema e a origem de cada decisão estrutural.

A continuidade também depende de disciplina de alteração. Três práticas preservam a
legibilidade do conjunto: toda mudança de comportamento vem acompanhada da alteração da regra
correspondente, com teste; toda alteração estrutural vem acompanhada da verificação de
dependências; e nenhuma isenção de regra de arquitetura é acrescentada sem registro da decisão
que a autoriza. A lista de exceções vazia é um estado a preservar, não um detalhe de
configuração.

O procedimento de alteração de esquema tem uma restrição adicional de sequenciamento: a
reserva do banco é feita antes da aplicação da migração, e a migração é aplicada de forma
idempotente pela inicialização do contêiner. Uma alteração de esquema que não possa ser
expressa como migração versionada não pertence a este sistema.
