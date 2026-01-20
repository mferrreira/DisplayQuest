import { prisma } from '@/lib/database/prisma';
import { User } from '../models/user/User';
import { UserRole } from '@prisma/client';

// Define ProfileVisibility locally since it might not be generated yet
export type ProfileVisibility = 'public' | 'members_only' | 'private';

export interface IUserRepository {
    findById(id: number): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findAll(): Promise<User[]>;
    findByStatus(status: string): Promise<User[]>;
    findByRole(role: UserRole): Promise<User[]>;
    findByProfileVisibility(visibility: ProfileVisibility): Promise<User[]>;
    create(user: User): Promise<User>;
    update(user: User): Promise<User>;
    delete(id: number): Promise<void>;
    findActive(): Promise<User[]>;
    findPending(): Promise<User[]>;
    findRejected(): Promise<User[]>;
    findSuspended(): Promise<User[]>;
    findInactive(): Promise<User[]>;
    findWithRoles(roles: UserRole[]): Promise<User[]>;
    findTopByPoints(limit?: number): Promise<User[]>;
    findTopByTasks(limit?: number): Promise<User[]>;
    findRecent(limit?: number): Promise<User[]>;
    searchUsers(query: string): Promise<User[]>;
    getUserStatistics(): Promise<{
        total: number;
        active: number;
        pending: number;
        rejected: number;
        suspended: number;
        inactive: number;
        totalPoints: number;
        totalTasks: number;
        averagePoints: number;
        averageTasks: number;
    }>;
    getUsersByRole(): Promise<Record<UserRole, number>>;
    getUsersByStatus(): Promise<Record<string, number>>;
    getUserProjectsCount(userId: number): Promise<number>;
    getUserWorkSessionsCount(userId: number): Promise<number>;
    getUserAverageWeeklyHours(userId: number): Promise<number>;
    getUserMaxConsecutiveDays(userId: number): Promise<number>;
    getUserProjectMemberships(userId: number): Promise<{ projectId: number }[]>;
}

export class UserRepository implements IUserRepository {
    private getIncludeOptions() {
        return {
            // Only include relations that actually exist in the schema
            daily_logs: true,
            lab_events: true,
            lab_responsibilities: true,
            projectMemberships: {
                include: {
                    project: true
                }
            },
            projects: true,
            purchases: true,
            tasks: true,
            schedules: true,
            weekly_hours_history: true,
            weekly_reports: true,
            work_sessions: true,
        };
    }

    async findById(id: number): Promise<User | null> {
        const user = await prisma.users.findUnique({
            where: { id },
            include: this.getIncludeOptions()
        });

        return user ? User.fromPrisma(user) : null;
    }

    async findByEmail(email: string): Promise<User | null> {
        const user = await prisma.users.findUnique({
            where: { email: email.toLowerCase() },
            include: this.getIncludeOptions()
        });

        return user ? User.fromPrisma(user) : null;
    }

    async findAll(): Promise<User[]> {
        const users = await prisma.users.findMany({
            include: this.getIncludeOptions(),
            orderBy: { createdAt: 'desc' }
        });

        return users.map(user => User.fromPrisma(user));
    }

    async findByStatus(status: string): Promise<User[]> {
        const users = await prisma.users.findMany({
            where: { status },
            include: this.getIncludeOptions(),
            orderBy: { createdAt: 'desc' }
        });

        return users.map(user => User.fromPrisma(user));
    }

    async findByRole(role: UserRole): Promise<User[]> {
        const users = await prisma.users.findMany({
            where: { roles: { has: role } },
            include: this.getIncludeOptions(),
            orderBy: { createdAt: 'desc' }
        });

        return users.map(user => User.fromPrisma(user));
    }

    async findByProfileVisibility(visibility: ProfileVisibility): Promise<User[]> {
        // Temporarily return all users until ProfileVisibility is properly generated
        const users = await prisma.users.findMany({
            include: this.getIncludeOptions(),
            orderBy: { createdAt: 'desc' }
        });

        return users.map(user => User.fromPrisma(user));
    }

