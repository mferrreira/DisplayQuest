import { Project, IProject, ProjectStatus } from '../models/Project';
import { ProjectMembership, IProjectMembership } from '../models/ProjectMembership';
import { ProjectRepository, IProjectRepository } from '../repositories/ProjectRepository';
import { ProjectMembershipRepository, IProjectMembershipRepository } from '../repositories/ProjectMembershipRepository';
import { UserRepository } from '../repositories/UserRepository';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/database/prisma';
import { createIdentityAccessModule, IdentityAccessModule } from '@/backend/modules/identity-access';

interface CreateProjectOptions {
    volunteerIds?: number[];
}

export interface IProjectService {
    findById(id: number): Promise<Project | null>;
    findAll(): Promise<Project[]>;
    findByUserId(userId: number): Promise<Project[]>;
    findByCreatorId(creatorId: number): Promise<Project[]>;
    create(data: Omit<IProject, 'id' | 'createdAt'>, creatorId: number, options?: CreateProjectOptions): Promise<Project>;
    update(id: number, data: Partial<IProject>, userId: number): Promise<Project>;
    delete(id: number, userId: number): Promise<void>;
    
    addMemberToProject(projectId: number, userId: number, roles: UserRole[], addedBy: number): Promise<ProjectMembership>;
    removeMemberFromProject(projectId: number, userId: number, removedBy: number): Promise<void>;
    getProjectMembers(projectId: number): Promise<ProjectMembership[]>;
}

export class ProjectService implements IProjectService {
    private userRepository: UserRepository;
    private identityAccess: IdentityAccessModule;

    constructor(
        private projectRepository: IProjectRepository,
        private membershipRepository: IProjectMembershipRepository
    ) {
        this.userRepository = new UserRepository();
        this.identityAccess = createIdentityAccessModule();
    }

    async findById(id: number): Promise<Project | null> {
        return await this.projectRepository.findById(id);
    }

    async findAll(): Promise<Project[]> {
        return await this.projectRepository.findAll();
    }

    async findByUserId(userId: number): Promise<Project[]> {
        return await this.projectRepository.findByUserId(userId);
    }

    async findByCreatorId(creatorId: number): Promise<Project[]> {
        return await this.projectRepository.findByCreatorId(creatorId);
    }

    async create(
        data: Omit<IProject, 'id' | 'createdAt'| 'createdBy'>,
        creatorId: number,
        options?: CreateProjectOptions
    ): Promise<Project> {
        
        const project = Project.create({
            ...data,
            createdBy: creatorId
        });

        const createdProject = await this.projectRepository.create(project);
        
        const membership = ProjectMembership.create({
            projectId: createdProject.id!,
            userId: creatorId,
            roles: ['GERENTE_PROJETO']
        });

        await this.membershipRepository.create(membership);

        if (data.leaderId && data.leaderId !== creatorId) {
            await this.ensureProjectMembership(createdProject.id!, data.leaderId, ['GERENTE_PROJETO']);
        }

        if (options?.volunteerIds && options.volunteerIds.length > 0) {
            const normalizedVolunteers = Array.from(
                new Set(
                    options.volunteerIds
                        .filter(id => typeof id === 'number' && id > 0)
                )
            );

            for (const volunteerId of normalizedVolunteers) {
                if (volunteerId === creatorId || volunteerId === data.leaderId) {
                    continue;
                }

                try {
                    await this.ensureProjectMembership(createdProject.id!, volunteerId, ['VOLUNTARIO']);
                } catch (error) {
                    console.error(`Erro ao adicionar voluntário ${volunteerId} ao projeto ${createdProject.id}:`, error);
                }
            }
        }

        return createdProject;
    }

    private async ensureProjectMembership(projectId: number, userId: number, roles: UserRole[]): Promise<ProjectMembership> {
        const existingMembership = await this.membershipRepository.findByProjectAndUser(projectId, userId);
        const uniqueRoles = (values: UserRole[]) => Array.from(new Set(values)) as UserRole[];

        if (existingMembership) {
            const mergedRoles = uniqueRoles([...existingMembership.roles, ...roles]);
            existingMembership.setRoles(mergedRoles);
            return await this.membershipRepository.update(existingMembership);
        }

        const membership = ProjectMembership.create({
            projectId,
            userId,
            roles: uniqueRoles(roles),
        });

        return await this.membershipRepository.create(membership);
    }

    async update(id: number, data: Partial<IProject>, userId: number): Promise<Project> {
        
        const project = await this.projectRepository.findById(id);
        if (!project) {
            throw new Error('Projeto não encontrado');
        }

        const canManage = await this.canUserManageProject(id, userId);
        if (!canManage) {
            throw new Error('Usuário não tem permissão para gerenciar este projeto');
        }

        if (data.name !== undefined) {
            project.updateName(data.name);
        }
        if (data.description !== undefined) {
            project.updateDescription(data.description);
        }
        if (data.status !== undefined) {
            project.updateStatus(data.status);
        }
        if (data.links !== undefined) {
            project.updateLinks(data?.links!);
        }
        if (data.leaderId !== undefined) {
            // Validar se o novo líder não é líder de outro projeto
            if (data.leaderId !== null) {
                const existingLeaderProjects = await this.projectRepository.findByLeaderId(data.leaderId);
                const otherProjects = existingLeaderProjects.filter(p => p.id !== id);
                if (otherProjects.length > 0) {
                    throw new Error('Este usuário já é líder de outro projeto. Um usuário só pode ser líder de um projeto por vez.');
                }
            }
            project.updateLeader(data.leaderId);
        }
        
        const updatedProject = await this.projectRepository.update(project);

        return updatedProject;
    }

