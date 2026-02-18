import { projects } from '@prisma/client';

export interface IProject {
    id?: number;
    name: string;
    description?: string | null;
    createdAt: string;
    createdBy: number;
    leaderId?: number | null;
    status: ProjectStatus;
    links?: ProjectLink[] | null;
}

export interface ProjectLink {
    label: string;
    url: string;
}

export enum ProjectStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    ARCHIVED = 'archived',
    ON_HOLD = 'on_hold'
}

export class Project {
    public id?: number;
    public name: string;
    public description?: string | null;
    public createdAt: string;
    public createdBy: number;
    public leaderId?: number | null;
    public status: ProjectStatus;
    public links?: ProjectLink[] | null;

    constructor(data: IProject) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.createdAt = data.createdAt;
        this.createdBy = data.createdBy;
        this.leaderId = data.leaderId;
        this.status = data.status;
        this.links = data.links;
    }

    toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            createdAt: this.createdAt,
            createdBy: this.createdBy,
            leaderId: this.leaderId,
            status: this.status,
            links: this.links,
        };
    }

    static fromPrisma(data: projects): Project {
        return new Project({
            id: data.id,
            name: data.name,
            description: data.description,
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            leaderId: data.leaderId,
            status: data.status as ProjectStatus,
            links: data.links ? (data.links as unknown as ProjectLink[]) : null,
        });
    }

    static create(data: Omit<IProject, 'id' | 'createdAt'>): Project {
        return new Project({
            ...data,
            createdAt: new Date().toISOString(),
        });
    }
}
