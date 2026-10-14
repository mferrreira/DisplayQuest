# Mensagens e o que fazer

Toda recusa do sistema tem um motivo, e o motivo está na mensagem. Esta lista reúne o que o sistema diz e o que se faz a respeito.

## Entrada e conta

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **Email e senha são obrigatórios.** | um dos campos ficou vazio | preencha os dois |
| **Usuário não encontrado ou senha não definida.** | o e-mail não corresponde a nenhuma conta, ou a conta não tem senha | confira o e-mail; se a conta foi criada pela administração, peça a senha |
| **Senha incorreta.** | a senha não confere | recupere com a administração |
| **Sua conta ainda não foi aprovada. Entre em contato com um administrador ou laboratorista.** | a conta foi criada mas ainda está pendente | peça a aprovação; é na aprovação que a função é atribuída |
| **Nome do usuário é obrigatório** | o cadastro não aceita nome vazio | preencha o nome completo |

## Perfil e vínculo com projeto

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **CPF inválido** | faltam dígitos, ou os dois verificadores não batem, ou o CPF é todo repetido | confira o número com os dois últimos dígitos |
| **Matrícula deve ter no máximo 40 caracteres** (mesma forma para **Curso** e **Nome da instituição**) | o campo passou da linha que o formulário oficial tem | resuma: o documento entregue tem a linha do tamanho |
| **Não autorizado** | você tentou editar o perfil de outra pessoa sem permissão de gerenciar contas | peça a quem gerencia contas |
| **Categoria de membro inválida** | a categoria enviada não é **BOLSISTA** nem **VOLUNTARIO** | escolha **Bolsista** ou **Voluntário**, ou deixe **Sem categoria** |
| **Situação de membro inválida** | a situação enviada não é **ATIVO** nem **INATIVO** | escolha uma das duas |
| **Carga horária do membro deve ser um número maior que 0 e no máximo 168 horas semanais** | a carga contratada saiu da semana | use um número entre 0 e 168; para tirar a carga, deixe o campo vazio |
| **Currículo Lattes do membro deve ter no máximo 120 caracteres** | o campo passou do teto | use o número da plataforma, não o endereço inteiro |
| **Data de entrada do membro é inválida (use AAAA-MM-DD)** | a data veio fora do formato do calendário | use o campo de data da tela, que entrega `2026-10-14` |
| **Apenas coordenadores, gerentes ou gerente do projeto podem atualizar dados do membro** | quem tentou não tem a gestão daquele projeto | peça ao líder do projeto ou à coordenação |
| **Membro não encontrado no projeto** | o vínculo não pertence àquele projeto | recarregue a lista: a pessoa pode já ter saído |

## Cronograma do projeto

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **A atividade precisa de pelo menos um mês marcado** | você desmarcou o único mês de uma linha | marque o mês que a etapa ocupa; a linha não existe sem mês |
| **Responsável da atividade precisa participar do projeto** | a pessoa escolhida não está na equipe daquele projeto | adicione a pessoa na aba **Voluntários** antes de escolher |
| **Descrição da atividade não pode ter mais de 500 caracteres** | a descrição da etapa passou do teto | resuma a etapa, ou divida em duas linhas |
| **Descrição da meta não pode ter mais de 500 caracteres** | a descrição da meta passou do teto | resuma a meta |
| **Meta numérica deve ser um inteiro entre 1 e 9999** | o número da meta não é inteiro positivo dentro do teto | use um número inteiro; meta sem número deixa o campo vazio |

Duas recusas existem para o cronograma, mas a grade não deixa você chegar nelas: *"O cronograma da atividade não pode terminar antes de começar"* e *"Mês do cronograma é inválido (use AAAA-MM)"*. A grade só produz intervalo contínuo e mês no formato do calendário, e o servidor recheca os dois de qualquer forma.

## Relatórios técnicos do projeto

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **O texto em edição não foi sobrescrito — salve ou limpe antes de rascunhar.** | você pediu rascunho de IA com texto não salvo no campo | salve o seu texto ou limpe o campo, e peça o rascunho de novo |
| **Salve o texto do relatório antes de gerar o documento** | **Gerar DOCX** sem texto salvo — o botão vem desabilitado, e o servidor recheca mesmo assim | clique em **Salvar** primeiro |
| **O projeto não tem membros ativos — o relatório é gerado um documento por membro** | a geração exige pelo menos um membro com **Situação do vínculo** **Ativo** | confira a aba **Voluntários** daquele projeto |
| **IA indisponível** (com o endereço ou o status no resto da frase) | o servidor do rascunho não respondeu | o rascunho é opcional: escreva o texto você mesmo; nada foi alterado |

