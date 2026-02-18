import { prisma } from '@/lib/database/prisma';
import { ProjectMembership, IProjectMembership } from '../models/ProjectMembership';
import { UserRole } from '@prisma/client';

export interface IProjectMembershipRepository {
    findById(id: number): Promise<ProjectMembership | null>;
    findByProjectId(projectId: number): Promise<ProjectMembership[]>;
    findByUserId(userId: number): Promise<ProjectMembership[]>;
    findByProjectAndUser(projectId: number, userId: number): Promise<ProjectMembership | null>;
    findByRole(role: UserRole): Promise<ProjectMembership[]>;
    findByProjectAndRole(projectId: number, role: UserRole): Promise<ProjectMembership[]>;
    create(membership: ProjectMembership): Promise<ProjectMembership>;
    update(membership: ProjectMembership): Promise<ProjectMembership>;
    delete(id: number): Promise<void>;
    deleteByProjectAndUser(projectId: number, userId: number): Promise<void>;
    exists(projectId: number, userId: number): Promise<boolean>;
    getProjectMembersWithDetails(projectId: number): Promise<ProjectMembership[]>;
    getProjectManagers(projectId: number): Promise<ProjectMembership[]>;
    getProjectStatistics(projectId: number): Promise<{
        totalMembers: number;
        managers: number;
        coordinators: number;
        laboratorists: number;
        researchers: number;
        collaborators: number;
        volunteers: number;
    }>;
}

