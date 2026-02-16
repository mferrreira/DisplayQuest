import { UserRole } from '@prisma/client';

export interface IProjectMembership {
    id?: number;
    projectId: number;
    userId: number;
    joinedAt?: Date;
    roles: UserRole[];
    user?: any;
    project?: any;
}

export class ProjectMembership {
    public id?: number;
    public projectId: number;
    public userId: number;
    public joinedAt: Date;
    public roles: UserRole[];
    public user?: any;
    public project?: any;

    constructor(data: IProjectMembership) {
        this.id = data.id;
        this.projectId = data.projectId;
        this.userId = data.userId;
        this.joinedAt = data.joinedAt || new Date();
        this.roles = data.roles || [];
        this.user = data.user;
        this.project = data.project;
    }

    toJSON(): any {
        return {
            id: this.id,
            projectId: this.projectId,
            userId: this.userId,
            joinedAt: this.joinedAt,
            roles: this.roles,
            user: this.user,
            project: this.project,
        };
    }

    static fromPrisma(data: any): ProjectMembership {
        return new ProjectMembership({
            id: data.id,
            projectId: data.projectId,
            userId: data.userId,
            joinedAt: data.joinedAt,
            roles: data.roles,
            user: data.user,
            project: data.project,
        });
    }

    static create(data: Omit<IProjectMembership, 'id' | 'joinedAt'>): ProjectMembership {
        return new ProjectMembership({
            ...data,
            joinedAt: new Date(),
        });
    }
}