    async create(user: User): Promise<User> {
        const data = user.toPrisma();
        const created = await prisma.users.create({
            data,
            include: this.getIncludeOptions()
        });

        return User.fromPrisma(created);
    }

    async update(user: User): Promise<User> {
        if (!user.id) {
            throw new Error("User ID é obrigatório para atualização");
        }

        const data = user.toPrisma();
        

        const updated = await prisma.users.update({
            where: { id: user.id },
            data,
            include: this.getIncludeOptions()
        });
        return User.fromPrisma(updated);
    }

    async delete(id: number): Promise<void> {
        await prisma.users.delete({
            where: { id }
        });
    }

    async findActive(): Promise<User[]> {
        return await this.findByStatus('active');
    }

    async findPending(): Promise<User[]> {
        return await this.findByStatus('pending');
    }

    async findRejected(): Promise<User[]> {
        return await this.findByStatus('rejected');
    }

    async findSuspended(): Promise<User[]> {
        return await this.findByStatus('suspended');
    }

    async findInactive(): Promise<User[]> {
        return await this.findByStatus('inactive');
    }

    async findWithRoles(roles: UserRole[]): Promise<User[]> {
        const users = await prisma.users.findMany({
            where: {
                roles: {
                    hasSome: roles
                }
            },
            include: this.getIncludeOptions(),
            orderBy: { createdAt: 'desc' }
        });

        return users.map(user => User.fromPrisma(user));
    }

    async findTopByPoints(limit: number = 10): Promise<User[]> {
        const users = await prisma.users.findMany({
            where: { status: 'active' },
            include: this.getIncludeOptions(),
            orderBy: { points: 'desc' },
            take: limit
        });

        return users.map(user => User.fromPrisma(user));
    }

    async findTopByTasks(limit: number = 10): Promise<User[]> {
        const users = await prisma.users.findMany({
            where: { status: 'active' },
            include: this.getIncludeOptions(),
            orderBy: { completedTasks: 'desc' },
            take: limit
        });

        return users.map(user => User.fromPrisma(user));
    }