export class ProjectMembershipRepository implements IProjectMembershipRepository {
    private getIncludeOptions() {
        return {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    roles: true,
                    status: true,
                    points: true,
                    completedTasks: true
                }
            },
            project: {
                select: {
                    id: true,
                    name: true,
                    status: true,
                    createdBy: true
                }
            }
        };
    }

    async findById(id: number): Promise<ProjectMembership | null> {
        const membership = await prisma.project_members.findUnique({
            where: { id },
            include: this.getIncludeOptions()
        });

        return membership ? ProjectMembership.fromPrisma(membership) : null;
    }

    async findByProjectId(projectId: number): Promise<ProjectMembership[]> {
        const memberships = await prisma.project_members.findMany({
            where: { projectId },
            include: this.getIncludeOptions(),
            orderBy: { joinedAt: 'asc' }
        });

        return memberships.map(membership => ProjectMembership.fromPrisma(membership));
    }

    async findByUserId(userId: number): Promise<ProjectMembership[]> {
        const memberships = await prisma.project_members.findMany({
            where: { userId },
            include: this.getIncludeOptions(),
            orderBy: { joinedAt: 'desc' }
        });

        return memberships.map(membership => ProjectMembership.fromPrisma(membership));
    }

    async findByProjectAndUser(projectId: number, userId: number): Promise<ProjectMembership | null> {
        const membership = await prisma.project_members.findUnique({
            where: {
                projectId_userId: {
                    projectId,
                    userId
                }
            },
            include: this.getIncludeOptions()
        });

        return membership ? ProjectMembership.fromPrisma(membership) : null;
    }

    async findByRole(role: UserRole): Promise<ProjectMembership[]> {
        const memberships = await prisma.project_members.findMany({
            where: {
                roles: {
                    has: role
                }
            },
            include: this.getIncludeOptions(),
            orderBy: { joinedAt: 'desc' }
        });

        return memberships.map(membership => ProjectMembership.fromPrisma(membership));
    }

    async findByProjectAndRole(projectId: number, role: UserRole): Promise<ProjectMembership[]> {
        const memberships = await prisma.project_members.findMany({
            where: {
                projectId,
                roles: {
                    has: role
                }
            },
            include: this.getIncludeOptions(),
            orderBy: { joinedAt: 'asc' }
        });

        return memberships.map(membership => ProjectMembership.fromPrisma(membership));
    }

    async create(membership: ProjectMembership): Promise<ProjectMembership> {
        const errors = this.validateMembership(membership);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const membershipData = membership.toJSON();
        const createdMembership = await prisma.project_members.create({
            data: {
                projectId: membershipData.projectId,
                userId: membershipData.userId,
                joinedAt: membershipData.joinedAt,
                roles: membershipData.roles
            },
            include: this.getIncludeOptions()
        });

        return ProjectMembership.fromPrisma(createdMembership);
    }

    async update(membership: ProjectMembership): Promise<ProjectMembership> {
        if (!membership.id) {
            throw new Error('ID da participação é obrigatório para atualização');
        }

        const errors = this.validateMembership(membership);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const membershipData = membership.toJSON();
        const updatedMembership = await prisma.project_members.update({
            where: { id: membership.id },
            data: {
                roles: membershipData.roles
            },
            include: this.getIncludeOptions()
        });

        return ProjectMembership.fromPrisma(updatedMembership);
    }

    async delete(id: number): Promise<void> {
        await prisma.project_members.delete({
            where: { id }
        });
    }

    async deleteByProjectAndUser(projectId: number, userId: number): Promise<void> {
        await prisma.project_members.delete({
            where: {
                projectId_userId: {
                    projectId,
                    userId
                }
            }
        });
    }

    async exists(projectId: number, userId: number): Promise<boolean> {
        const count = await prisma.project_members.count({
            where: {
                projectId,
                userId
            }
        });
        return count > 0;
    }

    async getProjectMembersWithDetails(projectId: number): Promise<ProjectMembership[]> {
        const memberships = await prisma.project_members.findMany({
            where: { projectId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        roles: true,
                        status: true,
                        points: true,
                        completedTasks: true,
                        avatar: true,
                        bio: true
                    }
                },
                project: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        createdBy: true
                    }
                }
            },
            orderBy: { joinedAt: 'asc' }
        });

        return memberships.map(membership => ProjectMembership.fromPrisma(membership));
    }

    async getProjectManagers(projectId: number): Promise<ProjectMembership[]> {
        const memberships = await prisma.project_members.findMany({
            where: {
                projectId,
                roles: {
                    hasSome: ['COORDENADOR', 'GERENTE', 'GERENTE_PROJETO']
                }
            },
            include: this.getIncludeOptions(),
            orderBy: { joinedAt: 'asc' }
        });

        return memberships.map(membership => ProjectMembership.fromPrisma(membership));
    }

    private validateMembership(membership: ProjectMembership): string[] {
        const errors: string[] = [];

        if (!membership.projectId || membership.projectId <= 0) {
            errors.push('ID do projeto é obrigatório');
        }

        if (!membership.userId || membership.userId <= 0) {
            errors.push('ID do usuário é obrigatório');
        }

        if (!membership.roles || membership.roles.length === 0) {
            errors.push('Pelo menos um papel deve ser atribuído');
        }

        return errors;
    }

    async getProjectStatistics(projectId: number): Promise<{
        totalMembers: number;
        managers: number;
        coordinators: number;
        laboratorists: number;
        researchers: number;
        collaborators: number;
        volunteers: number;
    }> {
        const [
            totalMembers,
            managers,
            coordinators,
            laboratorists,
            researchers,
            collaborators,
            volunteers
        ] = await Promise.all([
            prisma.project_members.count({ where: { projectId } }),
            prisma.project_members.count({
                where: {
                    projectId,
                    roles: { has: 'GERENTE' }
                }
            }),
            prisma.project_members.count({
                where: {
                    projectId,
                    roles: { has: 'COORDENADOR' }
                }
            }),
            prisma.project_members.count({
                where: {
                    projectId,
                    roles: { has: 'LABORATORISTA' }
                }
            }),
            prisma.project_members.count({
                where: {
                    projectId,
                    roles: { has: 'PESQUISADOR' }
                }
            }),
            prisma.project_members.count({
                where: {
                    projectId,
                    roles: { has: 'COLABORADOR' }
                }
            }),
            prisma.project_members.count({
                where: {
                    projectId,
                    roles: { has: 'VOLUNTARIO' }
                }
            })
        ]);

        return {
            totalMembers,
            managers,
            coordinators,
            laboratorists,
            researchers,
            collaborators,
            volunteers
        };
    }
}
