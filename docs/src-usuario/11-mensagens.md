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

## Tarefas

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **Título da tarefa é obrigatório** | título vazio | dê um título |
| **Título da tarefa não pode ter mais de 200 caracteres** | limite de tamanho | resuma o título |
| **Descrição da tarefa não pode ter mais de 1000 caracteres** | limite de tamanho | divida em duas tarefas |
| **Pontos da tarefa não podem ser negativos** | pontuação abaixo de zero | use zero ou um valor positivo |
| **Prioridade inválida** | a prioridade enviada não é uma das três conhecidas | escolha **Baixa**, **Média** ou **Alta** |
| **📋 Tarefa Enviada para Revisão** | a tarefa passou para **Em Revisão** | aguarda a aprovação; não é erro |
| **Tarefa aprovada** | a revisão aceitou a entrega | os pontos já foram creditados |
| **Tarefa rejeitada — Retornou para ajustes.** | a revisão devolveu a entrega | corrija e mova para **Em Revisão** outra vez |
| **Erro ao aprovar tarefa** / **Erro ao salvar tarefa** | a operação não chegou ao fim | tente de novo; se persistir, o problema é do sistema, não seu |

## Sessão de trabalho

| O sistema diz | Por quê | O que fazer |
| --- | --- | --- |
| **O log é obrigatório para encerrar a sessão.** | o diálogo **Finalizar Work Session** não aceita log vazio | escreva o que foi feito; o botão libera em seguida |
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
| **Recurso não encontrado** / **Usuário não encontrado** | o que você tentou alterar já não existe | atualize a tela |
| **Conflito de estado** | outra pessoa mudou a mesma coisa antes de você | recarregue e repita a operação sobre o estado novo |

::: nota titulo="Mensagem técnica"
Quando a mensagem aparece com o prefixo **"Dados inválidos:"**, o que vem depois é o motivo concreto. Trate o texto após os dois-pontos como a instrução: ele diz qual campo está errado.
:::