    async findRecent(limit: number = 10): Promise<User[]> {
        const users = await prisma.users.findMany({
            include: this.getIncludeOptions(),
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        return users.map(user => User.fromPrisma(user));
    }

    async searchUsers(query: string): Promise<User[]> {
        const users = await prisma.users.findMany({
            where: {
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { email: { contains: query, mode: 'insensitive' } }
                ]
            },
            include: this.getIncludeOptions(),
            orderBy: { name: 'asc' }
        });

        return users.map(user => User.fromPrisma(user));
    }

    async getUserStatistics(): Promise<{
        total: number;
        active: number;
        pending: number;
        rejected: number;
        suspended: number;
        inactive: number;
        totalPoints: number;
        totalTasks: number;
        averagePoints: number;
        averageTasks: number;
    }> {
        const allUsers = await this.findAll();
        
        const total = allUsers.length;
        const active = allUsers.filter(u => u.status === 'active').length;
        const pending = allUsers.filter(u => u.status === 'pending').length;
        const rejected = allUsers.filter(u => u.status === 'rejected').length;
        const suspended = allUsers.filter(u => u.status === 'suspended').length;
        const inactive = allUsers.filter(u => u.status === 'inactive').length;

        const totalPoints = allUsers.reduce((sum, user) => sum + user.points, 0);
        const totalTasks = allUsers.reduce((sum, user) => sum + user.completedTasks, 0);
        const averagePoints = total > 0 ? Math.round(totalPoints / total) : 0;
        const averageTasks = total > 0 ? Math.round(totalTasks / total) : 0;

        return {
            total,
            active,
            pending,
            rejected,
            suspended,
            inactive,
            totalPoints,
            totalTasks,
            averagePoints,
            averageTasks
        };
    }

    async getUsersByRole(): Promise<Record<UserRole, number>> {
        const allUsers = await this.findAll();
        
        const roleCounts: Record<UserRole, number> = {
            'COORDENADOR': 0,
            'GERENTE': 0,
            'LABORATORISTA': 0,
            'PESQUISADOR': 0,
            'GERENTE_PROJETO': 0,
            'COLABORADOR': 0,
            'VOLUNTARIO': 0
        };

        for (const user of allUsers) {
            for (const role of user.roles) {
                roleCounts[role]++;
            }
        }

        return roleCounts;
    }

    async getUsersByStatus(): Promise<Record<string, number>> {
        const allUsers = await this.findAll();
        
        const statusCounts: Record<string, number> = {
            'active': 0,
            'pending': 0,
            'rejected': 0,
            'suspended': 0,
            'inactive': 0
        };

        for (const user of allUsers) {
            statusCounts[user.status]++;
        }

        return statusCounts;
    }

    async getUserProjectsCount(userId: number): Promise<number> {
        try {
            const count = await prisma.project_members.count({
                where: { userId }
            });
            return count;
        } catch (error) {
            console.error(`Error getting projects count for user ${userId}:`, error);
            return 0;
        }
    }

    async getUserWorkSessionsCount(userId: number): Promise<number> {
        try {
            const count = await prisma.work_sessions.count({
                where: { userId }
            });
            return count;
        } catch (error) {
            console.error(`Error getting work sessions count for user ${userId}:`, error);
            return 0;
        }
    }

    async getUserAverageWeeklyHours(userId: number): Promise<number> {
        try {
            // Get the last 4 weeks of weekly hours history
            const weeklyHours = await prisma.weekly_hours_history.findMany({
                where: { userId },
                orderBy: { weekStart: 'desc' },
                take: 4
            });

            if (weeklyHours.length === 0) {
                return 0;
            }

            const totalHours = weeklyHours.reduce((sum, week) => sum + week.totalHours, 0);
            return totalHours / weeklyHours.length;
        } catch (error) {
            console.error(`Error getting average weekly hours for user ${userId}:`, error);
            return 0;
        }
    }

    async getUserMaxConsecutiveDays(userId: number): Promise<number> {
        try {
            // Get daily logs ordered by date
            const dailyLogs = await prisma.daily_logs.findMany({
                where: { userId },
                orderBy: { date: 'asc' }
            });

            if (dailyLogs.length === 0) {
                return 0;
            }

            let maxConsecutive = 0;
            let currentConsecutive = 1;

            for (let i = 1; i < dailyLogs.length; i++) {
                const prevDate = new Date(dailyLogs[i - 1].date);
                const currentDate = new Date(dailyLogs[i].date);
                const diffTime = currentDate.getTime() - prevDate.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    currentConsecutive++;
                } else {
                    maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
                    currentConsecutive = 1;
                }
            }

            return Math.max(maxConsecutive, currentConsecutive);
        } catch (error) {
            console.error(`Error getting max consecutive days for user ${userId}:`, error);
            return 0;
        }
    }

    async getUsers(options: { search?: string; excludeProjectId?: number } = {}): Promise<User[]> {
        const whereConditions: any = {
            status: 'active' // Apenas usuários ativos
        };

        // Adicionar busca por nome ou email se fornecida
        if (options.search) {
            whereConditions.OR = [
                { name: { contains: options.search, mode: 'insensitive' } },
                { email: { contains: options.search, mode: 'insensitive' } }
            ];
        }

        // Excluir usuários que já são membros do projeto se excludeProjectId for fornecido
        if (options.excludeProjectId) {
            whereConditions.NOT = {
                projectMemberships: {
                    some: {
                        projectId: options.excludeProjectId
                    }
                }
            };
        }

        const users = await prisma.users.findMany({
            where: whereConditions,
            include: this.getIncludeOptions(),
            orderBy: { name: 'asc' }
        });

        return users.map(user => User.fromPrisma(user));
    }

    async getUserProjectMemberships(userId: number): Promise<{ projectId: number }[]> {
        const memberships = await prisma.project_members.findMany({
            where: { userId },
            select: { projectId: true }
        });
        return memberships;
    }
}
