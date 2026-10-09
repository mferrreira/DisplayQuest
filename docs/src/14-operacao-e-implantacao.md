# Operação e implantação

## Topologia de execução

O sistema é executado como dois contêineres em uma rede interna: a aplicação e o banco. O
contêiner da aplicação publica a porta do servidor web no hospedeiro; o contêiner do banco
não publica porta alguma na rede do hospedeiro, apenas na rede interna. A figura da
implantação, no capítulo 10, representa essa topologia e os volumes associados.

A aplicação depende do banco em condição saudável: a orquestração só inicia o contêiner da
aplicação depois que o banco responde ao exame de prontidão. Ainda assim, o script de entrada
aguarda alguns segundos antes de aplicar as migrações, para absorver o intervalo entre o
banco aceitar conexões e estar de fato utilizável.

O contêiner da aplicação reinicia automaticamente quando encerrado de forma anormal, exceto
quando é parado de forma explícita. O contêiner do banco não declara política de reinício, de
modo que uma parada explícita exige que ele seja subido novamente.

## Construção da imagem

A imagem da aplicação é construída em duas etapas. A primeira instala as dependências, gera o
cliente do ORM e compila a aplicação. A segunda monta o artefato de execução: copia o
resultado da compilação, as dependências necessárias em tempo de execução e o cliente do ORM
já gerado.

A imagem final não interpõe um gerenciador de processo. O servidor Node é o processo
principal do contêiner, e é ele quem recebe os sinais de parada.

O regime de escrita do contêiner é restrito. O processo executa com um usuário sem
privilégio, e exatamente dois diretórios são graváveis por esse usuário: o de avatares e o de
anexos de relatório. A construção da imagem cria esses diretórios e atribui a eles a
propriedade correta antes de trocar de usuário.

::: atencao titulo="Caminho de escrita novo exige alteração da imagem"
Um caminho de gravação criado fora dos dois diretórios preparados na imagem falha em tempo de
execução com erro de permissão, porque o processo não é proprietário do restante da árvore da
aplicação. Todo novo diretório de gravação precisa de criação e atribuição de propriedade na
construção da imagem.
:::

## Volumes e persistência

Três volumes nomeados preservam o estado entre reconstruções e recriações de contêiner. O
banco é reconstruído com a mesma imagem e reencontra os dados no volume; a aplicação é
reconstruída e reencontra os arquivos enviados.

| Volume | Ponto de montagem | Conteúdo |
| --- | --- | --- |
| `postgres_data` | Diretório de dados do PostgreSQL | Base de dados inteira |
| `uploads_data` | Diretório público de avatares | Imagens de perfil |
| `report_files_data` | Diretório privado de anexos | Arquivos de relatório |

O volume de avatares é servido de forma estática; o de anexos é servido exclusivamente por
rota autenticada, que verifica a regra de leitura do relatório antes de entregar o arquivo.
A separação entre os dois diretórios é o que sustenta essa diferença de regime.

::: limite titulo="Recriar contêiner é seguro; remover volumes não é"
Reconstruir ou recriar um contêiner é uma operação idempotente e não toca nos volumes. Remover
os volumes — com uma operação de descarte explícita ou com a remoção do ambiente
compartilhado — destrói o banco e os arquivos de uma só vez. A operação de rotina nunca
descarta volumes.
:::

## Portas e exposição

| Porta | Onde | Alcance |
| --- | --- | --- |
| 3000 | Aplicação | Publicada no hospedeiro |
| 5432 | Banco de operação | Apenas na rede interna da orquestração |
| 5432 | Banco de operação, endereço de retorno local | Publicada somente em `127.0.0.1` por arquivo de sobreposição |
| 5433 | Banco de teste | Publicada somente em `127.0.0.1`, em orquestração separada |

A publicação em endereço de retorno local existe para permitir inspeção pela própria máquina
hospedeira, seja por cliente de linha de comando, seja por teste de integração. Ela não expõe
o banco à rede, porque nunca é amarrada à interface externa.