## Tarefas

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **Título da tarefa é obrigatório** | título vazio | dê um título |
| **Título da tarefa não pode ter mais de 200 caracteres** | limite de tamanho | resuma o título |
| **Descrição da tarefa não pode ter mais de 1000 caracteres** | limite de tamanho | divida em duas tarefas |
| **Pontos da tarefa não podem ser negativos** | pontuação abaixo de zero | use zero ou um valor positivo |
| **Prioridade inválida** | a prioridade enviada não é uma das três conhecidas | escolha **Baixa**, **Média** ou **Alta** |
| **📋 Tarefa Enviada para Revisão** | a tarefa passou para **Em Revisão** | aguarda a aprovação; não é erro |
| **Ação não permitida — A tarefa precisa estar em Andamento para marcar subtasks.** | marcar uma etapa com a tarefa fora de **Em Andamento** | devolva a tarefa para **Em Andamento** e marque; desmarcar não tem essa exigência |
| **A tarefa já foi concluída e a lista de subtasks não muda mais.** | em **Concluído** a lista fecha | nada a fazer: a janela é definitiva |
| **Conclua as N subtasks restantes antes de enviar para revisão** (ou *… antes de aprovar a tarefa*) | a trava de entrega: há etapa aberta | conclua as etapas restantes no cartão ou no detalhe |
| **Tarefa aprovada** | a revisão aceitou a entrega | os pontos já foram creditados |
| **Tarefa rejeitada — Retornou para ajustes.** | a revisão devolveu a entrega | corrija e mova para **Em Revisão** outra vez |
| **Erro ao aprovar tarefa** / **Erro ao salvar tarefa** | a operação não chegou ao fim | tente de novo; se persistir, o problema é do sistema, não seu |

## Sessão de trabalho

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **O log é obrigatório para encerrar a sessão.** | o diálogo **Finalizar Work Session** não aceita log vazio | escreva o que foi feito; o botão libera em seguida |
| **Não foi possível encerrar a sessão. Sua anotação foi mantida — tente de novo.** | a gravação da sessão não chegou ao fim | o texto continua no lugar: clique em **Encerrar sessão** outra vez |
| **Sessão pausada automaticamente** | a sessão cruzou 09:30, 12:00, 15:00 ou 17:00 | **Continuar sessão** para retomar, **Encerrar sessão** para fechar |
| **Sem sessão** | não há sessão aberta | use **Iniciar sessão** para registrar tempo |
| **Pausa automática em …** | contagem regressiva para a próxima pausa programada | pause antes, se for sair |

## Loja e recompensas

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **Pontos insuficientes** | o saldo não cobre o custo da recompensa | conclua tarefas aprovadas, ou escolha recompensa mais barata |
| **Esta recompensa não está disponível** | a recompensa foi retirada do catálogo | escolha outra |
| **Esta recompensa está fora de estoque** | não há unidade disponível | aguarde a reposição |
| **Apenas compras pendentes podem ser aprovadas** | a compra já saiu do estágio pendente | nada a fazer: ela já foi resolvida |
| **Apenas compras aprovadas podem ser completadas** | tentativa de completar sem aprovação | aprove antes de completar |
| **Compras completadas não podem ser canceladas** | o estágio final é definitivo | não há desfazimento pela loja |
| **Recompensa não encontrada** | a recompensa não existe mais | atualize a lista |

## Laboratório e reclamações

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **Apenas issues abertos podem ser iniciados** | a reclamação já está em andamento ou resolvida | trabalhe a que está **Aberta** |
| **Apenas issues fechados podem ser reabertos** | reabertura só se faz a partir de **Fechado** | feche e reabra, se o problema voltou |
| **Descrição da resolução é obrigatória** | resolver sem explicar | escreva como resolveu |
| **Responsabilidade já foi finalizada** | o plantão já foi encerrado | assuma uma responsabilidade nova |
| **Notação do evento é obrigatória** / **Nota do evento é obrigatória** | evento criado sem conteúdo | preencha a descrição do evento |
| **Data do evento inválida** | a data não é uma data | corrija o campo |

## Horários

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **Horário de fim deve ser posterior ao início** | o turno terminaria antes de começar | inverta os horários |
| **Horário de início deve ser anterior ao fim** | o mesmo motivo, pelo outro lado | corrija o início |
| **Dia da semana inválido** | o dia enviado não é um dos cinco úteis | escolha segunda a sexta |

## Quando a recusa é de permissão

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **Acesso negado** | a sua função não tem a permissão daquela ação | peça a quem tem; a tabela do capítulo 9 diz quem |
| **Ação não permitida** | a ação existe, mas não para a sua função | idem |
| **Usuário não tem permissão para criar avisos** | aviso do laboratório é restrito | peça ao coordenador ou laboratorista |
| **Usuário não tem permissão para iniciar responsabilidades** | assumir plantão é restrito | peça ao coordenador ou laboratorista |
| **Usuário não tem permissão para editar este perfil** | edição de perfil alheio é restrita | peça à administração |
| **Usuário não tem permissão para editar o relatório técnico deste projeto** | editar relatório técnico é do líder e da gestão daquele projeto | peça ao líder do projeto ou à coordenação |
| **Recurso não encontrado** / **Usuário não encontrado** | o que você tentou alterar já não existe | atualize a tela |
| **Conflito de estado** | outra pessoa mudou a mesma coisa antes de você | recarregue e repita a operação sobre o estado novo |

::: nota titulo="Mensagem técnica"
Quando a mensagem aparece com o prefixo **"Dados inválidos:"**, o que vem depois é o motivo concreto. Trate o texto após os dois-pontos como a instrução: ele diz qual campo está errado.
:::
