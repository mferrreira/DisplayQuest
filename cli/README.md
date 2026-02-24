# CLI do DisplayQuest

Sistema de linha de comando para operacoes administrativas (principalmente usuarios).

## Comandos Disponíveis

### **Modo Interativo**
```bash
./cli/cli.sh
```

### **Comandos Diretos**
```bash
# Criar usuário administrador
./cli/cli.sh create-admin

# Listar todos os usuários
./cli/cli.sh list-users

# Aprovar usuário pendente
./cli/cli.sh approve-user

# Resetar senha de usuário
./cli/cli.sh reset-password
```

## Uso em Producao

### **1. Após o primeiro deploy:**
```bash
# Subir o sistema
docker-compose up --build -d

# Criar primeiro administrador
./cli/cli.sh create-admin
```

### **2. Gerenciar usuários:**
```bash
# Ver todos os usuários
./cli/cli.sh list-users

# Aprovar novos usuários
./cli/cli.sh approve-user

# Resetar senha se necessário
./cli/cli.sh reset-password
```

## Roles Disponíveis

- **COORDENADOR**: Acesso total ao sistema
- **GERENTE**: Gestão estratégica e usuários
- **LABORATORISTA**: Gestão operacional do lab

## Segurança

- Senhas são hasheadas com bcrypt
- Emails são normalizados (lowercase)
- Validação de roles
- Verificação de duplicatas

## Exemplo de Uso

```bash
$ ./cli/cli.sh create-admin

🔐 Criando usuário administrador...

Nome completo: João Silva
Email: joao@lab.com
Senha: ********
Role (COORDENADOR/GERENTE/LABORATORISTA): COORDENADOR

✅ Usuário criado com sucesso!
👤 ID: 1
📧 Email: joao@lab.com
🎭 Role: COORDENADOR
🔑 Status: active
```

## Solução de Problemas

### **Erro: Sistema não está rodando**
```bash
docker-compose up -d
```

### **Erro: Email já existe**
Use um email diferente ou `reset-password` para alterar senha.

### **Erro: Conexão com banco**
Verifique se o PostgreSQL está saudável:
```bash
docker-compose ps
```
