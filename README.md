# Sistema de Gerenciamento de Laboratórios Educacionais

Plataforma web para gestão integrada de projetos, recursos e atividades em laboratórios de pesquisa educacional.

## Visão Geral

Este sistema foi desenvolvido para otimizar a gestão de laboratórios educacionais, proporcionando controle centralizado de projetos, acompanhamento de atividades estudantis e monitoramento de recursos. A plataforma integra elementos de gamificação para aumentar o engajamento dos usuários e facilitar o acompanhamento acadêmico.

## Arquitetura do Sistema

### Frontend
- **Next.js 15** - Framework React com App Router
- **TypeScript** - Tipagem estática para maior robustez
- **Tailwind CSS** - Framework CSS utilitário
- **ShadCN UI** - Biblioteca de componentes acessíveis
- **React Hook Form** - Gerenciamento de formulários

### Backend
- **Next.js API Routes** - Endpoints RESTful
- **Prisma ORM** - Camada de acesso aos dados com type safety
- **PostgreSQL** - Sistema gerenciador de banco de dados relacional
- **NextAuth.js** - Sistema de autenticação e autorização
- **bcryptjs** - Criptografia de senhas

### Infraestrutura
- **Docker** - Containerização da aplicação
- **Docker Compose** - Orquestração de serviços
- **PostgreSQL** - Banco de dados principal

## Funcionalidades Principais

### Gestão de Usuários
- Sistema de autenticação baseado em sessões
- Controle de acesso baseado em papéis (RBAC)
- Processo de aprovação de novos usuários
- Perfis personalizáveis com métricas individuais

### Gestão de Projetos
- Criação e administração de projetos de pesquisa
- Sistema de convites para participação
- Interface Kanban para visualização de tarefas
- Acompanhamento de progresso em tempo real

### Sistema de Tarefas
- Atribuição de tarefas por usuário ou projeto
- Sistema de pontuação para gamificação
- Controle de prioridades e prazos
- Estados de progresso configuráveis

### Gamificação
- Sistema de pontos por conclusão de atividades
- Loja virtual para resgate de recompensas
- Processo de aprovação para compras
- Ranking de produtividade dos usuários

### Controle de Tempo
- Registro de sessões de trabalho
- Logs detalhados de atividades
- Relatórios de produtividade
- Análise de horas trabalhadas

### Agendamento
- Gestão de responsabilidades do laboratório
- Calendário compartilhado de eventos
- Controle de disponibilidade de recursos
- Relatórios semanais automatizados

## Instalação e Configuração

### Pré-requisitos
- Node.js versão 18 ou superior
- PostgreSQL versão 12 ou superior
- Docker (opcional, para ambiente containerizado)

### Configuração do Ambiente de Desenvolvimento

1. **Clonagem do Repositório**
```bash
git clone <repository-url>
cd jogos-main
```

2. **Instalação de Dependências**
```bash
npm install
```

3. **Configuração de Variáveis de Ambiente**
```bash
cp .env.example .env.local
```

Configure as seguintes variáveis no arquivo `.env.local`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/lab_management"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

4. **Configuração do Banco de Dados**
```bash
npx prisma migrate dev
npx prisma generate
```

5. **Execução em Modo de Desenvolvimento**
```bash
npm run dev
```

### Configuração com Docker

Para ambiente de produção ou desenvolvimento isolado:

```bash
# Subir todos os serviços
docker-compose up --build -d

# Verificar status
docker-compose ps

# Ver logs
docker-compose logs -f app
```

## Estrutura do Projeto

```
jogos-main/
├── app/                    # Next.js App Router
│   ├── api/               # Endpoints da API REST
│   ├── dashboard/         # Interface administrativa
│   └── layout.tsx         # Layout principal da aplicação
├── components/            # Componentes React reutilizáveis
│   ├── ui/               # Componentes de interface base
│   ├── admin/            # Componentes administrativos
│   └── features/         # Componentes de funcionalidades específicas
├── contexts/             # Contextos React para gerenciamento de estado
├── lib/                  # Bibliotecas e utilitários
│   ├── prisma.ts         # Cliente Prisma configurado
│   ├── auth/             # Configurações de autenticação
│   └── utils/            # Funções utilitárias
├── prisma/               # Schema e migrações do banco de dados
│   └── schema.prisma     # Definição do schema
├── cli/                  # Ferramentas de linha de comando
└── public/               # Recursos estáticos
```

