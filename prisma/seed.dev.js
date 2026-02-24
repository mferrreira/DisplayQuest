"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var bcryptjs_1 = require("bcryptjs");
var prisma = new client_1.PrismaClient();
function findOrCreate(delegate, where, data) {
    return __awaiter(this, void 0, void 0, function () {
        var existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, delegate.findFirst({ where: where })];
                case 1:
                    existing = _a.sent();
                    if (existing) {
                        return [2 /*return*/, existing];
                    }
                    return [2 /*return*/, delegate.create({ data: data })];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var roles, password, createdUsers, _i, roles_1, role, user, coordenador, usersByEmail, baseDate_1, futureDate, mentoringSession, researchSession, createdProjects, _a, createdProjects_1, project, _b, createdUsers_1, user, createdProjectsMap, labSystemProject, iaProject, automationProject, weeklyReportsData, _c, weeklyReportsData_1, report, weeklyHoursData, _d, weeklyHoursData_1, week, responsibilities, _e, responsibilities_1, responsibility, labSchedules, _f, labSchedules_1, schedule, badges, createdBadges, _g, badges_1, badge, existing, created, _h, createdBadges_1, badge, rewards, purchases, _loop_1, _j, purchases_1, purchase, issuesData, _k, issuesData_1, issue, notificationsData, _l, notificationsData_1, notification, labEvents, _m, labEvents_1, event_1;
        var _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1;
        return __generator(this, function (_2) {
            switch (_2.label) {
                case 0:
                    roles = [
                        { key: 'COORDENADOR', email: 'coordenador@lab.com', name: 'Coordenador', weekHours: 40 },
                        { key: 'GERENTE', email: 'gerente@lab.com', name: 'Gerente', weekHours: 40 },
                        { key: 'LABORATORISTA', email: 'laboratorista@lab.com', name: 'Laboratorista', weekHours: 40 },
                        { key: 'PESQUISADOR', email: 'pesquisador@lab.com', name: 'Pesquisador', weekHours: 40 },
                        { key: 'GERENTE_PROJETO', email: 'gerente_projeto@lab.com', name: 'Gerente de Projeto', weekHours: 40 },
                        { key: 'COLABORADOR', email: 'colaborador@lab.com', name: 'Colaborador', weekHours: 20 },
                    ];
                    return [4 /*yield*/, bcryptjs_1.default.hash('123', 10)];
                case 1:
                    password = _2.sent();
                    createdUsers = [];
                    _i = 0, roles_1 = roles;
                    _2.label = 2;
                case 2:
                    if (!(_i < roles_1.length)) return [3 /*break*/, 5];
                    role = roles_1[_i];
                    return [4 /*yield*/, prisma.users.upsert({
                            where: { email: role.email },
                            update: {
                                password: password,
                                roles: [role.key],
                                status: 'active',
                                name: role.name,
                                weekHours: role.weekHours,
                            },
                            create: {
                                email: role.email,
                                password: password,
                                roles: [role.key],
                                status: 'active',
                                name: role.name,
                                weekHours: role.weekHours,
                            },
                        })];
                case 3:
                    user = _2.sent();
                    createdUsers.push(user);
                    _2.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: 
                // Rewards
                return [4 /*yield*/, prisma.rewards.createMany({
                        data: [
                            { name: 'Café', description: 'Uma xícara de café', price: 10, available: true },
                            { name: 'Caneca', description: 'Caneca personalizada do laboratório', price: 50, available: true },
                            { name: 'Camiseta', description: 'Camiseta do laboratório', price: 100, available: true },
                        ],
                        skipDuplicates: true,
                    })];
                case 6:
                    // Rewards
                    _2.sent();
                    coordenador = createdUsers.find(function (u) { return u.email === 'coordenador@lab.com'; });
                    if (!coordenador) return [3 /*break*/, 62];
                    usersByEmail = Object.fromEntries(createdUsers.map(function (user) { return [user.email, user]; }));
                    baseDate_1 = new Date('2025-01-13T12:00:00.000Z');
                    futureDate = function (days) {
                        var date = new Date(baseDate_1);
                        date.setDate(date.getDate() + days);
                        return date;
                    };
                    return [4 /*yield*/, prisma.user_schedules.createMany({
                            data: [
                                { userId: coordenador.id, dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
                                { userId: coordenador.id, dayOfWeek: 3, startTime: '14:00', endTime: '18:00' },
                            ],
                            skipDuplicates: true,
                        })];
                case 7:
                    _2.sent();
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.work_sessions.findFirst(args); },
                            create: function (args) { return prisma.work_sessions.create(args); },
                        }, {
                            userId: coordenador.id,
                            activity: 'Mentoria com equipe',
                            startTime: new Date('2025-01-12T14:00:00.000Z'),
                        }, {
                            userId: coordenador.id,
                            userName: 'Coordenador',
                            activity: 'Mentoria com equipe',
                            status: 'completed',
                            startTime: new Date('2025-01-12T14:00:00.000Z'),
                            endTime: new Date('2025-01-12T15:30:00.000Z'),
                            duration: 90,
                            projectId: undefined,
                            location: 'Sala 01',
                        })];
                case 8:
                    mentoringSession = _2.sent();
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.work_sessions.findFirst(args); },
                            create: function (args) { return prisma.work_sessions.create(args); },
                        }, {
                            userId: coordenador.id,
                            activity: 'Pesquisa estratégica',
                            startTime: new Date('2025-01-14T10:00:00.000Z'),
                        }, {
                            userId: coordenador.id,
                            userName: 'Coordenador',
                            activity: 'Pesquisa estratégica',
                            status: 'completed',
                            startTime: new Date('2025-01-14T10:00:00.000Z'),
                            endTime: new Date('2025-01-14T12:00:00.000Z'),
                            duration: 120,
                            projectId: undefined,
                            location: 'Biblioteca',
                        })];
                case 9:
                    researchSession = _2.sent();
                    // Projects (for coordenador)
                    return [4 /*yield*/, prisma.projects.createMany({
                            data: [
                                {
                                    name: 'Sistema de Gestão de Laboratório',
                                    description: 'Desenvolvimento de um sistema completo para gestão de laboratório de pesquisa',
                                    createdAt: new Date().toISOString(),
                                    createdBy: coordenador.id,
                                    leaderId: coordenador.id,
                                    status: 'active',
                                    links: [
                                        { label: 'GitHub', url: 'https://github.com/lab/sistema-gestao' },
                                        { label: 'Documentação', url: 'https://docs.lab.com' },
                                    ],
                                },
                                {
                                    name: 'Pesquisa em IA',
                                    description: 'Projeto de pesquisa em inteligência artificial aplicada',
                                    createdAt: new Date().toISOString(),
                                    createdBy: coordenador.id,
                                    leaderId: (_o = createdUsers.find(function (u) { return u.email === 'pesquisador@lab.com'; })) === null || _o === void 0 ? void 0 : _o.id,
                                    status: 'active',
                                    links: [
                                        { label: 'Repositório', url: 'https://github.com/lab/ia-research' },
                                    ],
                                },
                                {
                                    name: 'Automação de Processos',
                                    description: 'Automação de processos administrativos do laboratório',
                                    createdAt: new Date().toISOString(),
                                    createdBy: coordenador.id,
                                    leaderId: (_p = createdUsers.find(function (u) { return u.email === 'gerente@lab.com'; })) === null || _p === void 0 ? void 0 : _p.id,
                                    status: 'on_hold',
                                    links: [],
                                }
                            ],
                            skipDuplicates: true,
                        })];
                case 10:
                    // Projects (for coordenador)
                    _2.sent();
                    return [4 /*yield*/, prisma.projects.findMany({
                            where: { createdBy: coordenador.id }
                        })];
                case 11:
                    createdProjects = _2.sent();
                    _a = 0, createdProjects_1 = createdProjects;
                    _2.label = 12;
                case 12:
                    if (!(_a < createdProjects_1.length)) return [3 /*break*/, 17];
                    project = createdProjects_1[_a];
                    _b = 0, createdUsers_1 = createdUsers;
                    _2.label = 13;
                case 13:
                    if (!(_b < createdUsers_1.length)) return [3 /*break*/, 16];
                    user = createdUsers_1[_b];
                    return [4 /*yield*/, prisma.project_members.upsert({
                            where: {
                                projectId_userId: {
                                    projectId: project.id,
                                    userId: user.id
                                }
                            },
                            update: {},
                            create: {
                                projectId: project.id,
                                userId: user.id,
                                roles: user.roles
                            }
                        })];
                case 14:
                    _2.sent();
                    _2.label = 15;
                case 15:
                    _b++;
                    return [3 /*break*/, 13];
                case 16:
                    _a++;
                    return [3 /*break*/, 12];
                case 17:
                    createdProjectsMap = Object.fromEntries(createdProjects.map(function (project) { return [project.name, project]; }));
                    labSystemProject = createdProjectsMap['Sistema de Gestão de Laboratório'];
                    iaProject = createdProjectsMap['Pesquisa em IA'];
                    automationProject = createdProjectsMap['Automação de Processos'];
                    return [4 /*yield*/, prisma.tasks.createMany({
                            data: [
                                {
                                    title: 'Configurar CI/CD',
                                    description: 'Pipeline automatizada no GitHub Actions',
                                    status: 'in_progress',
                                    priority: 'high',
                                    assignedTo: (_q = usersByEmail['gerente@lab.com']) === null || _q === void 0 ? void 0 : _q.id,
                                    projectId: labSystemProject === null || labSystemProject === void 0 ? void 0 : labSystemProject.id,
                                    dueDate: futureDate(5).toISOString(),
                                    points: 40,
                                    taskVisibility: 'delegated',
                                    isGlobal: false,
                                },
                                {
                                    title: 'Auditoria de dados',
                                    description: 'Garantir consistência das métricas históricas',
                                    status: 'pending',
                                    priority: 'medium',
                                    assignedTo: (_r = usersByEmail['laboratorista@lab.com']) === null || _r === void 0 ? void 0 : _r.id,
                                    projectId: labSystemProject === null || labSystemProject === void 0 ? void 0 : labSystemProject.id,
                                    dueDate: futureDate(10).toISOString(),
                                    points: 25,
                                    taskVisibility: 'delegated',
                                    isGlobal: false,
                                },
                                {
                                    title: 'Protótipo de modelo IA',
                                    description: 'Primeira versão do classificador',
                                    status: 'in_progress',
                                    priority: 'high',
                                    assignedTo: (_s = usersByEmail['pesquisador@lab.com']) === null || _s === void 0 ? void 0 : _s.id,
                                    projectId: iaProject === null || iaProject === void 0 ? void 0 : iaProject.id,
                                    dueDate: futureDate(8).toISOString(),
                                    points: 60,
                                    taskVisibility: 'public',
                                    isGlobal: false,
                                },
                                {
                                    title: 'Documentação de APIs',
                                    description: 'Atualizar referências públicas',
                                    status: 'pending',
                                    priority: 'low',
                                    assignedTo: (_t = usersByEmail['colaborador@lab.com']) === null || _t === void 0 ? void 0 : _t.id,
                                    projectId: automationProject === null || automationProject === void 0 ? void 0 : automationProject.id,
                                    dueDate: futureDate(12).toISOString(),
                                    points: 15,
                                    taskVisibility: 'delegated',
                                    isGlobal: false,
                                },
                                {
                                    title: 'Checklist do laboratório',
                                    description: 'Criar checklist público diário',
                                    status: 'completed',
                                    priority: 'medium',
                                    assignedTo: (_u = usersByEmail['gerente_projeto@lab.com']) === null || _u === void 0 ? void 0 : _u.id,
                                    projectId: null,
                                    dueDate: futureDate(-2).toISOString(),
                                    points: 20,
                                    taskVisibility: 'public',
                                    isGlobal: true,
                                },
                            ],
                            skipDuplicates: true,
                        })];
                case 18:
                    _2.sent();
                    return [4 /*yield*/, prisma.daily_logs.createMany({
                            data: [
                                {
                                    userId: coordenador.id,
                                    projectId: labSystemProject === null || labSystemProject === void 0 ? void 0 : labSystemProject.id,
                                    date: new Date('2025-01-12T16:00:00.000Z'),
                                    note: 'Planejamento semanal com toda a equipe.',
                                    workSessionId: mentoringSession.id,
                                },
                                {
                                    userId: (_w = (_v = usersByEmail['pesquisador@lab.com']) === null || _v === void 0 ? void 0 : _v.id) !== null && _w !== void 0 ? _w : 0,
                                    projectId: iaProject === null || iaProject === void 0 ? void 0 : iaProject.id,
                                    date: new Date('2025-01-14T18:00:00.000Z'),
                                    note: 'Treinamento inicial do modelo com dataset sintético.',
                                    workSessionId: researchSession.id,
                                },
                            ],
                            skipDuplicates: true,
                        })];
                case 19:
                    _2.sent();
                    weeklyReportsData = [
                        {
                            user: coordenador,
                            weekStart: new Date('2025-01-06T03:00:00.000Z'),
                            weekEnd: new Date('2025-01-12T23:59:59.000Z'),
                            totalLogs: 6,
                            summary: 'Semana focada em alinhar projetos e remover impedimentos.',
                        },
                        {
                            user: usersByEmail['pesquisador@lab.com'],
                            weekStart: new Date('2025-01-06T03:00:00.000Z'),
                            weekEnd: new Date('2025-01-12T23:59:59.000Z'),
                            totalLogs: 4,
                            summary: 'Experimentos de IA e coleta de métricas.',
                        },
                    ].filter(function (item) { return Boolean(item.user); });
                    _c = 0, weeklyReportsData_1 = weeklyReportsData;
                    _2.label = 20;
                case 20:
                    if (!(_c < weeklyReportsData_1.length)) return [3 /*break*/, 23];
                    report = weeklyReportsData_1[_c];
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.weekly_reports.findFirst(args); },
                            create: function (args) { return prisma.weekly_reports.create(args); },
                        }, { userId: report.user.id, weekStart: report.weekStart }, {
                            userId: report.user.id,
                            userName: report.user.name,
                            weekStart: report.weekStart,
                            weekEnd: report.weekEnd,
                            totalLogs: report.totalLogs,
                            summary: report.summary,
                        })];
                case 21:
                    _2.sent();
                    _2.label = 22;
                case 22:
                    _c++;
                    return [3 /*break*/, 20];
                case 23:
                    weeklyHoursData = [
                        {
                            user: coordenador,
                            weekStart: new Date('2025-01-06T03:00:00.000Z'),
                            weekEnd: new Date('2025-01-12T23:59:59.000Z'),
                            totalHours: 38,
                        },
                        {
                            user: usersByEmail['gerente@lab.com'],
                            weekStart: new Date('2025-01-06T03:00:00.000Z'),
                            weekEnd: new Date('2025-01-12T23:59:59.000Z'),
                            totalHours: 35,
                        },
                    ].filter(function (item) { return Boolean(item.user); });
                    _d = 0, weeklyHoursData_1 = weeklyHoursData;
                    _2.label = 24;
                case 24:
                    if (!(_d < weeklyHoursData_1.length)) return [3 /*break*/, 27];
                    week = weeklyHoursData_1[_d];
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.weekly_hours_history.findFirst(args); },
                            create: function (args) { return prisma.weekly_hours_history.create(args); },
                        }, { userId: week.user.id, weekStart: week.weekStart }, {
                            userId: week.user.id,
                            userName: week.user.name,
                            weekStart: week.weekStart,
                            weekEnd: week.weekEnd,
                            totalHours: week.totalHours,
                        })];
                case 25:
                    _2.sent();
                    _2.label = 26;
                case 26:
                    _d++;
                    return [3 /*break*/, 24];
                case 27:
                    responsibilities = [
                        {
                            user: usersByEmail['gerente@lab.com'],
                            startTime: '2025-01-10T08:00:00.000Z',
                            endTime: '2025-01-10T12:00:00.000Z',
                            notes: 'Supervisão da bancada de química.',
                        },
                        {
                            user: usersByEmail['laboratorista@lab.com'],
                            startTime: '2025-01-11T13:00:00.000Z',
                            endTime: '2025-01-11T17:00:00.000Z',
                            notes: 'Controle de estoque reagentes.',
                        },
                    ].filter(function (item) { return Boolean(item.user); });
                    _e = 0, responsibilities_1 = responsibilities;
                    _2.label = 28;
                case 28:
                    if (!(_e < responsibilities_1.length)) return [3 /*break*/, 31];
                    responsibility = responsibilities_1[_e];
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.lab_responsibilities.findFirst(args); },
                            create: function (args) { return prisma.lab_responsibilities.create(args); },
                        }, { userId: responsibility.user.id, startTime: responsibility.startTime }, {
                            userId: responsibility.user.id,
                            userName: responsibility.user.name,
                            startTime: responsibility.startTime,
                            endTime: responsibility.endTime,
                            notes: responsibility.notes,
                        })];
                case 29:
                    _2.sent();
                    _2.label = 30;
                case 30:
                    _e++;
                    return [3 /*break*/, 28];
                case 31:
                    labSchedules = [
                        { dayOfWeek: 1, startTime: '08:00', endTime: '18:00', notes: 'Operação regular.' },
                        { dayOfWeek: 3, startTime: '08:00', endTime: '18:00', notes: 'Entregas de insumos.' },
                        { dayOfWeek: 5, startTime: '08:00', endTime: '16:00', notes: 'Limpeza geral.' },
                    ];
                    _f = 0, labSchedules_1 = labSchedules;
                    _2.label = 32;
                case 32:
                    if (!(_f < labSchedules_1.length)) return [3 /*break*/, 35];
                    schedule = labSchedules_1[_f];
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.laboratory_schedules.findFirst(args); },
                            create: function (args) { return prisma.laboratory_schedules.create(args); },
                        }, { dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime }, schedule)];
                case 33:
                    _2.sent();
                    _2.label = 34;
                case 34:
                    _f++;
                    return [3 /*break*/, 32];
                case 35:
                    badges = [
                        {
                            name: 'Mentor da Semana',
                            description: 'Concedido para quem orienta a equipe.',
                            icon: '⭐️',
                            color: '#5B8DEF',
                            category: 'achievement',
                        },
                        {
                            name: 'Guardião do Laboratório',
                            description: 'Entrega impecável nas rotinas do laboratório.',
                            icon: '🧪',
                            color: '#2EC4B6',
                            category: 'milestone',
                        },
                    ];
                    createdBadges = [];
                    _g = 0, badges_1 = badges;
                    _2.label = 36;
                case 36:
                    if (!(_g < badges_1.length)) return [3 /*break*/, 40];
                    badge = badges_1[_g];
                    return [4 /*yield*/, prisma.badges.findFirst({ where: { name: badge.name } })];
                case 37:
                    existing = _2.sent();
                    if (existing) {
                        createdBadges.push(existing);
                        return [3 /*break*/, 39];
                    }
                    return [4 /*yield*/, prisma.badges.create({
                            data: __assign(__assign({}, badge), { criteria: { minHours: 10 }, createdBy: coordenador.id }),
                        })];
                case 38:
                    created = _2.sent();
                    createdBadges.push(created);
                    _2.label = 39;
                case 39:
                    _g++;
                    return [3 /*break*/, 36];
                case 40:
                    _h = 0, createdBadges_1 = createdBadges;
                    _2.label = 41;
                case 41:
                    if (!(_h < createdBadges_1.length)) return [3 /*break*/, 44];
                    badge = createdBadges_1[_h];
                    return [4 /*yield*/, prisma.user_badges.upsert({
                            where: {
                                userId_badgeId: {
                                    userId: badge.name === 'Mentor da Semana' ? coordenador.id : (_y = (_x = usersByEmail['laboratorista@lab.com']) === null || _x === void 0 ? void 0 : _x.id) !== null && _y !== void 0 ? _y : coordenador.id,
                                    badgeId: badge.id,
                                },
                            },
                            update: {},
                            create: {
                                userId: badge.name === 'Mentor da Semana' ? coordenador.id : (_0 = (_z = usersByEmail['laboratorista@lab.com']) === null || _z === void 0 ? void 0 : _z.id) !== null && _0 !== void 0 ? _0 : coordenador.id,
                                badgeId: badge.id,
                                earnedBy: coordenador.id,
                            },
                        })];
                case 42:
                    _2.sent();
                    _2.label = 43;
                case 43:
                    _h++;
                    return [3 /*break*/, 41];
                case 44: return [4 /*yield*/, prisma.rewards.findMany()];
                case 45:
                    rewards = _2.sent();
                    purchases = [
                        {
                            user: coordenador,
                            rewardName: 'Café',
                            purchaseDate: '2025-01-09',
                            status: 'delivered',
                        },
                        {
                            user: usersByEmail['colaborador@lab.com'],
                            rewardName: 'Caneca',
                            purchaseDate: '2025-01-10',
                            status: 'processing',
                        },
                    ].filter(function (purchase) { return Boolean(purchase.user); });
                    _loop_1 = function (purchase) {
                        var reward;
                        return __generator(this, function (_3) {
                            switch (_3.label) {
                                case 0:
                                    reward = rewards.find(function (item) { return item.name === purchase.rewardName; });
                                    if (!reward)
                                        return [2 /*return*/, "continue"];
                                    return [4 /*yield*/, findOrCreate({
                                            findFirst: function (args) { return prisma.purchases.findFirst(args); },
                                            create: function (args) { return prisma.purchases.create(args); },
                                        }, { userId: purchase.user.id, rewardId: reward.id, purchaseDate: purchase.purchaseDate }, {
                                            userId: purchase.user.id,
                                            rewardId: reward.id,
                                            rewardName: reward.name,
                                            price: reward.price,
                                            purchaseDate: purchase.purchaseDate,
                                            status: purchase.status,
                                        })];
                                case 1:
                                    _3.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _j = 0, purchases_1 = purchases;
                    _2.label = 46;
                case 46:
                    if (!(_j < purchases_1.length)) return [3 /*break*/, 49];
                    purchase = purchases_1[_j];
                    return [5 /*yield**/, _loop_1(purchase)];
                case 47:
                    _2.sent();
                    _2.label = 48;
                case 48:
                    _j++;
                    return [3 /*break*/, 46];
                case 49:
                    issuesData = [
                        {
                            title: 'Dashboard não carrega filtros',
                            description: 'Erro ao aplicar filtros combinados.',
                            status: 'open',
                            priority: 'high',
                            category: 'frontend',
                            reporter: usersByEmail['colaborador@lab.com'],
                            assignee: usersByEmail['gerente@lab.com'],
                        },
                        {
                            title: 'Script de backup intermitente',
                            description: 'Backups falham em execuções noturnas.',
                            status: 'in_progress',
                            priority: 'urgent',
                            category: 'infra',
                            reporter: coordenador,
                            assignee: usersByEmail['gerente_projeto@lab.com'],
                        },
                    ].filter(function (issue) { return Boolean(issue.reporter); });
                    _k = 0, issuesData_1 = issuesData;
                    _2.label = 50;
                case 50:
                    if (!(_k < issuesData_1.length)) return [3 /*break*/, 53];
                    issue = issuesData_1[_k];
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.issues.findFirst(args); },
                            create: function (args) { return prisma.issues.create(args); },
                        }, { title: issue.title }, {
                            title: issue.title,
                            description: issue.description,
                            status: issue.status,
                            priority: issue.priority,
                            category: issue.category,
                            reporterId: issue.reporter.id,
                            assigneeId: (_1 = issue.assignee) === null || _1 === void 0 ? void 0 : _1.id,
                        })];
                case 51:
                    _2.sent();
                    _2.label = 52;
                case 52:
                    _k++;
                    return [3 /*break*/, 50];
                case 53:
                    notificationsData = [
                        {
                            user: usersByEmail['gerente@lab.com'],
                            type: 'task',
                            title: 'Nova tarefa de automação',
                            message: 'Você foi designado para "Configurar CI/CD".',
                            data: JSON.stringify({ taskId: 'ci-cd' }),
                        },
                        {
                            user: usersByEmail['pesquisador@lab.com'],
                            type: 'reminder',
                            title: 'Atualize seu relatório semanal',
                            message: 'Envie o resumo até sexta-feira.',
                            data: JSON.stringify({ deadline: futureDate(3).toISOString() }),
                        },
                    ].filter(function (notification) { return Boolean(notification.user); });
                    _l = 0, notificationsData_1 = notificationsData;
                    _2.label = 54;
                case 54:
                    if (!(_l < notificationsData_1.length)) return [3 /*break*/, 57];
                    notification = notificationsData_1[_l];
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.notifications.findFirst(args); },
                            create: function (args) { return prisma.notifications.create(args); },
                        }, { userId: notification.user.id, title: notification.title }, {
                            userId: notification.user.id,
                            type: notification.type,
                            title: notification.title,
                            message: notification.message,
                            data: notification.data,
                        })];
                case 55:
                    _2.sent();
                    _2.label = 56;
                case 56:
                    _l++;
                    return [3 /*break*/, 54];
                case 57: return [4 /*yield*/, findOrCreate({
                        findFirst: function (args) { return prisma.kanban_boards.findFirst(args); },
                        create: function (args) { return prisma.kanban_boards.create(args); },
                    }, { name: 'Fluxo principal', labId: 1 }, { name: 'Fluxo principal', labId: 1 })];
                case 58:
                    _2.sent();
                    labEvents = [
                        {
                            user: coordenador,
                            date: new Date('2025-01-15T18:00:00.000Z'),
                            note: 'Demo interna do sistema.',
                        },
                        {
                            user: usersByEmail['gerente@lab.com'],
                            date: new Date('2025-01-16T12:00:00.000Z'),
                            note: 'Treinamento segurança.',
                        },
                    ].filter(function (event) { return Boolean(event.user); });
                    _m = 0, labEvents_1 = labEvents;
                    _2.label = 59;
                case 59:
                    if (!(_m < labEvents_1.length)) return [3 /*break*/, 62];
                    event_1 = labEvents_1[_m];
                    return [4 /*yield*/, findOrCreate({
                            findFirst: function (args) { return prisma.lab_events.findFirst(args); },
                            create: function (args) { return prisma.lab_events.create(args); },
                        }, { userId: event_1.user.id, date: event_1.date }, {
                            userId: event_1.user.id,
                            userName: event_1.user.name,
                            date: event_1.date,
                            note: event_1.note,
                        })];
                case 60:
                    _2.sent();
                    _2.label = 61;
                case 61:
                    _m++;
                    return [3 /*break*/, 59];
                case 62: return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