O arquivo de sobreposição que declara essa publicação é carregado implicitamente por
convenção de nome da ferramenta de orquestração, e portanto vale também em ambiente de
operação. A consequência é deliberada: a publicação continua restrita ao endereço de retorno
local nos dois ambientes.

## Requisitos de ambiente

A aplicação e o banco falham na inicialização quando as variáveis obrigatórias não estão
definidas. A orquestração aborta com mensagem explícita para a senha do banco e para o segredo
de autenticação; a aplicação aborta quando o segredo está ausente, curto demais ou é um valor
de exemplo conhecido.

| Variável | Consumidor | Observação |
| --- | --- | --- |
| `POSTGRES_DB` | Banco | Nome da base, com valor padrão |
| `POSTGRES_USER` | Banco | Usuário da base, com valor padrão |
| `POSTGRES_PASSWORD` | Banco | Obrigatória, sem valor padrão publicado |
| `DATABASE_URL` | Aplicação | Montada a partir das variáveis do banco na orquestração |
| `NEXTAUTH_SECRET` | Aplicação | Obrigatória; comprimento mínimo e ausência de valor de exemplo |
| `NEXTAUTH_URL` | Aplicação | Endereço público da aplicação |
| `NODE_ENV` | Aplicação | Fixada em produção na imagem |

A verificação de segredos é um passo próprio, executado por comando dedicado. Em
desenvolvimento, as violações são rebaixadas a aviso, para não impedir o trabalho local; no
ambiente de operação, elas interrompem o procedimento.

## Ciclo de vida e comandos de operação

A ferramenta de orquestração é usada na forma de complemento, com o subcomando separado do
executável por espaço. O ciclo de rotina é o de subir a composição com reconstrução forçada,
acompanhar o estado dos contêineres e inspecionar os registros de saída.

| Operação | Comando |
| --- | --- |
| Construir e subir em segundo plano | `docker compose up -d --build` |
| Listar estado dos contêineres | `docker compose ps` |
| Acompanhar registros | `docker compose logs -f` |
| Abrir cliente do banco pela rede interna | `docker compose exec postgres psql` |
| Aplicar migrações versionadas manualmente | `npm run db:migrate:deploy` |
| Verificar situação das migrações | `npm run db:migrate:status` |
| Validar segredos de ambiente | `npm run check:env` |
| Implantação segura, com reserva opcional | `npm run db:safe-deploy` |

O script de entrada do contêiner da aplicação já aplica as migrações versionadas antes de
iniciar o servidor. A aplicação manual do mesmo comando é útil quando se quer aplicar
migrações sem reiniciar a aplicação, ou quando se quer conferir a situação antes de subir.

A subida da composição é idempotente: repetir a operação mantém os contêineres já em execução
e reaproveita as camadas de construção inalteradas. Não existe etapa de descarte no
procedimento de rotina.

## Tarefas periódicas

As tarefas periódicas rodam dentro do processo da aplicação, no fuso do laboratório, e são
iniciadas automaticamente na importação do módulo de agenda pelo servidor. As tarefas são
interrompidas nos sinais de encerramento do processo. A grade dos horários e o efeito de cada
tarefa estão descritos no capítulo 10; a forma operacional é a seguinte.

| Tarefa | Expressão | Disparo |
| --- | --- | --- |
| Reinício semanal | `0 0 * * 1` | Consolidação pelo módulo de relatórios |
| Pausa programada, primeiro horário | `30 9 * * *` | Pausa de sessões e de responsabilidade |
| Pausa programada, demais horários | `0 12,15,17 * * *` | Idem |
| Varredura noturna | `59 23 * * *` | Persistência da pausa das sessões restantes |

As expressões de pausa não são escritas à mão: elas são derivadas da lista de horários do
domínio, agrupadas por minuto. Essa derivação existe para impedir que a agenda e a regra de
negócio divergissem em silêncio — o que já ocorrera quando a expressão declarava um horário
que não constava da lista do domínio.

