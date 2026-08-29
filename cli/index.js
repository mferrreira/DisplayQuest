#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const { assertCliAllowed } = require('./guard');
const bcrypt = require('bcryptjs');

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

// Parser simples de argumentos no estilo --chave valor.
// Uso: node cli/index.js create-admin --name "X" --email y@z --password p --role COORDENADOR
function parseArgs(argv) {
    const opts = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const val = argv[i + 1];
            if (!val || val.startsWith('--')) {
                throw new Error(`Argumento --${key} precisa de um valor (ex.: --${key} valor)`);
            }
            opts[key] = val;
            i++;
        }
    }
    return opts;
}

// Função para criar usuário administrador (não-interativa: dados via --chave valor)
async function createAdmin(opts) {
    log('cyan', '\n🔐 Criando usuário administrador...\n');

    try {
        const name = opts.name;
        const email = opts.email;
        const password = opts.password;
        const role = opts.role;

        if (!name || !email || !password || !role) {
            log('red', '❌ Uso: node cli/index.js create-admin --name "Nome" --email email@ex.com --password senha --role ROLE');
            log('cyan', '   ROLE deve ser um de: COORDENADOR, GERENTE, LABORATORISTA');
            log('cyan', '   Ex.: node cli/index.js create-admin --name "Admin" --email admin@admin.com --password 123 --role COORDENADOR');
            return;
        }

        // Validar role
        const validRoles = ['COORDENADOR', 'GERENTE', 'LABORATORISTA'];
        if (!validRoles.includes(role.toUpperCase())) {
            log('red', `❌ Role inválido: ${role}. Use: COORDENADOR, GERENTE ou LABORATORISTA`);
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
// Função para aprovar usuário (não-interativa: --email)
async function approveUser(opts) {
    log('cyan', '\n✅ Aprovando usuário...\n');

    try {
        const email = opts.email;

        if (!email) {
            log('red', '❌ Uso: node cli/index.js approve-user --email email@ex.com');
            return;
        }

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
// Função para resetar senha (não-interativa: --email e --password)
async function resetPassword(opts) {
    log('cyan', '\n🔑 Resetando senha...\n');

    try {
        const email = opts.email;
        const newPassword = opts.password;

        if (!email || !newPassword) {
            log('red', '❌ Uso: node cli/index.js reset-password --email email@ex.com --password novasenha');
            return;
        }

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

// Uso/help do CLI
function usage() {
    log('cyan', 'Uso: node cli/index.js <comando> [--opcoes] [--allow-prod]');
    log('cyan', '');
    log('cyan', 'Comandos:');
    log('cyan', '  create-admin    Criar usuário administrador');
    log('cyan', '    node cli/index.js create-admin --name "<Nome>" --email <email> --password <senha> --role <ROLE>');
    log('cyan', '    ROLE: COORDENADOR | GERENTE | LABORATORISTA');
    log('cyan', '  list-users      Listar usuários');
    log('cyan', '    node cli/index.js list-users');
    log('cyan', '  approve-user    Aprovar usuário pendente');
    log('cyan', '    node cli/index.js approve-user --email <email>');
    log('cyan', '  reset-password  Resetar a senha de um usuário');
    log('cyan', '    node cli/index.js reset-password --email <email> --password <novaSenha>');
    log('cyan', '');
    log('cyan', 'Em produção (NODE_ENV != development), acrescente --allow-prod:');
    log('cyan', '  node cli/index.js create-admin --name "Admin" --email a@b.c --password x --role COORDENADOR --allow-prod');
}

// Execução principal
async function main() {
    try {
        // A10: CLI administrativo é guardado por ambiente — aborta ANTES de
        // conectar/prompt fora de desenvolvimento (ou sem --allow-prod explícito).
        const args = process.argv.slice(2);
        const nodeEnv = process.env.NODE_ENV || "development";
        const allowProd = args.includes("--allow-prod");

        if (!assertCliAllowed({ nodeEnv, allowProd })) {
            log(
                'red',
                '🌐 CLI administrativo bloqueado fora de desenvolvimento (NODE_ENV não é "development").' +
                    ' Se você tem certeza do que está fazendo em produção, rode com --allow-prod.'
            );
            process.exit(1);
        }

        // Testar conexão com banco
        await prisma.$connect();
        log('green', '✅ Conectado ao banco de dados');

        if (args.length === 0) {
            usage();
            return;
        }

        // --allow-prod é uma flag de ambiente, não vira opção de comando
        const cmdArgs = args.filter(a => a !== '--allow-prod');
        const command = cmdArgs[0];

        if (!command) {
            usage();
            return;
        }

        try {
            const opts = parseArgs(cmdArgs.slice(1));
            switch (command) {
                case 'create-admin':
                    await createAdmin(opts);
                    break;
                case 'list-users':
                    await listUsers();
                    break;
                case 'approve-user':
                    await approveUser(opts);
                    break;
                case 'reset-password':
                    await resetPassword(opts);
                    break;
                default:
                    log('red', `❌ Comando inválido: ${command}`);
                    usage();
            }
        } catch (parseError) {
            log('red', `❌ ${parseError.message}`);
            usage();
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