    async delete(id: number, userId: number): Promise<void> {
        const project = await this.projectRepository.findById(id);
        if (!project) {
            throw new Error('Projeto não encontrado');
        }

        const canManage = await this.canUserManageProject(id, userId);
        if (!canManage) {
            throw new Error('Usuário não tem permissão para excluir este projeto');
        }

        if (!project.canBeDeleted()) {
            throw new Error('Projeto não pode ser excluído no status atual');
        }

        await this.projectRepository.delete(id);
    }

    async canUserManageProject(projectId: number, userId: number): Promise<boolean> {
        const membership = await this.membershipRepository.findByProjectAndUser(projectId, userId);
        if (membership) {
            return membership.canManageProject();
        }
        
        const user = await this.userRepository.findById(userId);
        if (user) {
            return this.identityAccess.hasPermission(user.roles, 'MANAGE_USERS');
        }
        
        return false;
    }


    async addMemberToProject(projectId: number, userId: number, roles: UserRole[], addedBy: number): Promise<ProjectMembership> {
        const project = await this.projectRepository.findById(projectId);
        if (!project) {
            throw new Error('Projeto não encontrado');
        }

        const canManage = await this.canUserManageProject(projectId, addedBy);
        if (!canManage) {
            throw new Error('Usuário não tem permissão para adicionar membros a este projeto');
        }

        const existingMembership = await this.membershipRepository.findByProjectAndUser(projectId, userId);
        if (existingMembership) {
            throw new Error('Usuário já é membro deste projeto');
        }

        if (!roles || roles.length === 0) {
            throw new Error('Pelo menos um papel deve ser atribuído');
        }

        const membership = ProjectMembership.create({
            projectId,
            userId,
            roles
        });

        return await this.membershipRepository.create(membership);
    }

    async removeMemberFromProject(projectId: number, userId: number, removedBy: number): Promise<void> {
        const project = await this.projectRepository.findById(projectId);
        if (!project) {
            throw new Error('Projeto não encontrado');
        }

        const canManage = await this.canUserManageProject(projectId, removedBy);
        if (!canManage) {
            throw new Error('Usuário não tem permissão para remover membros deste projeto');
        }

        const membership = await this.membershipRepository.findByProjectAndUser(projectId, userId);
        if (!membership) {
            throw new Error('Usuário não é membro deste projeto');
        }

        if (membership.isProjectManager()) {
            const managers = await this.membershipRepository.getProjectManagers(projectId);
            if (managers.length <= 1) {
                throw new Error('Não é possível remover o último gerente do projeto');
            }
        }

        await this.membershipRepository.deleteByProjectAndUser(projectId, userId);
    }

    async getProjectMembers(projectId: number): Promise<ProjectMembership[]> {
        return await this.membershipRepository.getProjectMembersWithDetails(projectId);
    }

    async getVolunteersStats(projectId: number): Promise<{
        volunteers: any[];
        stats: {
            totalVolunteers: number;
            totalHours: number;
            completedTasks: number;
            totalPoints: number;
        };
    }> {
        const members = await this.membershipRepository.getProjectMembersWithDetails(projectId);
        const volunteersOnly = members.filter(member =>
            member.roles?.includes('VOLUNTARIO') || member.roles?.includes('COLABORADOR')
        );

        const volunteers = [];
        for (const member of volunteersOnly) {
            const totalSessions = await prisma.work_sessions.findMany({
                where: {
                    userId: member.userId,
                    projectId,
                    status: 'completed'
                },
                select: { duration: true }
            });

            const totalSeconds = totalSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
            const totalHours = totalSeconds / 3600;

            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
            weekStart.setHours(0, 0, 0, 0);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);

            const weekSessions = await prisma.work_sessions.findMany({
                where: {
                    userId: member.userId,
                    projectId,
                    status: 'completed',
                    startTime: {
                        gte: weekStart,
                        lte: weekEnd
                    }
                },
                select: { duration: true }
            });

            const weekSeconds = weekSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
            const currentWeekHours = weekSeconds / 3600;

            volunteers.push({
                id: member.userId,
                name: member.user?.name || 'Usuário',
                email: member.user?.email || '',
                avatar: member.user?.avatar,
                role: member.roles?.[0] || 'VOLUNTARIO',
                joinedAt: member.joinedAt,
                hoursWorked: Math.round(totalHours * 100) / 100,
                currentWeekHours: Math.round(currentWeekHours * 100) / 100,
                tasksCompleted: member.user?.completedTasks || 0,
                pointsEarned: member.user?.points || 0,
                status: 'active' as const,
                lastActivity: new Date().toISOString().split('T')[0]
            });
        }

        const totalVolunteers = volunteers.length;
        const totalHours = volunteers.reduce((sum, v) => sum + v.hoursWorked, 0);
        const completedTasks = volunteers.reduce((sum, v) => sum + v.tasksCompleted, 0);
        const totalPoints = volunteers.reduce((sum, v) => sum + v.pointsEarned, 0);

        return {
            volunteers,
            stats: {
                totalVolunteers,
                totalHours: Math.round(totalHours * 100) / 100,
                completedTasks,
                totalPoints
            }
        };
    }
}