A agenda expõe estado e permite um disparo manual do reinício semanal. O acesso exige a
função de coordenação.

| Rota | Método | Efeito |
| --- | --- | --- |
| `/api/cron/status` | `GET` | Informa se a agenda está inicializada e quando ocorre o próximo reinício |
| `/api/cron/status` | `POST` com `{"action":"manual-reset"}` | Executa o reinício semanal sob demanda |

::: limite titulo="Agenda e réplica única"
A agenda roda em cada processo da aplicação. Não há trava distribuída, e portanto não há
proteção contra execução concorrente da mesma tarefa quando há mais de uma instância. A
implantação de referência é de instância única; ampliar horizontalmente exige extrair a agenda
para um processo próprio ou introduzir uma trava antes.
:::

## Exame de saúde e diagnóstico

O banco declara um exame de prontidão que verifica se aceita conexões. A aplicação declara uma
rota pública de saúde, que consulta o banco pela composição do back-end e responde com o
estado da conexão.

| Sonda | Endereço | Resposta saudável | Resposta não saudável |
| --- | --- | --- | --- |
| Prontidão do banco | Interna ao contêiner | Aceita conexões | Aguarda |
| Saúde da aplicação | `/api/health` | `200`, banco conectado | `503`, banco desconectado |

O diagnóstico de falha de inicialização segue uma ordem previsível. Primeiro, verificar se as
variáveis obrigatórias estão presentes e com valores válidos. Depois, se o banco atingiu a
condição saudável. Por último, se a aplicação consegue gravar nos dois diretórios de arquivos.

| Sintoma | Causa provável | Verificação |
| --- | --- | --- |
| Orquestração recusa a subida | Variável obrigatória ausente | Mensagem da própria orquestração |
| Aplicação não inicia | Segredo de autenticação inválido ou curto | Comando de validação de ambiente |
| Aplicação inicia e rota de saúde responde `503` | Banco inacessível ou ainda subindo | Estado dos contêineres e registros |
| Falha de permissão ao gravar arquivo | Caminho fora dos dois diretórios preparados | Comparar com a construção da imagem |
| Migração recusada | Histórico de migrações divergente | Situação das migrações |
| Tarefa periódica executada mais de uma vez | Mais de uma instância da aplicação | Número de réplicas em execução |

## Reserva e recuperação

A reserva do banco é feita por despejo lógico. O procedimento de implantação segura executa a
validação de segredos, opcionalmente produz um despejo datado e então aplica as migrações
versionadas. O despejo é acionado por variável, e o diretório de destino tem valor padrão.

| Elemento | Valor |
| --- | --- |
| Acionamento da reserva | Variável `BACKUP_BEFORE_MIGRATE` igual a `1` |
| Diretório de destino | Variável `BACKUP_DIR`, ou `./backups` |
| Nome do arquivo | Despejo datado, com data e hora no formato `AAAAMMDD_HHMMSS` |
| Ferramenta | Despejo lógico do PostgreSQL |

A recuperação combina duas fontes. Os arquivos enviados vivem em volumes nomeados e
sobrevivem à reconstrução da aplicação; o banco é restaurado a partir do despejo lógico mais
recente. A restauração de arquivos sem o banco correspondente, ou do banco sem os arquivos,
produz um estado inconsistente — anexos órfãos ou referências sem conteúdo —, e por isso as
duas fontes devem ser tratadas como um conjunto.

## Procedimento de implantação

A sequência de rotina é a seguinte.

1. Atualizar o código na máquina de operação.
2. Validar as variáveis obrigatórias de ambiente.
3. Reconstruir e subir a composição, sem descartar volumes.
4. Acompanhar os registros até a aplicação concluir as migrações e iniciar o servidor.
5. Confirmar a rota de saúde e o estado da agenda.

A reconstrução da imagem é a única etapa custosa, e ela não altera dados. As migrações são
aplicadas de forma idempotente na inicialização: uma migração já aplicada não é repetida. Uma
alteração de esquema entra em operação por migração versionada, nunca por alteração direta do
banco em execução.