## Modelo de Papéis e Permissões

### Coordenador
- Acesso administrativo completo ao sistema
- Gestão de usuários e processos de aprovação
- Configurações gerais do laboratório
- Acesso a todos os relatórios e métricas

### Gerente
- Gestão estratégica e operacional
- Aprovação de projetos e recursos
- Controle de acesso a funcionalidades
- Acompanhamento de indicadores de desempenho

### Laboratorista
- Gestão operacional do laboratório
- Controle de responsabilidades e horários
- Aprovação de compras e recursos
- Supervisão de projetos e atividades

### Gerente de Projeto
- Gestão de projetos específicos
- Atribuição e acompanhamento de tarefas
- Relatórios de progresso do projeto
- Coordenação de membros da equipe

### Pesquisador
- Participação em projetos de pesquisa
- Execução de tarefas atribuídas
- Registro de atividades e progresso
- Acesso a recursos do laboratório

### Colaborador
- Participação em atividades do laboratório
- Execução de tarefas delegadas
- Registro de horas e atividades
- Acesso limitado a funcionalidades

### Voluntário
- Participação em atividades básicas
- Execução de tarefas públicas
- Registro de atividades
- Acesso restrito ao sistema

## Segurança e Autenticação

O sistema implementa múltiplas camadas de segurança:

- **Autenticação**: Baseada em NextAuth.js com tokens JWT
- **Autorização**: Controle de acesso baseado em papéis (RBAC)
- **Criptografia**: Senhas hasheadas com bcryptjs
- **Validação**: Schema validation com TypeScript e Zod
- **HTTPS**: Recomendado para ambientes de produção

## Monitoramento e Métricas

### Indicadores Disponíveis
- Número de usuários ativos por período
- Taxa de conclusão de tarefas
- Distribuição de pontos e recompensas
- Tempo médio de sessão
- Produtividade por projeto e usuário

### Sistema de Logs
- Logs de autenticação e autorização
- Registro de ações administrativas
- Monitoramento de erros e exceções
- Métricas de performance da aplicação

## Deploy em Produção

### Requisitos Mínimos do Servidor
- **CPU**: 2-4 vCPUs
- **Memória RAM**: 4-8 GB
- **Armazenamento**: 50-100 GB SSD
- **Rede**: 1 Gbps

### Processo de Deploy

1. **Clone do Repositório**
```bash
git clone <repository-url>
cd jogos-main
```

2. **Deploy com Docker**
```bash
docker-compose up --build -d
```

3. **Criação de Usuário Administrador**
```bash
./cli/cli.sh create-admin
```

4. **Verificação do Sistema**
```bash
curl http://localhost:3000/api/health
```

### Plataformas Recomendadas
- **Vercel** + **Railway** (solução gerenciada)
- **DigitalOcean** Droplet
- **AWS EC2** + **RDS**
- **Google Cloud Platform**

## Contribuição

Para contribuir com o projeto:

1. Faça um fork do repositório
2. Crie uma branch para sua funcionalidade (`git checkout -b feature/nova-funcionalidade`)
3. Implemente suas alterações
4. Execute os testes locais
5. Faça commit das mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
6. Push para sua branch (`git push origin feature/nova-funcionalidade`)
7. Abra um Pull Request

## Licença

Este projeto está licenciado sob a Licença MIT.

## Suporte e Contato

Para dúvidas técnicas ou suporte:
- Abra uma issue no repositório GitHub
- Entre em contato com a equipe de desenvolvimento
- Consulte a documentação técnica disponível

---

**Desenvolvido por Márcio Martins Ferreira Júnior, Rian Gabriel Andrade e Matheus Silva Seixas para o IFNMG - Instituto Federal do Norte de Minas Gerais**
