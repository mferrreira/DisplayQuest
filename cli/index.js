#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const prisma = new PrismaClient();

// Cores para output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Interface para input
function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// Função para criar usuário administrador
async function createAdmin() {
    log('cyan', '\n🔐 Criando usuário administrador...\n');

    try {
        const name = await askQuestion('Nome completo: ');
        const email = await askQuestion('Email: ');
        const password = await askQuestion('Senha: ');
        const role = await askQuestion('Role (COORDENADOR/GERENTE/LABORATORISTA): ');

        // Validar role
        const validRoles = ['COORDENADOR', 'GERENTE', 'LABORATORISTA'];
        if (!validRoles.includes(role.toUpperCase())) {
            log('red', '❌ Role inválido. Use: COORDENADOR, GERENTE ou LABORATORISTA');
            return;
        }

        // Verificar se email já existe
        const existingUser = await prisma.users.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (existingUser) {
            log('red', '❌ Email já existe no sistema');
            return;
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 12);

        // Criar usuário
        const user = await prisma.users.create({
            data: {
                name: name.trim(),
                email: email.toLowerCase(),
                password: hashedPassword,
                roles: [role.toUpperCase()],
                status: 'active',
                points: 0,
                completedTasks: 0,
                weekHours: 40,
                currentWeekHours: 0,
                profileVisibility: 'public'
            }
        });

        log('green', `\n✅ Usuário criado com sucesso!`);
        log('green', `👤 ID: ${user.id}`);
        log('green', `📧 Email: ${user.email}`);
        log('green', `🎭 Role: ${role.toUpperCase()}`);
        log('green', `🔑 Status: ${user.status}`);

    } catch (error) {
        log('red', `❌ Erro ao criar usuário: ${error.message}`);
    }
}

// Função para listar usuários
async function listUsers() {
    log('cyan', '\n👥 Listando usuários...\n');

    try {
        const users = await prisma.users.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                roles: true,
                status: true,
                points: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });

        if (users.length === 0) {
            log('yellow', '📭 Nenhum usuário encontrado');
            return;
        }

        console.table(users.map(user => ({
            ID: user.id,
            Nome: user.name,
            Email: user.email,
            Roles: user.roles.join(', '),
            Status: user.status,
            Pontos: user.points,
            Criado: new Date(user.createdAt).toLocaleDateString('pt-BR')
        })));

    } catch (error) {
        log('red', `❌ Erro ao listar usuários: ${error.message}`);
    }
}

// Função para aprovar usuário
async function approveUser() {
    log('cyan', '\n✅ Aprovando usuário...\n');

    try {
        const email = await askQuestion('Email do usuário para aprovar: ');
        
        const user = await prisma.users.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            log('red', '❌ Usuário não encontrado');
            return;
        }

        if (user.status === 'active') {
            log('yellow', '⚠️ Usuário já está ativo');
            return;
        }

        await prisma.users.update({
            where: { id: user.id },
            data: { status: 'active' }
        });

        log('green', `✅ Usuário ${user.name} foi aprovado!`);

    } catch (error) {
        log('red', `❌ Erro ao aprovar usuário: ${error.message}`);
    }
}

// Função para resetar senha
async function resetPassword() {
    log('cyan', '\n🔑 Resetando senha...\n');

    try {
        const email = await askQuestion('Email do usuário: ');
        const newPassword = await askQuestion('Nova senha: ');
        
        const user = await prisma.users.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            log('red', '❌ Usuário não encontrado');
            return;
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await prisma.users.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        log('green', `✅ Senha resetada para ${user.name}!`);

    } catch (error) {
        log('red', `❌ Erro ao resetar senha: ${error.message}`);
    }
}

// Menu principal
async function showMenu() {
    while (true) {
        log('magenta', '\n🚀 CLI de Gerenciamento - DisplayQuest');
        log('magenta', '=====================================\n');
        
        log('cyan', '1. 👤 Criar usuário administrador');
        log('cyan', '2. 📋 Listar usuários');
        log('cyan', '3. ✅ Aprovar usuário');
        log('cyan', '4. 🔑 Resetar senha');
        log('cyan', '5. 🚪 Sair\n');

        const choice = await askQuestion('Escolha uma opção (1-5): ');

        switch (choice) {
            case '1':
                await createAdmin();
                break;
            case '2':
                await listUsers();
                break;
            case '3':
                await approveUser();
                break;
            case '4':
                await resetPassword();
                break;
            case '5':
                log('green', '\n👋 Até logo!');
                process.exit(0);
            default:
                log('red', '❌ Opção inválida');
        }

        await askQuestion('\nPressione Enter para continuar...');
    }
}

// Execução principal
async function main() {
    try {
        // Testar conexão com banco
        await prisma.$connect();
        log('green', '✅ Conectado ao banco de dados');

        // Verificar se é execução direta ou com argumentos
        const args = process.argv.slice(2);
        
        if (args.length > 0) {
            // Modo comando direto
            switch (args[0]) {
                case 'create-admin':
                    await createAdmin();
                    break;
                case 'list-users':
                    await listUsers();
                    break;
                case 'approve-user':
                    await approveUser();
                    break;
                case 'reset-password':
                    await resetPassword();
                    break;
                default:
                    log('red', '❌ Comando inválido');
                    log('cyan', 'Comandos disponíveis: create-admin, list-users, approve-user, reset-password');
            }
        } else {
            // Modo interativo
            await showMenu();
        }

    } catch (error) {
        log('red', `❌ Erro de conexão: ${error.message}`);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Executar
main().catch(console.error);
