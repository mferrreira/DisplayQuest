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

**O estado guardado no navegador passa por um ponto único.** Rascunho, preferência e
ordenação persistida no navegador são lidos e gravados pela costura de estado do cliente,
que dá namespace às chaves, tolera conteúdo corrompido e devolve o valor padrão quando não
há `window` — servidor, área privativa ou navegador com armazenamento bloqueado. Nenhuma
peça de interface toca o armazenamento do navegador diretamente.

::: nota titulo="Por que o valor padrão importa"
Uma chave corrompida — de outra versão da aplicação, ou editada à mão no depurador — não
pode derrubar a tela. A costura devolve o padrão e o produto segue funcionando, apenas sem
lembrar o que foi escolhido.
:::

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
| Estado visível sem depender da atenção | O botão do cronômetro, mesmo fechado, diz se há sessão ativa ou pausada e marca a pausa automática com um ponto pulsante |
| Sinal sonoro opcional | O aviso de pausa é sintetizado na hora, sem arquivo de áudio, e só toca se a pessoa ligar o interruptor; o sinal visual nunca depende do som |
| Altura limitada por coluna | Cada coluna do quadro tem altura máxima derivada da janela e rolagem própria; o cabeçalho da coluna fica fora da área de rolagem e a página não cresce com a quantidade de cartões |
| Menu só oferece o que a regra permite | A lista de destinos de um menu é derivada da mesma função que decide o movimento, e nunca é escrita à mão ao lado dela: oferecer um destino que a regra barra é oferecer uma operação que volta com erro |
| Uma tela por comportamento | A mesma peça de interface não é duplicada por aparência; quando duas telas precisam do mesmo comportamento, ele mora em um componente só |
| Preferência é da pessoa, não do quadro | Uma escolha de quem está olhando — a ordem dos cartões de uma coluna — é guardada no navegador com chave por pessoa, e lida depois da montagem para o servidor e o cliente desenharem a mesma tela; estado que precisa ser compartilhado por link continua na URL |
| O navegador é entrada não confiável | O que volta do `localStorage` é texto que outra versão do app pode ter escrito: só o que passa na guarda vira estado, e o que não passa vira o padrão |
| Rótulo acessível não contém o de outro | O rótulo de um controle não pode conter o rótulo do elemento que ele governa, porque toda busca por rótulo que case por substring passa a achar dois elementos — foi o que aconteceu com "Ordenar coluna A Fazer" contra "Coluna A Fazer", e só o navegador pegou |
| Variação mostrada vem do servidor | Quando uma ação muda um total, a variação exibida é a que o servidor creditou — no caso dos pontos, o par `awardedPoints` com `awardedTo` que a conclusão e a aprovação devolvem — e nunca um recálculo do cliente: pedir e receber divergem por regras que existem e são intencionais (prêmio já registrado credita zero, o arredondamento da tarefa não tem piso e um crédito que falha vira "ninguém creditado" em vez de zero). `null` e `0` são casos distintos e a interface os trata assim |
| Sinal que explica o número fica no número | A variação que acabou de acontecer é exibida junto do contador que ela explica, e só quando o crédito é da pessoa logada: o prêmio da aprovação vai para o responsável pela tarefa, quase nunca para quem aprovou, e mostrar o prêmio de outra pessoa no contador de quem aprovou seria uma mentira |

## Diretrizes de verificação

A verificação do sistema está organizada em cinco níveis, do mais barato ao mais custoso.

| Nível | Objeto | Requer banco |
| --- | --- | --- |
| Regra pura | Funções de domínio, com instante e entradas fixas | Não |
| Caso de uso | Orquestração, com portas substituídas por dublês | Não |
| Contrato | Forma e comportamento expostos por uma porta ou fábrica | Não |
| Integração | Idas e voltas reais contra um banco isolado | Sim, em banco de teste separado |
| Navegador | Layout e interação real: altura, rolagem, foco, arrasto | Sim, na base de desenvolvimento |

O nível de integração roda exclusivamente contra um banco de teste isolado, em porta
distinta da instância de operação. Essa separação é uma regra de higiene, não uma
preferência: um teste de integração que apontasse para a base de operação destruiria dados
reais.

O nível de navegador existe porque o ambiente de teste de componentes **não calcula layout**:
ele não mede altura, não rola e não arrasta. Um teste que lesse nomes de classe para
"provar" a altura de uma coluna estaria conferindo a própria asserção. Onde a afirmação é
sobre geometria, a prova é no navegador, contra um servidor de verdade.

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
